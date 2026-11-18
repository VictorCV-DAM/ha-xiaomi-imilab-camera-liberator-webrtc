"""Constants for Chuangmi Liberator WebRTC."""

DOMAIN = "chuangmi_liberator"
NAME = "Chuangmi Liberator WebRTC"

CONF_USERNAME = "username"
CONF_PASSWORD = "password"
CONF_SERVER_COUNTRY = "server_country"
CONF_CAMERA_DID = "camera_did"
CONF_CAMERA_IP = "camera_ip"
CONF_CAMERA_TOKEN = "camera_token"
CONF_CAMERA_MODEL = "camera_model"
CONF_CAMERAS = "cameras"

DEFAULT_COUNTRY = "de"
DEFAULT_SCAN_INTERVAL = 30

SERVER_COUNTRIES = {
    "de": "Europe (de)",
    "cn": "China (cn)",
    "us": "United States (us)",
    "ru": "Russia (ru)",
    "sg": "Singapore (sg)",
    "i2": "India (i2)"
}

GO2RTC_API_URL = "http://127.0.0.1:1984"
