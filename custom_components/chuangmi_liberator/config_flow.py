"""Config flow for Chuangmi Liberator WebRTC."""
import json
import logging
import os
from typing import Any, Dict, List, Optional
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    DOMAIN,
    CONF_USERNAME,
    CONF_PASSWORD,
    CONF_SERVER_COUNTRY,
    CONF_CAMERA_DID,
    CONF_CAMERA_IP,
    CONF_CAMERA_TOKEN,
    CONF_CAMERA_MODEL,
    CONF_CAMERAS,
    DEFAULT_COUNTRY,
    SERVER_COUNTRIES
)
from .xiaomi_client import XiaomiClient

_LOGGER = logging.getLogger(__name__)


async def async_autodetect_all_cameras(hass) -> List[Dict[str, Any]]:
    """Auto-detect all cameras from Home Assistant states and Xiaomi local storage."""
    detected_list: List[Dict[str, Any]] = []
    seen_dids = set()

    # 1. Inspect .storage/xiaomi_miot for all cached camera credentials
    try:
        storage_dir = hass.config.path(".storage", "xiaomi_miot")
        if os.path.isdir(storage_dir):
            for filename in os.listdir(storage_dir):
                if filename.startswith("devices-") and filename.endswith(".json"):
                    filepath = os.path.join(storage_dir, filename)
                    try:
                        with open(filepath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            devices = data.get("data", {}).get("devices", [])
                            for d in devices:
                                model = str(d.get("model", "")).lower()
                                did = str(d.get("did", ""))
                                if did and did not in seen_dids and ("camera" in model or "chuangmi" in model or "cateye" in model):
                                    seen_dids.add(did)
                                    detected_list.append({
                                        "did": did,
                                        "token": str(d.get("token", "")),
                                        "model": str(d.get("model", "chuangmi.camera.ipc019e")),
                                        "name": d.get("name") or f"Camera {did}",
                                        "mac": str(d.get("mac", "")).upper().replace("-", ":"),
                                        "localip": str(d.get("localip", "")),
                                    })
                    except Exception as err:
                        _LOGGER.warning("Could not parse %s for camera autodetection: %s", filepath, err)
    except Exception as err:
        _LOGGER.warning("Autodetection storage check error: %s", err)

    # 2. Check active device_tracker entities in Home Assistant to update live DHCP IPs
    try:
        trackers = hass.states.async_all("device_tracker")
        for cam in detected_list:
            cam_mac = cam.get("mac", "")
            cam_did = cam.get("did", "")
            for state in trackers:
                attrs = state.attributes or {}
                entity_id = state.entity_id.lower()
                host_name = str(attrs.get("host_name", "")).lower()
                mac = str(attrs.get("mac", "")).upper().replace("-", ":")

                is_match = False
                if cam_mac and mac and mac == cam_mac:
                    is_match = True
                elif cam_did in entity_id or cam_did in host_name:
                    is_match = True

                if is_match:
                    live_ip = attrs.get("ip") or attrs.get("ip_address")
                    if live_ip:
                        cam["localip"] = str(live_ip)
                        _LOGGER.info("Autodetected live IP %s for camera %s", live_ip, cam["name"])
                        break
    except Exception as err:
        _LOGGER.warning("Autodetection tracker check error: %s", err)

    return detected_list


class ChuangmiLiberatorConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self):
        self.client: Optional[XiaomiClient] = None
        self.account_data: Dict[str, Any] = {}
        self.devices: List[Dict[str, Any]] = []

    async def async_step_user(self, user_input: Optional[Dict[str, Any]] = None):
        errors = {}
        if user_input is not None:
            username = user_input.get(CONF_USERNAME, "").strip()
            password = user_input.get(CONF_PASSWORD, "").strip()

            # If user leaves credentials blank, auto-discover locally from Home Assistant
            if not username or not password:
                self.account_data = {
                    CONF_USERNAME: "",
                    CONF_PASSWORD: "",
                    CONF_SERVER_COUNTRY: user_input.get(CONF_SERVER_COUNTRY, DEFAULT_COUNTRY),
                }
                local_cams = await async_autodetect_all_cameras(self.hass)
                if local_cams:
                    self.devices = local_cams
                    return await self.async_step_select_camera()
                return await self.async_step_manual()

            session = async_get_clientsession(self.hass)
            self.client = XiaomiClient(
                username=username,
                password=password,
                country=user_input.get(CONF_SERVER_COUNTRY, DEFAULT_COUNTRY),
                session=session
            )
            success = await self.client.async_login()
            if success:
                self.account_data = user_input
                raw_devices = await self.client.async_get_devices()
                # Filter for camera models
                self.devices = [
                    d for d in raw_devices
                    if "camera" in str(d.get("model", "")).lower() or "chuangmi" in str(d.get("model", "")).lower() or "cateye" in str(d.get("model", "")).lower()
                ]
                if not self.devices:
                    # Fallback to local discovery or manual
                    local_cams = await async_autodetect_all_cameras(self.hass)
                    if local_cams:
                        self.devices = local_cams
                        return await self.async_step_select_camera()
                    return await self.async_step_manual()

                return await self.async_step_select_camera()
            errors["base"] = "invalid_auth"

        schema = vol.Schema({
            vol.Optional(CONF_USERNAME, default=""): str,
            vol.Optional(CONF_PASSWORD, default=""): str,
            vol.Required(CONF_SERVER_COUNTRY, default=DEFAULT_COUNTRY): vol.In(SERVER_COUNTRIES)
        })

        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    async def async_step_select_camera(self, user_input: Optional[Dict[str, Any]] = None):
        errors = {}
        if user_input is not None:
            selected_dids = user_input.get(CONF_CAMERAS, [])
            if not selected_dids:
                errors["base"] = "required"
            else:
                cameras_data = []
                for did in selected_dids:
                    d = next((item for item in self.devices if str(item.get("did")) == str(did)), {})
                    cameras_data.append({
                        CONF_CAMERA_DID: str(did),
                        CONF_CAMERA_IP: d.get("localip", ""),
                        CONF_CAMERA_TOKEN: d.get("token", ""),
                        CONF_CAMERA_MODEL: d.get("model", "chuangmi.camera.ipc019e"),
                        "name": d.get("name") or f"Camera {did}",
                    })

                entry_data = {
                    **self.account_data,
                    CONF_CAMERAS: cameras_data
                }

                num = len(cameras_data)
                suffix = "s" if num > 1 else ""
                title = f"Chuangmi Liberator ({num} cámara{suffix})"

                user_id = self.account_data.get(CONF_USERNAME) or "local"
                await self.async_set_unique_id(f"{DOMAIN}_{user_id}")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=title, data=entry_data)

        camera_options = {
            str(d.get("did")): f"{d.get('name', 'Camera')} ({d.get('model', 'unknown')}) - IP: {d.get('localip', 'N/A')}"
            for d in self.devices
        }

        schema = vol.Schema({
            vol.Required(CONF_CAMERAS, default=list(camera_options.keys())): cv.multi_select(camera_options),
        })

        return self.async_show_form(step_id="select_camera", data_schema=schema, errors=errors)

    async def async_step_manual(self, user_input: Optional[Dict[str, Any]] = None):
        errors = {}
        if user_input is not None:
            did = str(user_input.get(CONF_CAMERA_DID, "")).strip()
            ip = str(user_input.get(CONF_CAMERA_IP, "")).strip()
            token = str(user_input.get(CONF_CAMERA_TOKEN, "")).strip()
            model = str(user_input.get(CONF_CAMERA_MODEL, "chuangmi.camera.ipc019e")).strip()

            if not did:
                errors[CONF_CAMERA_DID] = "required"
            if not ip:
                errors[CONF_CAMERA_IP] = "required"
            if not token:
                errors[CONF_CAMERA_TOKEN] = "required"

            if not errors:
                cameras_data = [{
                    CONF_CAMERA_DID: did,
                    CONF_CAMERA_IP: ip,
                    CONF_CAMERA_TOKEN: token,
                    CONF_CAMERA_MODEL: model,
                    "name": f"Camera {did}",
                }]
                entry_data = {
                    **self.account_data,
                    CONF_CAMERAS: cameras_data,
                    # Maintain backwards compatibility
                    CONF_CAMERA_DID: did,
                    CONF_CAMERA_IP: ip,
                    CONF_CAMERA_TOKEN: token,
                    CONF_CAMERA_MODEL: model,
                }
                await self.async_set_unique_id(f"{DOMAIN}_{did}")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=f"Camera {did}", data=entry_data)

        # Autodetect camera details from Home Assistant and local storage
        local_cams = await async_autodetect_all_cameras(self.hass)
        detected = local_cams[0] if local_cams else {}
        default_did = detected.get("did", "")
        default_ip = detected.get("localip", "")
        default_token = detected.get("token", "")
        default_model = detected.get("model", "chuangmi.camera.ipc019e")

        schema = vol.Schema({
            vol.Required(CONF_CAMERA_DID, default=default_did): str,
            vol.Required(CONF_CAMERA_IP, default=default_ip): str,
            vol.Required(CONF_CAMERA_TOKEN, default=default_token): str,
            vol.Optional(CONF_CAMERA_MODEL, default=default_model): str,
        })

        return self.async_show_form(step_id="manual", data_schema=schema, errors=errors)
