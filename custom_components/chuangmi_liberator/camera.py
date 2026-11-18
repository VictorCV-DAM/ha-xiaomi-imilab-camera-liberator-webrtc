"""Camera platform for Xiaomi & Imilab Camera Liberator (WebRTC & PTZ)."""
import asyncio
import logging
import os
from typing import Optional
import aiohttp
import yaml

from homeassistant.components.camera import (
    Camera,
    CameraEntityFeature,
    StreamType,
)

try:
    from homeassistant.components.camera import (
        WebRTCAnswer,
        WebRTCError,
        WebRTCSendMessage,
    )
except ImportError:
    WebRTCAnswer = None
    WebRTCError = None
    WebRTCSendMessage = None

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity import DeviceInfo

from .const import (
    DOMAIN,
    NAME,
    CONF_CAMERA_DID,
    CONF_CAMERA_IP,
    CONF_CAMERA_TOKEN,
    CONF_CAMERA_MODEL,
    CONF_CAMERAS,
    CONF_SERVER_COUNTRY,
    CONF_USERNAME,
    DEFAULT_API_PORT,
    DEFAULT_RTSP_PORT,
)
from .xiaomi_client import XiaomiClient

_LOGGER = logging.getLogger(__name__)


def _load_go2rtc_auth_sync(cfg_path: str) -> Optional[aiohttp.BasicAuth]:
    """Read credentials from go2rtc.yaml in an executor thread if exists."""
    try:
        if os.path.isfile(cfg_path):
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f)
                api = cfg.get("api", {}) if isinstance(cfg, dict) else {}
                u = api.get("username")
                p = api.get("password")
                if u and p:
                    return aiohttp.BasicAuth(str(u), str(p))
    except Exception as err:
        _LOGGER.debug("Error reading go2rtc.yaml credentials: %s", err)
    return None


def _load_stored_user_id_sync(storage_dir: str) -> str:
    """Read stored user ID from xiaomi_miot storage files."""
    try:
        if os.path.isdir(storage_dir):
            for filename in os.listdir(storage_dir):
                if filename.startswith("devices-") and filename.endswith(".json"):
                    parts = filename.replace("devices-", "").replace(".json", "").split("-")
                    if parts and parts[0].isdigit():
                        return parts[0]
                elif filename.startswith("auth-") and filename.endswith(".json"):
                    parts = filename.replace("auth-", "").replace(".json", "").split("-")
                    if parts and parts[0].isdigit():
                        return parts[0]
    except Exception as err:
        _LOGGER.debug("Error reading stored user ID: %s", err)
    return ""


def _load_fallback_image_sync(fallback_path: str) -> Optional[bytes]:
    """Load cached fallback poster frame."""
    try:
        if os.path.isfile(fallback_path):
            with open(fallback_path, "rb") as f:
                return f.read()
    except Exception:
        pass
    return None


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities
):
    data = hass.data[DOMAIN][entry.entry_id]
    entry_data = data["entry_data"]
    client: XiaomiClient = data["client"]
    api_port = data.get("api_port", DEFAULT_API_PORT)
    rtsp_port = data.get("rtsp_port", DEFAULT_RTSP_PORT)

    go2rtc_cfg = hass.config.path("go2rtc.yaml")
    go2rtc_auth = await hass.async_add_executor_job(_load_go2rtc_auth_sync, go2rtc_cfg)

    storage_dir = hass.config.path(".storage", "xiaomi_miot")
    user_id = entry_data.get(CONF_USERNAME)
    if not user_id or not str(user_id).isdigit():
        user_id = await hass.async_add_executor_job(_load_stored_user_id_sync, storage_dir)

    fallback_bytes = await hass.async_add_executor_job(
        _load_fallback_image_sync, os.path.join(os.path.dirname(__file__), "snapshot_fallback.jpg")
    )

    cameras_raw = entry_data.get(CONF_CAMERAS)
    if not cameras_raw:
        cameras_raw = [{
            CONF_CAMERA_DID: entry_data.get(CONF_CAMERA_DID, ""),
            CONF_CAMERA_IP: entry_data.get(CONF_CAMERA_IP, ""),
            CONF_CAMERA_TOKEN: entry_data.get(CONF_CAMERA_TOKEN, ""),
            CONF_CAMERA_MODEL: entry_data.get(CONF_CAMERA_MODEL, "chuangmi.camera.ipc019e"),
            "name": entry.title
        }]

    camera_entities = []
    for c in cameras_raw:
        did = str(c.get(CONF_CAMERA_DID, ""))
        if not did:
            continue
        cam_entity = ChuangmiLiberatorCamera(
            hass=hass,
            client=client,
            did=did,
            name=c.get("name") or f"Cámara {did}",
            ip=c.get(CONF_CAMERA_IP, ""),
            token=c.get(CONF_CAMERA_TOKEN, ""),
            model=c.get(CONF_CAMERA_MODEL, "chuangmi.camera.ipc019e"),
            country=entry_data.get(CONF_SERVER_COUNTRY, "de"),
            unique_id=f"{DOMAIN}_{did}_camera",
            go2rtc_auth=go2rtc_auth,
            user_id=user_id,
            fallback_image=fallback_bytes,
            api_port=api_port,
            rtsp_port=rtsp_port
        )
        camera_entities.append(cam_entity)

    async_add_entities(camera_entities, update_before_add=True)


class ChuangmiLiberatorCamera(Camera):
    _attr_has_entity_name = True
    _attr_name = None

    def __init__(
        self,
        hass: HomeAssistant,
        client: XiaomiClient,
        did: str,
        name: str,
        ip: str,
        token: str,
        model: str,
        country: str,
        unique_id: str,
        go2rtc_auth: Optional[aiohttp.BasicAuth] = None,
        user_id: Optional[str] = None,
        fallback_image: Optional[bytes] = None,
        api_port: int = DEFAULT_API_PORT,
        rtsp_port: int = DEFAULT_RTSP_PORT
    ):
        super().__init__()
        self.hass = hass
        self._client = client
        self._did = did
        self._name = name
        self._device_name = name
        self._ip = ip
        self._token = token
        self._model = model
        self._country = country
        self._attr_unique_id = unique_id
        self._go2rtc_auth = go2rtc_auth
        self._stored_user_id = user_id
        self._fallback_image = fallback_image
        self._last_image: Optional[bytes] = fallback_image
        self._api_port = api_port
        self._rtsp_port = rtsp_port
        self._api_url = f"http://127.0.0.1:{api_port}"
        self._attr_is_on = True
        self._attr_supported_features = CameraEntityFeature.STREAM

    @property
    def unique_id(self) -> str:
        """Return the unique ID of the camera."""
        return self._attr_unique_id

    @property
    def use_stream_for_stills(self) -> bool:
        """Use stream snapshot for still frames."""
        return False

    @property
    def is_streaming(self) -> bool:
        """Report camera as actively streaming."""
        return True

    @property
    def state(self) -> str:
        """Return the state of the camera."""
        if not self._attr_is_on:
            return "off"
        return "streaming"

    @property
    def extra_state_attributes(self) -> dict:
        """Return device-specific attributes for Lovelace card and automations."""
        return {
            "did": self._did,
            "model": self._model,
            "stream_name": f"chuangmi_{self._did}",
            "brand": "Xiaomi & Imilab Camera Liberator (WebRTC & PTZ)",
        }

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._did)},
            name=self._device_name,
            manufacturer="Xiaomi / Imilab / Chuangmi",
            model=self._model,
            sw_version="CloudRTC v1.0",
        )

    async def async_camera_image(
        self, width: Optional[int] = None, height: Optional[int] = None
    ) -> Optional[bytes]:
        """Return stable cached snapshot or fallback image to prevent TUTK stream packet drops."""
        if self._last_image:
            return self._last_image
        if self._fallback_image:
            return self._fallback_image
        return None

    async def stream_source(self) -> Optional[str]:
        """Provide low-latency stream url registered in go2rtc."""
        stream_name = f"chuangmi_{self._did}"
        user_id = self._stored_user_id or "admin"
        stream_url = f"xiaomi://{user_id}:{self._country}@{self._ip}?did={self._did}&model={self._model}&subtype=0"

        await self._async_inject_go2rtc(stream_name, stream_url)

        auth = self._go2rtc_auth
        if auth and auth.login and auth.password:
            rtsp = f"rtsp://{auth.login}:{auth.password}@127.0.0.1:{self._rtsp_port}/{stream_name}#transport=tcp"
        else:
            rtsp = f"rtsp://127.0.0.1:{self._rtsp_port}/{stream_name}#transport=tcp"
        return rtsp

    async def _async_inject_go2rtc(self, name: str, src: str):
        """Register the native stream into go2rtc API."""
        session = async_get_clientsession(self.hass)
        auth = self._go2rtc_auth
        params = [("name", name), ("src", src)]
        url = f"{self._api_url}/api/streams"
        try:
            async with session.put(url, params=params, auth=auth, timeout=3) as resp:
                if resp.status in [200, 201]:
                    _LOGGER.info("Successfully registered native stream %s into go2rtc", name)
        except Exception as e:
            _LOGGER.warning("Could not automatically register stream %s into go2rtc: %s", name, e)

    @property
    def is_on(self) -> bool:
        return self._attr_is_on

    async def async_update(self) -> None:
        """Update power state via local miIO if configured."""
        if self._ip and self._token:
            try:
                res = await self.hass.async_add_executor_job(
                    XiaomiClient.send_local_miio,
                    self._ip,
                    self._token,
                    "get_prop",
                    ["power"]
                )
                if isinstance(res, list) and len(res) > 0:
                    self._attr_is_on = (res[0] == "on")
            except Exception as e:
                _LOGGER.debug("Error checking power state for camera %s: %s", self._did, e)
