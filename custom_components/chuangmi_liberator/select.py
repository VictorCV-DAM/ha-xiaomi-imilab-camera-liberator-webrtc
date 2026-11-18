"""Select platform for Chuangmi Liberator WebRTC."""
import logging
from homeassistant.components.select import SelectEntity
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

OPTIONS_MAP = {
    "auto": "0",
    "always_on": "1",
    "off": "2"
}
REVERSE_MAP = {v: k for k, v in OPTIONS_MAP.items()}

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

    selects = []
    for c in cameras_raw:
        ip = c.get(CONF_CAMERA_IP, "")
        token = c.get(CONF_CAMERA_TOKEN, "")
        did = str(c.get(CONF_CAMERA_DID, ""))
        model = c.get(CONF_CAMERA_MODEL, "chuangmi.camera.ipc019e")
        name = c.get("name") or f"Camera {did}"

        if not ip or not token or not did:
            continue

        selects.append(ChuangmiNightModeSelect(hass, did, name, ip, token, model))

    if selects:
        async_add_entities(selects, update_before_add=True)


class ChuangmiNightModeSelect(SelectEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "night_mode"

    def __init__(self, hass: HomeAssistant, did: str, device_name: str, ip: str, token: str, model: str):
        self.hass = hass
        self._did = did
        self._device_name = device_name
        self._ip = ip
        self._token = token
        self._model = model
        self._attr_unique_id = f"{DOMAIN}_{did}_night_mode"
        self._attr_icon = "mdi:weather-night"
        self._attr_options = ["auto", "always_on", "off"]
        self._attr_current_option = "auto"

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

    async def async_select_option(self, option: str) -> None:
        """Change night shot mode."""
        mode_val = OPTIONS_MAP.get(option, "0")
        try:
            await self.hass.async_add_executor_job(
                XiaomiClient.send_local_miio,
                self._ip,
                self._token,
                "set_night_mode",
                [mode_val]
            )
            self._attr_current_option = option
            self.async_write_ha_state()
        except Exception as e:
            _LOGGER.error("Failed to set night mode: %s", e)

    async def async_update(self) -> None:
        """Fetch local status via miIO."""
        try:
            res = await self.hass.async_add_executor_job(
                XiaomiClient.send_local_miio,
                self._ip,
                self._token,
                "get_prop",
                ["night_mode"]
            )
            if isinstance(res, list) and len(res) > 0:
                self._attr_current_option = REVERSE_MAP.get(str(res[0]), "auto")
        except Exception as e:
            _LOGGER.debug("Error updating night mode for camera %s: %s", self._did, e)
