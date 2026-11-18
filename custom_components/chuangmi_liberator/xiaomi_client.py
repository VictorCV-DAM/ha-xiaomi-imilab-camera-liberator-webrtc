"""Xiaomi Cloud & miIO communication client for Xiaomi & Imilab Camera Liberator (WebRTC & PTZ)."""
import asyncio
import hashlib
import json
import logging
import socket
import time
import urllib.parse
from typing import Any, Dict, List, Optional
import aiohttp
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

_LOGGER = logging.getLogger(__name__)

class XiaomiClient:
    def __init__(
        self,
        username: str,
        password: str,
        country: str = "de",
        session: Optional[aiohttp.ClientSession] = None
    ):
        self.username = username
        self.password = password
        self.country = country
        self.session = session
        self.user_id: Optional[str] = None
        self.service_token: Optional[str] = None
        self.ssecurity: Optional[str] = None
        self.device_id: Optional[str] = None
        self._own_session = False

    async def async_init_session(self):
        if not self.session:
            self.session = aiohttp.ClientSession()
            self._own_session = True

    async def async_close(self):
        if self._own_session and self.session and not self.session.closed:
            await self.session.close()

    def get_api_host(self) -> str:
        if self.country.lower() in ["cn", ""]:
            return "api.io.mi.com"
        return f"{self.country.lower()}.api.io.mi.com"

    async def async_login(self) -> bool:
        """Authenticate with Xiaomi Cloud account."""
        await self.async_init_session()
        try:
            sign_url = "https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true"
            async with self.session.get(sign_url) as r:
                text = await r.text()
                if text.startswith("&&&START&&&"):
                    text = text[11:]
                data = json.loads(text)
                sign = data.get("_sign")
                qs = data.get("qs")

            login_url = "https://account.xiaomi.com/pass/serviceLoginAuth2"
            post_data = {
                "sid": "xiaomiio",
                "hash": hashlib.md5(self.password.encode()).hexdigest().upper(),
                "user": self.username,
                "_json": "true",
                "_sign": sign,
                "qs": qs,
                "callback": "https://sts.api.io.mi.com/sts",
            }
            async with self.session.post(login_url, data=post_data) as r2:
                text2 = await r2.text()
                if text2.startswith("&&&START&&&"):
                    text2 = text2[11:]
                res = json.loads(text2)

            if res.get("code") != 0:
                _LOGGER.error("Xiaomi Cloud login error: %s", res)
                return False

            self.ssecurity = res.get("ssecurity")
            self.user_id = str(res.get("userId"))
            location = res.get("location")

            if location:
                async with self.session.get(location) as r3:
                    for cookie in self.session.cookie_jar:
                        if cookie.key == "serviceToken":
                            self.service_token = cookie.value
                            break

            _LOGGER.info("Xiaomi Cloud login success for user %s", self.user_id)
            return True
        except Exception as e:
            _LOGGER.exception("Failed to login to Xiaomi Cloud: %s", e)
            return False

    async def async_get_devices(self) -> List[Dict[str, Any]]:
        """Fetch list of cameras from Xiaomi Cloud."""
        if not self.service_token:
            if not await self.async_login():
                return []

        url = f"https://{self.get_api_host()}/app/v2/home/home_device_list"
        # Signed request payload
        headers = {
            "User-Agent": "Android-7.1.1-1.0.0-ONEPLUS A3010-136-70100 APP/xiaomi.smarthome APPV/70100",
            "Cookie": f"userId={self.user_id}; serviceToken={self.service_token}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = {"get_split_device": True, "support_smart_home": True}
        try:
            async with self.session.post(url, data={"data": json.dumps(data)}, headers=headers) as resp:
                res = await resp.json(content_type=None)
                devs = res.get("result", {}).get("list", [])
                cameras = [
                    d for d in devs
                    if "camera" in d.get("model", "").lower() or "video" in d.get("model", "").lower()
                ]
                return cameras
        except Exception as e:
            _LOGGER.error("Error fetching devices from Xiaomi Cloud: %s", e)
            return []

    async def async_request_stream_url(self, did: str) -> Optional[str]:
        """Request signed live stream URL on demand from Xiaomi Cloud."""
        if not self.service_token:
            if not await self.async_login():
                return None

        host = self.get_api_host()
        headers = {
            "User-Agent": "Android-7.1.1-1.0.0-ONEPLUS A3010-136-70100 APP/xiaomi.smarthome APPV/70100",
            "Cookie": f"userId={self.user_id}; serviceToken={self.service_token}",
            "Content-Type": "application/x-www-form-urlencoded"
        }

        # Try MIoT action: camera_stream_for_google_home or start_hls_stream
        # Typically siid: 6 aiid: 1 or siid: 5 aiid: 1 or RPC start_hls_stream
        endpoints = [
            (
                f"https://{host}/app/miotspec/action",
                {"params": {"did": did, "siid": 6, "aiid": 1, "in": []}}
            ),
            (
                f"https://{host}/app/miotspec/action",
                {"params": {"did": did, "siid": 7, "aiid": 1, "in": []}}
            ),
            (
                f"https://{host}/app/home/rpc/{did}",
                {"id": int(time.time()), "method": "start_hls_stream", "params": []}
            )
        ]

        for url, payload in endpoints:
            try:
                post_body = {"data": json.dumps(payload)}
                async with self.session.post(url, data=post_body, headers=headers, timeout=8) as resp:
                    res = await resp.json(content_type=None)
                    _LOGGER.debug("Stream response from %s: %s", url, res)
                    result = res.get("result")
                    if isinstance(result, dict):
                        # Extract stream address
                        for key in ["stream_address", "url", "hls", "rtsp"]:
                            if key in result and result[key]:
                                return result[key]
                        # Check out results array
                        out = result.get("out", [])
                        for item in out:
                            if isinstance(item, dict) and "value" in item:
                                val = str(item["value"])
                                if val.startswith("http") or val.startswith("rtsp"):
                                    return val
                            elif isinstance(item, str) and (item.startswith("http") or item.startswith("rtsp")):
                                return item
            except Exception as e:
                _LOGGER.debug("Stream probe error on %s: %s", url, e)

        return None

    # --- Local miIO direct commands (for instant zero-latency controls) ---
    _miio_sessions: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def send_local_miio(cls, ip: str, token_hex: str, method: str, params: Any) -> Optional[Any]:
        """Ultra-fast, session-cached local UDP miIO packet execution."""
        try:
            token = bytes.fromhex(token_hex)
            key = hashlib.md5(token).digest()
            iv = hashlib.md5(key + token).digest()
            now = time.time()

            session = cls._miio_sessions.get(ip)
            dev_id = None
            stamp = None
            s = None

            if session and (now - session.get("time", 0) < 120):
                dev_id = session["dev_id"]
                stamp = session["base_stamp"] + int(now - session["base_time"]) + 1
                s = session["socket"]
            else:
                if session and session.get("socket"):
                    try:
                        session["socket"].close()
                    except Exception:
                        pass
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.settimeout(1.2)
                hello = bytes.fromhex("21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
                s.sendto(hello, (ip, 54321))
                reply, _ = s.recvfrom(1024)
                dev_id = reply[8:12]
                base_stamp = int.from_bytes(reply[12:16], "big")
                stamp = base_stamp + 1
                cls._miio_sessions[ip] = {
                    "dev_id": dev_id,
                    "base_stamp": base_stamp,
                    "base_time": now,
                    "time": now,
                    "socket": s
                }

            payload = json.dumps({"id": int(now * 1000) % 100000, "method": method, "params": params}).encode("utf-8")
            pad_len = 16 - (len(payload) % 16)
            padded = payload + bytes([pad_len] * pad_len)
            c = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend()).encryptor()
            encrypted = c.update(padded) + c.finalize()

            header = bytearray(32)
            header[0:2] = bytes.fromhex("2131")
            header[2:4] = (32 + len(encrypted)).to_bytes(2, "big")
            header[8:12] = dev_id
            header[12:16] = stamp.to_bytes(4, "big")
            header[16:32] = hashlib.md5(header[:16] + token + encrypted).digest()

            # Drain any stale packets in the UDP buffer before transmitting
            try:
                s.setblocking(False)
                while True:
                    s.recv(2048)
            except Exception:
                pass
            finally:
                s.setblocking(True)
                s.settimeout(1.5)

            s.sendto(bytes(header) + encrypted, (ip, 54321))
            resp, _ = s.recvfrom(4096)
            
            session = cls._miio_sessions.get(ip)
            if session:
                session["time"] = now

            d = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend()).decryptor()
            decrypted = d.update(resp[32:]) + d.finalize()
            raw_json = decrypted[:-decrypted[-1]].decode("utf-8", errors="ignore")
            data = json.loads(raw_json)
            if "error" in data:
                err = data["error"]
                if isinstance(err, dict) and "overflow" in str(err.get("message", "")).lower():
                    _LOGGER.info("Límite físico PTZ alcanzado en cámara %s: %s", ip, err.get("message"))
                    return ["LIMIT_REACHED"]
                _LOGGER.debug("miIO error response from %s: %s", ip, err)
            return data.get("result")
        except Exception as e:
            _LOGGER.debug("miIO command %s to %s failed (invalidating session): %s", method, ip, e)
            cls._miio_sessions.pop(ip, None)
            return None
