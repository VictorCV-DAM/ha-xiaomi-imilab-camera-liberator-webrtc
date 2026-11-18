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

# Options configuration keys
CONF_GO2RTC_API_PORT = "api_port"
CONF_GO2RTC_RTSP_PORT = "rtsp_port"
CONF_GO2RTC_WEBRTC_PORT = "webrtc_port"
CONF_ENABLE_BRIDGE = "enable_primary_bridge"
CONF_PRIMARY_GO2RTC_URL = "primary_go2rtc_url"
CONF_LOG_LEVEL = "log_level"

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

# Default isolated non-colliding ports
DEFAULT_API_PORT = 1985
DEFAULT_RTSP_PORT = 8556
DEFAULT_WEBRTC_PORT = 8557
DEFAULT_PRIMARY_GO2RTC_URL = "http://127.0.0.1:1984"
DEFAULT_ENABLE_BRIDGE = True
DEFAULT_LOG_LEVEL = "info"

PORT_API = DEFAULT_API_PORT
PORT_RTSP = DEFAULT_RTSP_PORT
PORT_WEBRTC = DEFAULT_WEBRTC_PORT

GO2RTC_API_URL = f"http://127.0.0.1:{PORT_API}"
GO2RTC_RTSP_PORT = PORT_RTSP
