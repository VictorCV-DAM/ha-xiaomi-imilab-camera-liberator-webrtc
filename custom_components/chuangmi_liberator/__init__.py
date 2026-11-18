"""Chuangmi Liberator WebRTC Integration."""
import logging
import os
import json
from pathlib import Path
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.components.http import StaticPathConfig
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    DOMAIN,
    CONF_USERNAME,
    CONF_PASSWORD,
    CONF_SERVER_COUNTRY,
    CONF_CAMERAS,
    CONF_CAMERA_DID,
    CONF_CAMERA_IP,
    CONF_CAMERA_TOKEN,
    CONF_CAMERA_MODEL
)
from .xiaomi_client import XiaomiClient
from .binary_manager import async_ensure_patched_go2rtc

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.CAMERA, Platform.SWITCH, Platform.SELECT, Platform.BUTTON]
CARD_URL = "/chuangmi_liberator/chuangmi-ptz-card.js"


async def _async_register_card(hass: HomeAssistant) -> None:
    """Register static path and Lovelace resource for the custom card."""
    card_path = Path(__file__).parent / "www" / "chuangmi-ptz-card.js"
    if card_path.exists():
        try:
            await hass.http.async_register_static_paths([
                StaticPathConfig(CARD_URL, str(card_path), cache_headers=False)
            ])
        except Exception:
            pass

    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None) or (
        lovelace.get("resources") if isinstance(lovelace, dict) else None
    )
    if resources is not None and hasattr(resources, "async_create_item"):
        try:
            if not getattr(resources, "loaded", True):
                await resources.async_load()
                resources.loaded = True

            found = any(
                item.get("url", "").startswith(CARD_URL) or "chuangmi-ptz-card" in item.get("url", "")
                for item in resources.async_items()
            )
            if not found:
                await resources.async_create_item({"res_type": "module", "url": f"{CARD_URL}?v=1.0.0"})
        except Exception as err:
            _LOGGER.debug("Could not auto-register Lovelace resource: %s", err)


async def _async_discover_all_cameras(hass: HomeAssistant, client: XiaomiClient, entry: ConfigEntry) -> list:
    """Discover all Xiaomi cameras from local storage and Cloud to allow dynamic fleet updates on reload."""
    discovered = {}

    # 1. Start with whatever was already configured in entry.data
    existing_cameras = entry.data.get(CONF_CAMERAS) or []
    if not existing_cameras and entry.data.get(CONF_CAMERA_DID):
        existing_cameras = [{
            CONF_CAMERA_DID: entry.data.get(CONF_CAMERA_DID),
            CONF_CAMERA_IP: entry.data.get(CONF_CAMERA_IP),
            CONF_CAMERA_TOKEN: entry.data.get(CONF_CAMERA_TOKEN),
            CONF_CAMERA_MODEL: entry.data.get(CONF_CAMERA_MODEL, "chuangmi.camera.ipc019e"),
            "name": entry.title
        }]
    for c in existing_cameras:
        did = str(c.get(CONF_CAMERA_DID, ""))
        if did:
            discovered[did] = c

    # 2. Check local Xiaomi Miot storage files in background executor thread
    def _read_local_storage():
        res = {}
        try:
            s_dir = hass.config.path(".storage", "xiaomi_miot")
            if os.path.isdir(s_dir):
                for filename in os.listdir(s_dir):
                    if filename.startswith("devices-") and filename.endswith(".json"):
                        filepath = os.path.join(s_dir, filename)
                        with open(filepath, "r", encoding="utf-8") as f:
                            file_data = json.load(f)
                            data_block = file_data.get("data", {})
                            devices = data_block.get("devices", []) if isinstance(data_block, dict) else []
                            for dev in devices:
                                if not isinstance(dev, dict):
                                    continue
                                model = dev.get("model", "")
                                if any(k in model for k in ["chuangmi", "camera", "ipc"]):
                                    did = str(dev.get("did", ""))
                                    ip = dev.get("localip") or dev.get("ip", "")
                                    token = dev.get("token", "")
                                    name = dev.get("name") or f"Camera {did}"
                                    if did and ip and token:
                                        res[did] = {
                                            CONF_CAMERA_DID: did,
                                            CONF_CAMERA_IP: ip,
                                            CONF_CAMERA_TOKEN: token,
                                            CONF_CAMERA_MODEL: model,
                                            "name": name
                                        }
        except Exception as err:
            _LOGGER.debug("Error checking xiaomi_miot storage: %s", err)
        return res

    local_devs = await hass.async_add_executor_job(_read_local_storage)
    discovered.update(local_devs)

    # 3. Check Cloud devices if client has credentials
    try:
        cloud_devs = await client.async_get_devices()
        for dev in cloud_devs:
            model = dev.get("model", "")
            if any(k in model for k in ["chuangmi", "camera", "ipc"]):
                did = str(dev.get("did", ""))
                ip = dev.get("localip") or dev.get("ip", "")
                token = dev.get("token", "")
                name = dev.get("name") or f"Camera {did}"
                if did and (ip or did in discovered):
                    if did in discovered and not ip:
                        ip = discovered[did][CONF_CAMERA_IP]
                    if did in discovered and not token:
                        token = discovered[did][CONF_CAMERA_TOKEN]
                    discovered[did] = {
                        CONF_CAMERA_DID: did,
                        CONF_CAMERA_IP: ip,
                        CONF_CAMERA_TOKEN: token,
                        CONF_CAMERA_MODEL: model,
                        "name": name
                    }
    except Exception as err:
        _LOGGER.debug("Error querying Xiaomi Cloud devices: %s", err)

    return list(discovered.values())


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Chuangmi Liberator WebRTC from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Automatically ensure the patched go2rtc binary is deployed
    await async_ensure_patched_go2rtc(hass)

    # Register Lovelace custom card
    await _async_register_card(hass)

    session = async_get_clientsession(hass)
    client = XiaomiClient(
        username=entry.data.get(CONF_USERNAME, ""),
        password=entry.data.get(CONF_PASSWORD, ""),
        country=entry.data.get(CONF_SERVER_COUNTRY, "de"),
        session=session
    )

    # Auto-discover all cameras dynamically
    cameras = await _async_discover_all_cameras(hass, client, entry)
    new_data = dict(entry.data)
    new_data[CONF_CAMERAS] = cameras

    if cameras != entry.data.get(CONF_CAMERAS):
        _LOGGER.info("Discovered %d Xiaomi cameras. Updating fleet...", len(cameras))
        hass.config_entries.async_update_entry(entry, data=new_data)

    hass.data[DOMAIN][entry.entry_id] = {
        "client": client,
        "entry_data": new_data
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok
