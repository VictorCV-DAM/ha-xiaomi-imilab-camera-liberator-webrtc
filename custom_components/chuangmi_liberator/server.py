"""Background server management for isolated Chuangmi go2rtc instance."""
import asyncio
import logging
import os
import socket
import subprocess
import threading
from typing import Optional, Set
import aiohttp
import yaml

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

# Reserved official go2rtc ports that must never be used by the isolated daemon
PRIMARY_RESERVED_PORTS: Set[int] = {1984, 8554, 8555}


def is_port_in_use(port: int) -> bool:
    """Check if a port is in use on TCP or UDP."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(('0.0.0.0', port))
        except OSError:
            return True
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.bind(('0.0.0.0', port))
        except OSError:
            return True
    return False


def find_available_port(preferred_port: int, fallback_start: int = 1985, exclude: Optional[Set[int]] = None) -> int:
    """Find a guaranteed free port. Never returns a reserved primary go2rtc port."""
    if exclude is None:
        exclude = set(PRIMARY_RESERVED_PORTS)
    else:
        exclude = exclude.union(PRIMARY_RESERVED_PORTS)

    # 1. If preferred port is provided, not excluded, and currently free, use it
    if preferred_port > 0 and preferred_port not in exclude and not is_port_in_use(preferred_port):
        return preferred_port

    # 2. Search upwards starting from fallback_start
    port = fallback_start
    while port < fallback_start + 100:
        if port not in exclude and not is_port_in_use(port):
            return port
        port += 1

    return preferred_port or fallback_start


def generate_chuangmi_config(
    hass: HomeAssistant,
    cameras: list,
    country: str = "de",
    user_id: str = "6243072468",
    api_port: int = 1985,
    rtsp_port: int = 8556,
    webrtc_port: int = 8557,
    log_level: str = "info"
) -> str:
    """Generate dedicated non-colliding go2rtc.yaml for Chuangmi cameras."""
    config_path = hass.config.path("custom_components", "chuangmi_liberator", "chuangmi_go2rtc.yaml")

    xiaomi_creds = {}
    main_cfg_path = hass.config.path("go2rtc.yaml")
    if os.path.isfile(main_cfg_path):
        try:
            with open(main_cfg_path, "r", encoding="utf-8") as f:
                d = yaml.safe_load(f) or {}
                xiaomi_creds = d.get("xiaomi", {})
        except Exception as e:
            _LOGGER.debug("Could not read xiaomi block from go2rtc.yaml: %s", e)

    # Robust numeric user ID resolution
    if not (user_id and str(user_id).isdigit() and str(user_id) in xiaomi_creds):
        resolved_uid = None
        s_dir = hass.config.path(".storage", "xiaomi_miot")
        if os.path.isdir(s_dir):
            for filename in os.listdir(s_dir):
                if (filename.startswith("devices-") or filename.startswith("auth-")) and filename.endswith(".json"):
                    parts = filename.replace("devices-", "").replace("auth-", "").replace(".json", "").split("-")
                    if parts and parts[0].isdigit() and parts[0] in xiaomi_creds:
                        resolved_uid = parts[0]
                        break
        if resolved_uid:
            user_id = resolved_uid
        elif "6243072468" in xiaomi_creds:
            user_id = "6243072468"
        elif xiaomi_creds:
            user_id = next(iter(xiaomi_creds.keys()))

    streams = {}
    for c in cameras:
        did = str(c.get("camera_did") or "")
        ip = c.get("camera_ip") or ""
        model = c.get("camera_model") or "chuangmi.camera.ipc019e"
        if did and ip:
            stream_name = f"chuangmi_{did}"
            # Native camera stream (subtype=0 is the only subtype accepted by Chuangmi/Imilab firmware)
            streams[stream_name] = [
                f"xiaomi://{user_id}:{country}@{ip}?did={did}&model={model}&subtype=0"
            ]
            streams[f"{stream_name}_sd"] = [
                stream_name
            ]

    cfg = {
        "api": {"listen": f":{api_port}"},
        "rtsp": {"listen": f":{rtsp_port}"},
        "webrtc": {"listen": f":{webrtc_port}"},
        "log": {"level": log_level},
        "streams": streams,
        "xiaomi": xiaomi_creds,
    }

    try:
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(cfg, f)
        _LOGGER.debug("Saved isolated config to %s (API:%d, RTSP:%d, WebRTC:%d)", config_path, api_port, rtsp_port, webrtc_port)
    except Exception as err:
        _LOGGER.error("Failed to write chuangmi_go2rtc.yaml: %s", err)

    return config_path


class ChuangmiServer(threading.Thread):
    """Isolated background process runner for Chuangmi go2rtc daemon."""

    def __init__(self, binary_path: str, config_path: str, api_port: int = 1985):
        super().__init__(name="ChuangmiGo2rtcServer", daemon=True)
        self.binary_path = binary_path
        self.config_path = config_path
        self.api_port = api_port
        self.process: Optional[subprocess.Popen] = None
        self._running = True

    def run(self):
        while self._running:
            try:
                cmd = [self.binary_path, "-config", self.config_path]
                _LOGGER.info("Starting isolated Chuangmi go2rtc server on port %d...", self.api_port)
                self.process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT
                )
                while self.process.poll() is None:
                    line = self.process.stdout.readline()
                    if line == b"":
                        break
                    _LOGGER.debug("[Chuangmi-go2rtc] %s", line.decode(errors="ignore").strip())
            except Exception as e:
                _LOGGER.error("Chuangmi go2rtc process error: %s", e)

            if not self._running:
                break
            threading.Event().wait(3)

    def stop(self, *args):
        self._running = False
        if self.process:
            try:
                self.process.terminate()
            except Exception:
                pass


async def async_check_alive(session: aiohttp.ClientSession, url: str) -> bool:
    try:
        async with session.get(f"{url}/api/streams", timeout=aiohttp.ClientTimeout(total=2)) as resp:
            return resp.status < 300
    except Exception:
        return False


async def async_bridge_to_primary_go2rtc(
    session: aiohttp.ClientSession,
    cameras: list,
    primary_url: str = "http://127.0.0.1:1984",
    rtsp_port: int = 8556
):
    """Seamlessly mirror streams into primary go2rtc on :1984 if running."""
    if not await async_check_alive(session, primary_url):
        return

    for c in cameras:
        did = str(c.get("camera_did") or "")
        if not did:
            continue
        base_stream = f"chuangmi_{did}"
        source_url = f"rtsp://127.0.0.1:{rtsp_port}/{base_stream}#transport=tcp"
        payload_base = {
            "name": base_stream,
            "src": [
                source_url
            ]
        }
        payload_sd = {
            "name": f"{base_stream}_sd",
            "src": [
                base_stream
            ]
        }
        for p in [payload_base, payload_sd]:
            try:
                async with session.put(f"{primary_url}/api/streams", json=p, timeout=2) as resp:
                    if resp.status in (200, 201):
                        _LOGGER.debug("Bridged %s to primary go2rtc (%s)", p["name"], primary_url)
            except Exception:
                pass
