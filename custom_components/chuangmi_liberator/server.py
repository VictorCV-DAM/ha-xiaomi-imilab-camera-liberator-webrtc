"""Background server management for isolated Chuangmi go2rtc instance."""
import asyncio
import logging
import os
import subprocess
import threading
from typing import Optional
import aiohttp
import yaml

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

PORT_API = 1985
PORT_RTSP = 8556
PORT_WEBRTC = 8557


def generate_chuangmi_config(
    hass: HomeAssistant, cameras: list, country: str = "de", user_id: str = "6243072468"
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

    if xiaomi_creds and (not user_id or user_id not in xiaomi_creds):
        user_id = next(iter(xiaomi_creds.keys()))

    streams = {}
    for c in cameras:
        did = str(c.get("camera_did") or "")
        ip = c.get("camera_ip") or ""
        model = c.get("camera_model") or "chuangmi.camera.ipc019e"
        if did and ip:
            stream_name = f"chuangmi_{did}"
            streams[stream_name] = [
                f"xiaomi://{user_id}:{country}@{ip}?did={did}&model={model}&subtype=sd",
                f"ffmpeg:rtsp://127.0.0.1:{PORT_RTSP}/{stream_name}#video=h264#audio=opus"
            ]

    cfg = {
        "api": {"listen": f":{PORT_API}"},
        "rtsp": {"listen": f":{PORT_RTSP}"},
        "webrtc": {"listen": f":{PORT_WEBRTC}"},
        "log": {"level": "info"},
        "streams": streams,
        "xiaomi": xiaomi_creds,
    }

    try:
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(cfg, f)
        _LOGGER.debug("Saved isolated config to %s", config_path)
    except Exception as err:
        _LOGGER.error("Failed to write chuangmi_go2rtc.yaml: %s", err)

    return config_path


class ChuangmiServer(threading.Thread):
    """Isolated background process runner for Chuangmi go2rtc daemon."""

    def __init__(self, binary_path: str, config_path: str):
        super().__init__(name="ChuangmiGo2rtcServer", daemon=True)
        self.binary_path = binary_path
        self.config_path = config_path
        self.process: Optional[subprocess.Popen] = None
        self._running = True

    def run(self):
        while self._running:
            try:
                cmd = [self.binary_path, "-config", self.config_path]
                _LOGGER.info("Starting isolated Chuangmi go2rtc server on port %d...", PORT_API)
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


async def async_bridge_to_primary_go2rtc(session: aiohttp.ClientSession, cameras: list):
    """Seamlessly mirror streams into primary go2rtc on :1984 if running."""
    primary_url = "http://127.0.0.1:1984"
    if not await async_check_alive(session, primary_url):
        return

    for c in cameras:
        did = str(c.get("camera_did") or "")
        if not did:
            continue
        stream_name = f"chuangmi_{did}"
        source_url = f"rtsp://127.0.0.1:{PORT_RTSP}/{stream_name}"
        params = [("name", stream_name), ("src", source_url)]
        try:
            async with session.put(f"{primary_url}/api/streams", params=params, timeout=2) as resp:
                if resp.status in (200, 201):
                    _LOGGER.debug("Bridged %s to primary go2rtc (:1984)", stream_name)
        except Exception:
            pass
