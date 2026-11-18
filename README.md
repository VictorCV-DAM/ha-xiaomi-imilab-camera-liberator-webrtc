<p align="center">
  <img src="images/icon_512.png" width="160" alt="Chuangmi Liberator WebRTC Icon" style="border-radius: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
</p>

<h1 align="center">Chuangmi Liberator WebRTC</h1>

<p align="center">
  <a href="https://github.com/hacs/integration"><img src="https://img.shields.io/badge/HACS-Custom-orange.svg?style=for-the-badge" alt="HACS Custom"></a>
  <a href="https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc/releases"><img src="https://img.shields.io/github/v/release/VictorCV-DAM/ha-chuangmi-liberator-webrtc?style=for-the-badge&color=blue" alt="GitHub Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc/actions"><img src="https://img.shields.io/github/actions/workflow/status/VictorCV-DAM/ha-chuangmi-liberator-webrtc/validate.yml?style=for-the-badge&label=Hassfest" alt="Hassfest Validation"></a>
</p>

<p align="center">
  <strong>Liberate your Xiaomi / Chuangmi / Imilab cameras in Home Assistant.</strong><br>
  Ultra-low latency <strong>2K WebRTC live streaming (&lt;200ms)</strong>, <strong>Two-Way Audio (Intercom)</strong>, instant local UDP PTZ motor control, and a dedicated tactile Lovelace PTZ card without cloud subscriptions or throttling.
</p>

---

## ⚡ Highlights & Key Features

- **⚡ Real-Time WebRTC Streaming:** Eliminates the annoying 2–5 second cloud latency and buffering of traditional HLS/RTSP streams. Streams are direct and hardware-accelerated via `go2rtc`.
- **🎙️ Two-Way Audio (Microphone / Intercom):** Speak directly to your camera from your browser or mobile dashboard using the center mic button on the card.
- **🎮 Tactile Lovelace PTZ Card (`chuangmi-ptz-card`):**
  - Intuitive circular directional d-pad (Up, Down, Left, Right).
  - Center talk/intercom button with visual pulsing feedback.
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

## 🛠️ Supported Hardware & Compatibility Matrix

This integration communicates via the native **Xiaomi MISS / CloudRTC** streaming protocol and direct **miIO UDP** local sockets. Below is the complete list of tested and potentially compatible cameras across the Xiaomi / Chuangmi / Imilab ecosystem:

### 1. Tested & Verified Working (Production Ready)

| Model Identifier | Commercial Name | Resolution | WebRTC Live | 2-Way Audio | PTZ Control | Local miIO | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `chuangmi.camera.ipc019e` | **Xiaomi Smart Camera 2K / Imilab A1 (CMSXJ19E)** | 2304x1296 (2K) | ✅ | ✅ | ✅ | ✅ | **Verified Working** |

> **Verification Details:** Confirmed with dual-camera live setup. Instant PTZ response, real-time WebRTC stream (&lt;200ms latency), bidirectional microphone talkback, night vision IR switching, and local sleep/privacy toggle all operating flawlessly.

---

### 2. High-Confidence Architecture Match (Same Protocol & miIO Engine)

These models share the identical Chuangmi/Imilab firmware base, MISS streaming protocol, and miIO motor schemas:

| Model Identifier | Commercial Name | Resolution | Form Factor | PTZ Motor | Expected Compatibility |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `chuangmi.camera.ipc019` | Imilab Home Security Camera A1 (Global/CN) | 1080p / 2K | Dome PTZ | ✅ | 🟢 High (Identical Chipset) |
| `chuangmi.camera.ipc009` | Xiaomi Mijia Smart Camera 1080P PTZ | 1080p | Dome PTZ | ✅ | 🟢 High |
| `chuangmi.camera.026c02` | Xiaomi Smart Camera C300 (XMC01) | 2K (1296p) | Dome PTZ | ✅ | 🟢 High |
| `chuangmi.camera.046c04` | Xiaomi Smart Camera C400 | 2.5K (1440p) | Dome PTZ | ✅ | 🟢 High |
| `chuangmi.camera.055a01` | Xiaomi Smart Camera C200 | 1080p | Dome PTZ | ✅ | 🟢 High |
| `chuangmi.camera.069a01` | Xiaomi Smart Camera C500 Pro / C500 | 3K (5MP) | Dome PTZ | ✅ | 🟢 High |
| `chuangmi.camera.ipc013` | Chuangmi Smart Camera 1080P Basic | 1080p | Fixed | ❌ | 🟢 High (Fixed View) |
| `chuangmi.camera.xiaobai`| Xiaomi Mijia 360° Smart Camera v1 | 720p / 1080p | Dome PTZ | ✅ | 🟢 High |
| `chuangmi.camera.ipc020` | Chuangmi Smart PTZ Camera Pro | 2K | Dome PTZ | ✅ | 🟢 High |
| `chuangmi.camera.ipc021` | Chuangmi Smart PTZ Camera Plus | 2.5K | Dome PTZ | ✅ | 🟢 High |
| `chuangmi.camera.ipc022` | Chuangmi Smart PTZ Camera 3 | 3K | Dome PTZ | ✅ | 🟢 High |
| `chuangmi.camera.v2`..`v6`| Chuangmi IP Camera Series (v2, v3, v4, v5, v6) | 720p / 1080p | Fixed / PTZ | Model-dep. | 🟢 High |

---

### 3. Potentially Compatible Models (Community Testing Requested)

These cameras use Xiaomi ecosystem firmware with potential MISS/RTSP streaming support:

| Model Identifier | Commercial Name | Resolution | Form Factor | Notes |
| :--- | :--- | :---: | :---: | :--- |
| `imilab.camera.006c01` | Imilab C20 / C21 | 1080p / 2.5K | Dome PTZ | Uses Imilab MISS stack |
| `imilab.camera.007c01` | Imilab C30 | 2.5K | Dome PTZ | Dual-band Wi-Fi variant |
| `isa.camera.isc5` | Xiaomi Outdoor Camera AW200 | 1080p | Fixed Outdoor | Local miIO + MISS |
| `isa.camera.hlc7` | Xiaomi Smart Camera PTZ Pro | 2K | Dome PTZ | Isaac firmware variant |

> 💡 **Have a different model?** If you have tested another Chuangmi, Imilab, or Xiaomi camera model with this integration, please [open a GitHub Issue](https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc/issues) to report your results and help expand the verified list!

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

1. **Video/Audio Path:** WebRTC frames stream peer-to-peer directly between `go2rtc` and your browser/app for &lt;200ms latency. Microphone audio captured in the Lovelace card is sent back through go2rtc's backchannel audio handler into the camera speaker.
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
