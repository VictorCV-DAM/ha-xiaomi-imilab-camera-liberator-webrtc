"""Manages auto-download and verification of the patched go2rtc binary."""
import logging
import os
import platform
import stat
import subprocess
from typing import Optional
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

_LOGGER = logging.getLogger(__name__)

BINARY_VERSION = "1.9.15"

ARCH_MAP = {
    "Linux": {
        "aarch64": "go2rtc_linux_arm64",
        "arm64": "go2rtc_linux_arm64",
        "armv8l": "go2rtc_linux_arm64",
        "x86_64": "go2rtc_linux_amd64",
        "amd64": "go2rtc_linux_amd64",
        "armv7l": "go2rtc_linux_arm",
        "arm": "go2rtc_linux_arm",
        "i386": "go2rtc_linux_i386",
        "i686": "go2rtc_linux_i386",
    },
    "Windows": {
        "amd64": "go2rtc_win64.exe",
        "x86_64": "go2rtc_win64.exe"
    }
}

GITHUB_RELEASE_URL = (
    "https://github.com/VictorCV-DAM/go2rtc/releases/download/"
    "v1.9.15-imilab-2k/{filename}"
)


def get_arch_filename() -> Optional[str]:
    system = platform.system()
    machine = platform.machine().lower()
    return ARCH_MAP.get(system, {}).get(machine)


async def async_ensure_patched_go2rtc(hass: HomeAssistant) -> Optional[str]:
    """Ensure the patched go2rtc binary is installed in private component bin folder."""
    bin_dir = hass.config.path("custom_components", "chuangmi_liberator", "bin")
    os.makedirs(bin_dir, exist_ok=True)

    target_name = "go2rtc-chuangmi"
    if platform.system() == "Windows":
        target_name += ".exe"

    binary_path = os.path.join(bin_dir, target_name)

    # 0. Check for verified custom stable 2K binary in config root (>25MB contains custom 2K decoder)
    for candidate in [
        hass.config.path("go2rtc-1.9.15.CUSTOM_STABLE_IMILAB_2K"),
        hass.config.path("go2rtc-custom"),
        hass.config.path("go2rtc-new"),
    ]:
        if os.path.isfile(candidate) and os.path.getsize(candidate) > 25000000:
            try:
                st = os.stat(candidate)
                os.chmod(candidate, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
                _LOGGER.info("Using verified custom stable 2K go2rtc binary from %s (%d bytes)", candidate, os.path.getsize(candidate))
                return candidate
            except Exception as e:
                _LOGGER.debug("Could not verify candidate %s: %s", candidate, e)

    # 1. Check if private binary already exists and is executable
    if os.path.isfile(binary_path):
        try:
            res = await hass.async_add_executor_job(
                lambda: subprocess.check_output([binary_path, "-v"], timeout=2)
            )
            if b"go2rtc" in res:
                _LOGGER.info("Patched go2rtc binary verified at %s (%s)", binary_path, res.decode().strip())
                return binary_path
        except Exception as e:
            _LOGGER.warning("Existing go2rtc binary check error: %s", e)

    # 2. Check if a valid go2rtc binary is in /config root and copy it
    root_binary = hass.config.path(f"go2rtc-{BINARY_VERSION}")
    if os.path.isfile(root_binary):
        try:
            import shutil
            await hass.async_add_executor_job(lambda: shutil.copy2(root_binary, binary_path))
            st = os.stat(binary_path)
            os.chmod(binary_path, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
            _LOGGER.info("Copied root go2rtc binary to private location %s", binary_path)
            return binary_path
        except Exception as err:
            _LOGGER.debug("Could not copy root go2rtc binary: %s", err)

    # 3. Determine architecture filename
    arch_file = get_arch_filename()
    if not arch_file:
        _LOGGER.warning(
            "Unsupported host architecture %s/%s for automatic binary download",
            platform.system(),
            platform.machine()
        )
        return None

    # 3. Download patched binary from GitHub Releases
    url = GITHUB_RELEASE_URL.format(filename=arch_file)
    _LOGGER.info("Downloading patched go2rtc (%s) from %s...", arch_file, url)

    session = async_get_clientsession(hass)
    try:
        async with session.get(url, timeout=60) as resp:
            if resp.status == 200:
                content = await resp.read()
                temp_path = f"{binary_path}.tmp"

                def _write_and_chmod():
                    with open(temp_path, "wb") as f:
                        f.write(content)
                    st = os.stat(temp_path)
                    os.chmod(temp_path, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
                    if os.path.isfile(binary_path):
                        os.remove(binary_path)
                    os.rename(temp_path, binary_path)

                await hass.async_add_executor_job(_write_and_chmod)
                _LOGGER.info("Successfully installed patched go2rtc binary to %s", binary_path)
                return binary_path
            else:
                _LOGGER.warning("Failed to download patched binary, HTTP status %s", resp.status)
    except Exception as err:
        _LOGGER.error("Error downloading patched go2rtc: %s", err)

    return None
