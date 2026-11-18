"""Switch platform for Chuangmi Liberator WebRTC."""
import logging
from typing import Any
from homeassistant.components.switch import SwitchEntity
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

SWITCH_TYPES = [
    ("power", "mdi:power"),
    ("light", "mdi:led-on"),
    ("flip", "mdi:flip-vertical"),
    ("watermark", "mdi:clock-digital"),
    ("wdr", "mdi:brightness-6"),
    ("full_color", "mdi:palette"),
    ("motion_record", "mdi:motion-sensor"),
]

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

    all_switches = []
    for c in cameras_raw:
        ip = c.get(CONF_CAMERA_IP, "")
        token = c.get(CONF_CAMERA_TOKEN, "")
        did = str(c.get(CONF_CAMERA_DID, ""))
        model = c.get(CONF_CAMERA_MODEL, "chuangmi.camera.ipc019e")
        name = c.get("name") or f"Camera {did}"

        if not ip or not token or not did:
            continue

        for prop_name, icon in SWITCH_TYPES:
            all_switches.append(
                ChuangmiSwitch(hass, did, name, ip, token, model, prop_name, icon)
            )

    if all_switches:
        async_add_entities(all_switches, update_before_add=True)


class ChuangmiSwitch(SwitchEntity):
    _attr_has_entity_name = True

    def __init__(
        self,
        hass: HomeAssistant,
        did: str,
        device_name: str,
        ip: str,
        token: str,
        model: str,
        prop_name: str,
        icon: str
    ):
        self.hass = hass
        self._did = did
        self._device_name = device_name
        self._ip = ip
        self._token = token
        self._model = model
        self._prop_name = prop_name
        self._attr_translation_key = prop_name
        self._attr_unique_id = f"{DOMAIN}_{did}_{prop_name}"
        self._attr_icon = icon
        self._attr_is_on = True

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

    async def async_turn_on(self, **kwargs: Any) -> None:
        cmd = f"set_{self._prop_name}"
        await self.hass.async_add_executor_job(
            XiaomiClient.send_local_miio,
            self._ip,
            self._token,
            cmd,
            ["on"]
        )
        self._attr_is_on = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        cmd = f"set_{self._prop_name}"
        await self.hass.async_add_executor_job(
            XiaomiClient.send_local_miio,
            self._ip,
            self._token,
            cmd,
            ["off"]
        )
        self._attr_is_on = False
        self.async_write_ha_state()

    async def async_update(self) -> None:
        """Fetch local status via miIO."""
        try:
            res = await self.hass.async_add_executor_job(
                XiaomiClient.send_local_miio,
                self._ip,
                self._token,
                "get_prop",
                [self._prop_name]
            )
            if isinstance(res, list) and len(res) > 0:
                self._attr_is_on = (res[0] == "on")
        except Exception as e:
            _LOGGER.debug("Error updating %s for camera %s: %s", self._prop_name, self._did, e)
