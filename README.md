# Chuangmi Liberator WebRTC 🚀

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg?style=for-the-badge)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/v/release/VictorCV-DAM/ha-chuangmi-liberator-webrtc?style=for-the-badge&color=blue)](https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Hassfest Validation](https://img.shields.io/github/actions/workflow/status/VictorCV-DAM/ha-chuangmi-liberator-webrtc/validate.yml?style=for-the-badge&label=Hassfest)](https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc/actions)

> **Liberate your Xiaomi / Chuangmi / Imilab cameras in Home Assistant.**  
> Ultra-low latency **2K WebRTC live streaming (<200ms)**, **Two-Way Audio (Intercom)**, instant local UDP PTZ motor control, and a dedicated tactile Lovelace PTZ card without cloud subscriptions or throttling.

---

## ⚡ Highlights & Key Features

- **⚡ Real-Time WebRTC Streaming:** Eliminates the annoying 2–5 second cloud latency and buffering of traditional HLS/RTSP streams. Streams are direct and hardware-accelerated via `go2rtc`.
- **🎙️ Two-Way Audio (Microphone / Intercom):** Speak directly to your camera from your browser or mobile dashboard using the center mic button on the card.
- **🎮 Tactile Lovelace PTZ Card (`chuangmi-ptz-card`):**
  - Intuitive circular directional d-pad (Up, Down, Left, Right).
  - Center talk/intercom button with visual pulsing state.
  - Streamlined 3-action bottom bar: **Invert / Flip 180°**, **Night Vision**, and **Privacy / Sleep Mode**.
  - Strict dynamic entity filtering — auto-detects and connects only your Chuangmi cameras.
- **🛡️ 100% Local UDP Controls:** Controls PTZ motor, night mode, status LED, sleep mode, timestamp watermark, and motion recording directly over local network (miIO protocol).
- **🔄 Dynamic Fleet Discovery:** Automatically finds all your Xiaomi cameras on reload without needing manual IP or token re-entry.
- **📦 Zero-Configuration Binary Management:** Automatically verifies and serves the patched `go2rtc` binary with native Xiaomi protocol backchannel support.

---

## 📸 Lovelace PTZ Card

The integration bundles a dedicated custom card that registers automatically in Home Assistant:

```yaml
type: custom:chuangmi-ptz-card
camera_entity: camera.camera_entrada_camera_123456789
title: Front Entrance (2K PTZ)
```

### Card Features:
| Feature | Description |
| :--- | :--- |
| **WebRTC 2K Live** | Instant frame playback without buffering or keyframe lag |
| **PTZ D-Pad** | Motor commands with hardware debouncing to prevent packet collisions |
| **Center Mic** | Hold or tap to transmit real-time microphone audio to camera |
| **Flip 180°** | Toggle image orientation for ceiling or upside-down mounts |
| **Night Vision** | Cycle through Auto, Always On, and Off |
| **Privacy Mode** | Instant local sleep / standby mode |

---

## 🛠️ Supported Hardware

Designed and optimized for Xiaomi / Chuangmi / Imilab cameras, including but not limited to:
- **Chuangmi Smart Camera 2K** (`chuangmi.camera.ipc019e`)
- **Imilab Home Security Camera A1** (`chuangmi.camera.ipc019e`)
- **Chuangmi PTZ / Pro / Basic series**
- Other Xiaomi Mi Home / Chuangmi ecosystem IPC models supporting miIO / Xiaomi protocol.

---

## 📦 Installation

### Option 1: HACS (Recommended)

1. Open **HACS** in your Home Assistant dashboard.
2. Click the three dots in the top right corner and select **Custom repositories**.
3. Paste the repository URL:  
   `https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc`
4. Set category to **Integration** and click **Add**.
5. Search for **Chuangmi Liberator WebRTC** and click **Download**.
6. Restart Home Assistant.

### Option 2: Manual Installation

1. Download the latest release `chuangmi_liberator.zip` from [Releases](https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc/releases).
2. Extract the `chuangmi_liberator` directory into your Home Assistant `/config/custom_components/` directory:
   ```
   config/
   └── custom_components/
       └── chuangmi_liberator/
           ├── __init__.py
           ├── manifest.json
           ├── camera.py
           └── ...
   ```
3. Restart Home Assistant.

---

## ⚙️ Configuration

1. In Home Assistant, navigate to **Settings** -> **Devices & Services** -> **Add Integration**.
2. Search for **Chuangmi Liberator WebRTC**.
3. Choose your setup mode:
   - **Local Auto-Detection:** Leave username and password blank and submit to detect cameras already cached in your Home Assistant network.
   - **Xiaomi Cloud Login:** Enter your Xiaomi Mi Home credentials and region (`de`, `cn`, `us`) to automatically discover and extract tokens for all cameras in your account.
   - **Manual Setup:** Provide Device ID (DID), local IP, 32-character token, and model identifier.

---

## 🧩 Entities Created per Camera

| Domain | Entity | Description |
| :--- | :--- | :--- |
| `camera` | `Live Camera` | WebRTC live video & snapshot provider |
| `button` | `Move Up / Down / Left / Right` | Direct local PTZ motor directional control |
| `button` | `Restart Camera` | Soft restart of onboard camera daemons |
| `switch` | `Flip Image 180°` | Invert image for ceiling mount |
| `switch` | `Sleep Mode / Power` | Toggle standby privacy mode |
| `switch` | `Status LED` | Enable or disable the blue front LED |
| `switch` | `Timestamp Watermark` | Toggle on-screen date & time display |
| `switch` | `WDR Backlight Mode` | Wide dynamic range backlight enhancement |
| `switch` | `Low Light Full Color` | Color night vision in low ambient light |
| `switch` | `Motion Recording` | Toggle automatic motion-triggered SD recording |
| `select` | `Night Vision` | Night vision IR mode (Auto / Always On / Off) |

---

## 🔍 How It Works Under the Hood

```
+-------------------------------------------------------------+
|                     Home Assistant UI                       |
|   +-----------------------------------------------------+   |
|   |         Chuangmi PTZ Card (chuangmi-ptz-card)       |   |
|   +-----------------------------------------------------+   |
+-----------------▲-------------------------▲-----------------+
                  │ WebRTC Video            │ UDP miIO (PTZ)
                  │ WebRTC Mic Audio        │
+-----------------▼-------------------------▼-----------------+
|               go2rtc                | Chuangmi Liberator    |
|   (Native Xiaomi Miss / Legacy)     | Integration Engine    |
+-----------------▲-------------------------------------------+
                  │ Xiaomi stream protocol
+-----------------▼-------------------------------------------+
|               Chuangmi / Imilab Camera (LAN)                |
+-------------------------------------------------------------+
```

1. **Video/Audio Path:** WebRTC frames stream peer-to-peer directly between `go2rtc` and your browser/app for <200ms latency. Microphone audio captured in the Lovelace card is sent back through go2rtc's backchannel audio handler into the camera speaker.
2. **Control Path:** PTZ moves and switch commands are transmitted directly via UDP packets using miIO AES-CBC encryption without internet roundtrips.

---

## ❓ FAQ & Troubleshooting

### Why is the camera stream faster with WebRTC than HLS?
Traditional HLS chunks video into 2-6 second segments, creating mandatory delay. WebRTC establishes real-time peer-to-peer UDP media exchange, delivering live frames instantaneously.

### What if my camera motor doesn't respond to rapid clicks?
The integration includes hardware gear serialization locks (`0.08s` cooldown) to prevent packet collisions and preserve the camera's physical stepper motors.

### Where can I find my camera token if I don't use cloud login?
You can use the open-source community tool [Xiaomi Cloud Tokens Extractor](https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor) to extract tokens for all devices on your account in under a minute.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
