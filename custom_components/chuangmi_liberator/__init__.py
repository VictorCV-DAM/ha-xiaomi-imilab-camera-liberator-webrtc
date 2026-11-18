"""Xiaomi & Imilab Camera Liberator (WebRTC & PTZ) Integration."""
import logging
import os
import json
import asyncio
from pathlib import Path
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform, EVENT_HOMEASSISTANT_STOP
from homeassistant.core import HomeAssistant
from homeassistant.components.http import StaticPathConfig
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    DOMAIN,
    NAME,
    CONF_USERNAME,
    CONF_PASSWORD,
    CONF_SERVER_COUNTRY,
    CONF_CAMERAS,
    CONF_CAMERA_DID,
    CONF_CAMERA_IP,
    CONF_CAMERA_TOKEN,
    CONF_CAMERA_MODEL,
    CONF_GO2RTC_API_PORT,
    CONF_GO2RTC_RTSP_PORT,
    CONF_GO2RTC_WEBRTC_PORT,
    CONF_ENABLE_BRIDGE,
    CONF_PRIMARY_GO2RTC_URL,
    CONF_LOG_LEVEL,
    DEFAULT_API_PORT,
    DEFAULT_RTSP_PORT,
    DEFAULT_WEBRTC_PORT,
    DEFAULT_PRIMARY_GO2RTC_URL,
    DEFAULT_ENABLE_BRIDGE,
    DEFAULT_LOG_LEVEL,
)
from .xiaomi_client import XiaomiClient
from .binary_manager import async_ensure_patched_go2rtc
from .server import (
    ChuangmiServer,
    generate_chuangmi_config,
    async_check_alive,
    async_bridge_to_primary_go2rtc,
    find_available_port,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.CAMERA, Platform.SWITCH, Platform.SELECT, Platform.BUTTON]
CARD_URL = "/chuangmi_liberator/chuangmi-ptz-card.js"
CARD_VERSION = "1.7.6"

try:
    from homeassistant.components.frontend import add_extra_js_url
except (ImportError, AttributeError):
    add_extra_js_url = None


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

    full_url = f"{CARD_URL}?v={CARD_VERSION}"

    # Global frontend injection so the card is discovered by the card picker in all dashboards
    if add_extra_js_url:
        try:
            add_extra_js_url(hass, full_url)
        except Exception as err:
            _LOGGER.debug("Could not add extra JS URL: %s", err)

    # Register or update Lovelace resource
    try:
        lovelace_data = hass.data.get("lovelace")
        resources = getattr(lovelace_data, "resources", None) if lovelace_data else None
        if resources is not None:
            if not getattr(resources, "loaded", True):
                await resources.async_load()
                resources.loaded = True

            existing_item = None
            for item in getattr(resources, "async_items", lambda: [])():
                url = item.get("url", "")
                if url.startswith(CARD_URL) or "chuangmi-ptz-card" in url:
                    existing_item = item
                    break

            if existing_item:
                if existing_item.get("url") != full_url and hasattr(resources, "async_update_item"):
                    await resources.async_update_item(
                        existing_item["id"],
                        {"res_type": "module", "url": full_url}
                    )
            elif hasattr(resources, "async_create_item"):
                await resources.async_create_item({
                    "res_type": "module",
                    "url": full_url
                })
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
                                    name = dev.get("name") or f"Cámara {did}"
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
                name = dev.get("name") or f"Cámara {did}"
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
    """Set up Xiaomi & Imilab Camera Liberator (WebRTC & PTZ) from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Automatically ensure the patched go2rtc binary is deployed in private bin
    binary_path = await async_ensure_patched_go2rtc(hass)

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

    # Ensure consistent entry title without hardcoded language suffixes
    user_id = str(entry.data.get(CONF_USERNAME) or "").strip()
    clean_title = f"{NAME} ({user_id})" if user_id and user_id != "local" else NAME
    entry_title_update = {}
    if "cámara" in entry.title.lower() or entry.title != clean_title:
        entry_title_update["title"] = clean_title

    if cameras != entry.data.get(CONF_CAMERAS) or entry_title_update:
        _LOGGER.info("Updating fleet and entry metadata (%s)...", clean_title)
        hass.config_entries.async_update_entry(entry, data=new_data, **entry_title_update)

    # Resolve configured options or autodetect free ports
    opts = entry.options
    api_port = opts.get(CONF_GO2RTC_API_PORT) or await hass.async_add_executor_job(
        find_available_port, DEFAULT_API_PORT, DEFAULT_API_PORT
    )
    rtsp_port = opts.get(CONF_GO2RTC_RTSP_PORT) or await hass.async_add_executor_job(
        find_available_port, DEFAULT_RTSP_PORT, DEFAULT_RTSP_PORT
    )
    webrtc_port = opts.get(CONF_GO2RTC_WEBRTC_PORT) or await hass.async_add_executor_job(
        find_available_port, DEFAULT_WEBRTC_PORT, DEFAULT_WEBRTC_PORT
    )
    enable_bridge = opts.get(CONF_ENABLE_BRIDGE, DEFAULT_ENABLE_BRIDGE)
    primary_url = opts.get(CONF_PRIMARY_GO2RTC_URL, DEFAULT_PRIMARY_GO2RTC_URL)
    log_level = opts.get(CONF_LOG_LEVEL, DEFAULT_LOG_LEVEL)

    # Generate isolated configuration with assigned non-colliding ports in executor thread
    country = entry.data.get(CONF_SERVER_COUNTRY, "de")
    user_id = entry.data.get(CONF_USERNAME, "")
    config_path = await hass.async_add_executor_job(
        generate_chuangmi_config,
        hass,
        cameras,
        country,
        user_id,
        api_port,
        rtsp_port,
        webrtc_port,
        log_level
    )

    # Launch dedicated non-colliding go2rtc daemon if not already running on api_port
    server = None
    if not await async_check_alive(session, f"http://127.0.0.1:{api_port}"):
        if binary_path and os.path.isfile(binary_path):
            server = ChuangmiServer(binary_path, config_path, api_port=api_port)
            server.start()
            _LOGGER.info("Started dedicated Chuangmi go2rtc instance on port %d", api_port)
    else:
        try:
            async with session.post(f"http://127.0.0.1:{api_port}/api/restart", timeout=2) as resp:
                _LOGGER.debug("Triggered restart on running Chuangmi go2rtc daemon (%d)", resp.status)
        except Exception:
            pass

    # Periodic background bridge into primary go2rtc (:1984) when active and enabled
    bridge_task = None
    if enable_bridge:
        async def _periodic_bridge():
            while True:
                try:
                    await async_bridge_to_primary_go2rtc(
                        session, cameras, primary_url=primary_url, rtsp_port=rtsp_port
                    )
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    _LOGGER.debug("Bridge to primary go2rtc (%s): %s", primary_url, e)
                await asyncio.sleep(30)

        bridge_task = hass.async_create_background_task(_periodic_bridge(), "chuangmi_bridge_loop")

    def _stop_server(event=None):
        if bridge_task and not bridge_task.done():
            bridge_task.cancel()
        if server:
            server.stop()

    entry.async_on_unload(
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _stop_server)
    )
    entry.async_on_unload(
        entry.add_update_listener(async_reload_entry)
    )

    hass.data[DOMAIN][entry.entry_id] = {
        "client": client,
        "entry_data": new_data,
        "server": server,
        "bridge_task": bridge_task,
        "api_port": api_port,
        "rtsp_port": rtsp_port,
        "webrtc_port": webrtc_port,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    entry_state = hass.data[DOMAIN].get(entry.entry_id, {})
    bridge_task = entry_state.get("bridge_task")
    if bridge_task and not bridge_task.done():
        bridge_task.cancel()
    server = entry_state.get("server")
    if server:
        server.stop()

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok


async def async_remove_config_entry_device(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    device_entry,
) -> bool:
    """Allow user to cleanly delete a camera device from HA UI without leaving orphan entities."""
    device_dids = {
        identifier[1]
        for identifier in device_entry.identifiers
        if identifier[0] == DOMAIN
    }
    if not device_dids:
        return True

    cameras = config_entry.data.get(CONF_CAMERAS, [])
    new_cameras = [
        c for c in cameras
        if str(c.get(CONF_CAMERA_DID)) not in device_dids
    ]
    if len(new_cameras) != len(cameras):
        new_data = dict(config_entry.data)
        new_data[CONF_CAMERAS] = new_cameras
        hass.config_entries.async_update_entry(config_entry, data=new_data)
        _LOGGER.info("Device %s removed from config entry cleanly.", device_dids)

    return True
