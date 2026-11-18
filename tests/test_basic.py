"""Basic unit test suite for Chuangmi Liberator WebRTC."""
import sys
import unittest
from unittest.mock import MagicMock

# Mock Home Assistant modules so tests run independently in any environment
if "homeassistant" not in sys.modules:
    ha_mock = MagicMock()
    for mod in [
        "homeassistant",
        "homeassistant.const",
        "homeassistant.core",
        "homeassistant.config_entries",
        "homeassistant.components",
        "homeassistant.components.camera",
        "homeassistant.components.button",
        "homeassistant.components.switch",
        "homeassistant.components.select",
        "homeassistant.components.http",
        "homeassistant.helpers",
        "homeassistant.helpers.aiohttp_client",
        "homeassistant.helpers.config_validation",
        "homeassistant.helpers.entity",
        "homeassistant.helpers.entity_platform",
    ]:
        sys.modules[mod] = MagicMock()

from custom_components.chuangmi_liberator.const import (
    DOMAIN,
    NAME,
    SERVER_COUNTRIES,
    DEFAULT_COUNTRY,
)
from custom_components.chuangmi_liberator.binary_manager import ARCH_MAP


class TestChuangmiLiberatorBasics(unittest.TestCase):
    def test_constants(self):
        self.assertEqual(DOMAIN, "chuangmi_liberator")
        self.assertEqual(NAME, "Xiaomi & Imilab Camera Liberator WebRTC")
        self.assertIn("de", SERVER_COUNTRIES)
        self.assertEqual(DEFAULT_COUNTRY, "de")

    def test_arch_mapping(self):
        self.assertIn("Linux", ARCH_MAP)
        self.assertIn("Windows", ARCH_MAP)
        self.assertEqual(ARCH_MAP["Linux"]["x86_64"], "go2rtc_linux_amd64")
        self.assertEqual(ARCH_MAP["Linux"]["aarch64"], "go2rtc_linux_arm64")


if __name__ == "__main__":
    unittest.main()
