"""Button platform for Chuangmi Liberator WebRTC."""
import asyncio
import logging
from homeassistant.components.button import ButtonEntity, ButtonDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo

from .const import (
    DOMAIN,
    CONF_CAMERA_DID,
    CONF_CAMERA_IP,
    CONF_CAMERA_TOKEN,
    CONF_CAMERA_MODEL,
    CONF_CAMERAS
)
from .xiaomi_client import XiaomiClient

_LOGGER = logging.getLogger(__name__)

PTZ_DIRECTIONS = [
    ("ptz_up", "mdi:arrow-up-bold", 3),
    ("ptz_down", "mdi:arrow-down-bold", 4),
    ("ptz_left", "mdi:arrow-left-bold", 1),
    ("ptz_right", "mdi:arrow-right-bold", 2),
]

_PTZ_LOCKS = {}


def _get_ptz_lock(ip: str) -> asyncio.Lock:
    if ip not in _PTZ_LOCKS:
        _PTZ_LOCKS[ip] = asyncio.Lock()
    return _PTZ_LOCKS[ip]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities):
    data = hass.data[DOMAIN][entry.entry_id]
    entry_data = data["entry_data"]

    cameras_raw = entry_data.get(CONF_CAMERAS)
    if not cameras_raw:
        cameras_raw = [{
            CONF_CAMERA_DID: entry_data.get(CONF_CAMERA_DID, ""),
            CONF_CAMERA_IP: entry_data.get(CONF_CAMERA_IP, ""),
            CONF_CAMERA_TOKEN: entry_data.get(CONF_CAMERA_TOKEN, ""),
            CONF_CAMERA_MODEL: entry_data.get(CONF_CAMERA_MODEL, "chuangmi.camera.ipc019e"),
            "name": entry.title
        }]

    buttons = []
    for c in cameras_raw:
        ip = c.get(CONF_CAMERA_IP, "")
        token = c.get(CONF_CAMERA_TOKEN, "")
        did = str(c.get(CONF_CAMERA_DID, ""))
        model = c.get(CONF_CAMERA_MODEL, "chuangmi.camera.ipc019e")
        name = c.get("name") or f"Camera {did}"

        if not ip or not token or not did:
            continue

        buttons.append(
            ChuangmiRestartButton(hass, did, name, ip, token, model)
        )

        for dir_key, dir_icon, op_code in PTZ_DIRECTIONS:
            buttons.append(
                ChuangmiPTZButton(hass, did, name, ip, token, model, dir_key, dir_icon, op_code)
            )

    if buttons:
        async_add_entities(buttons, update_before_add=False)


class ChuangmiRestartButton(ButtonEntity):
    _attr_has_entity_name = True
    _attr_device_class = ButtonDeviceClass.RESTART
    _attr_translation_key = "restart"

    def __init__(
        self,
        hass: HomeAssistant,
        did: str,
        device_name: str,
        ip: str,
        token: str,
        model: str,
    ):
        self.hass = hass
        self._did = did
        self._device_name = device_name
        self._ip = ip
        self._token = token
        self._model = model
        self._attr_unique_id = f"{DOMAIN}_{did}_restart"
        self._attr_icon = "mdi:restart"

    @property
    def extra_state_attributes(self) -> dict:
        return {"did": self._did}

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._did)},
            name=self._device_name,
            manufacturer="Chuangmi / Xiaomi",
            model=self._model,
        )

    async def async_press(self) -> None:
        """Handle the button press to restart camera daemons."""
        _LOGGER.info("Sending restart command to camera %s (%s)...", self._did, self._ip)
        try:
            res = await self.hass.async_add_executor_job(
                XiaomiClient.send_local_miio,
                self._ip,
                self._token,
                "restart_device",
                []
            )
            _LOGGER.info("restart_device response: %s", res)
        except Exception as err:
            _LOGGER.error("Error restarting camera via miIO: %s", err)


class ChuangmiPTZButton(ButtonEntity):
    _attr_has_entity_name = True

    def __init__(
        self,
        hass: HomeAssistant,
        did: str,
        device_name: str,
        ip: str,
        token: str,
        model: str,
        dir_key: str,
        icon: str,
        op_code: int
    ):
        self.hass = hass
        self._did = did
        self._device_name = device_name
        self._ip = ip
        self._token = token
        self._model = model
        self._dir_key = dir_key
        self._op_code = op_code
        self._attr_translation_key = dir_key
        self._attr_unique_id = f"{DOMAIN}_{did}_{dir_key}"
        self._attr_icon = icon

    @property
    def extra_state_attributes(self) -> dict:
        return {"did": self._did}

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._did)},
            name=self._device_name,
            manufacturer="Chuangmi / Xiaomi",
            model=self._model,
        )

    async def async_press(self) -> None:
        """Handle PTZ movement command with serialized locking to prevent packet collisions."""
        lock = _get_ptz_lock(self._ip)
        _LOGGER.debug("Sending PTZ command %s (op=%d) to %s...", self._dir_key, self._op_code, self._ip)
        async with lock:
            try:
                res = await self.hass.async_add_executor_job(
                    XiaomiClient.send_local_miio,
                    self._ip,
                    self._token,
                    "set_motor",
                    {"operation": self._op_code}
                )
                _LOGGER.debug("PTZ %s response from %s: %s", self._dir_key, self._ip, res)
                # Brief pause so rapid repeated presses don't flood UDP socket
                await asyncio.sleep(0.04)
            except Exception as err:
                _LOGGER.error("Error sending PTZ command to camera %s: %s", self._ip, err)
