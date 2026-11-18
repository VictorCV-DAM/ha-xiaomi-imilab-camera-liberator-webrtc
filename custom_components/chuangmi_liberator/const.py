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

PORT_API = 1985
PORT_RTSP = 8556
PORT_WEBRTC = 8557

GO2RTC_API_URL = f"http://127.0.0.1:{PORT_API}"
GO2RTC_RTSP_PORT = PORT_RTSP
