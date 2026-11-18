/**
 * Chuangmi / Imilab PTZ Camera Lovelace Card for Home Assistant
 * Features:
 *  - Ultra-low-latency 2K/HD WebRTC streaming via go2rtc
 *  - Tactile PTZ controller with directional buttons
 *  - Center intercom/microphone button for bidirectional audio
 *  - Clean bottom bar with 3 actions: Flip 180°, Night Mode, and Privacy Mode
 *  - Dynamic camera auto-discovery: strictly filters Chuangmi Liberator cameras
 *  - No hardcoded DIDs, IP addresses, or personal credentials
 */

class ChuangmiPTZCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = {};
    this._isTalking = false;
    this._micStream = null;
    this._micAudioTrack = null;
    this._rendered = false;
    this._discoveredEntities = {};
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config };
    if (this._hass) {
      this._updateEntities();
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateEntities();
    if (!this._rendered) {
      this._render();
    } else {
      this._updateStates();
    }
  }

  static getStubConfig(hass, unusedEntities, allEntities) {
    let defaultCam = '';
    if (hass && hass.states) {
      for (const [eid, state] of Object.entries(hass.states)) {
        if (eid.startsWith('camera.')) {
          const attrs = state.attributes || {};
          if (
            attrs.brand === 'Chuangmi Liberator WebRTC' ||
            (attrs.stream_name && attrs.stream_name.startsWith('chuangmi_')) ||
            attrs.did
          ) {
            defaultCam = eid;
            break;
          }
        }
      }
    }

    return {
      type: "custom:chuangmi-ptz-card",
      camera_entity: defaultCam,
      title: ""
    };
  }

  _resolveStreamName(camEntity) {
    if (!camEntity) return '';
    if (this._hass && this._hass.states[camEntity]) {
      const attrs = this._hass.states[camEntity].attributes || {};
      if (attrs.stream_name) {
        return attrs.stream_name;
      }
      if (attrs.did) {
        return `chuangmi_${attrs.did}`;
      }
    }
    // Fallback: extract digits if present in entity_id
    const match = camEntity.match(/\d{8,10}/);
    if (match) {
      return `chuangmi_${match[0]}`;
    }
    return camEntity;
  }

  _updateEntities() {
    if (!this._hass) return;
    const camEntity = this._config.camera_entity;
    if (!camEntity || !this._hass.states[camEntity]) return;

    const camState = this._hass.states[camEntity];
    const attrs = camState.attributes || {};
    const did = attrs.did || (camEntity.match(/\d{8,10}/) ? camEntity.match(/\d{8,10}/)[0] : '');

    // Search matching controls for this camera
    const found = {
      ptz_up: '',
      ptz_down: '',
      ptz_left: '',
      ptz_right: '',
      flip: '',
      night: '',
      sleep: ''
    };

    const states = this._hass.states;
    for (const [eid, s] of Object.entries(states)) {
      // Check by DID match in entity_id
      const matchesDid = did ? eid.includes(did) : false;
      const lower = eid.toLowerCase();

      if (eid.startsWith('button.')) {
        if (matchesDid || (!did && (lower.includes('entrada') || lower.includes('portable')))) {
          if (lower.includes('up') || lower.includes('arriba')) found.ptz_up = eid;
          else if (lower.includes('down') || lower.includes('abajo')) found.ptz_down = eid;
          else if (lower.includes('left') || lower.includes('izquierda')) found.ptz_left = eid;
          else if (lower.includes('right') || lower.includes('derecha')) found.ptz_right = eid;
        }
      } else if (eid.startsWith('switch.')) {
        if (matchesDid || (!did && (lower.includes('entrada') || lower.includes('portable')))) {
          if (lower.includes('flip') || lower.includes('voltear')) found.flip = eid;
          else if (lower.includes('power') || lower.includes('reposo') || lower.includes('sleep')) found.sleep = eid;
        }
      } else if (eid.startsWith('select.')) {
        if (matchesDid || (!did && (lower.includes('entrada') || lower.includes('portable')))) {
          if (lower.includes('night') || lower.includes('nocturna')) found.night = eid;
        }
      }
    }

    this._discoveredEntities = found;
  }

  _callButton(entityId) {
    if (!this._hass || !entityId) return;
    this._hass.callService("button", "press", { entity_id: entityId });
  }

  _callSwitch(entityId) {
    if (!this._hass || !entityId) return;
    this._hass.callService("switch", "toggle", { entity_id: entityId });
  }

  _cycleNightMode(entityId) {
    if (!this._hass || !entityId) return;
    const current = this._hass.states[entityId]?.state || 'auto';
    const cycle = { 'auto': 'always_on', 'always_on': 'off', 'off': 'auto' };
    const next = cycle[current] || 'auto';
    this._hass.callService("select", "select_option", { entity_id: entityId, option: next });
  }

  async _toggleMicrophone() {
    const centerBtn = this.shadowRoot.getElementById('btnCenter');
    const label = this.shadowRoot.getElementById('centerLabel');

    if (!this._isTalking) {
      try {
        this._micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        this._micAudioTrack = this._micStream.getAudioTracks()[0];
        this._isTalking = true;
        if (centerBtn) centerBtn.classList.add('talking');
        if (label) label.innerText = 'HABLANDO...';

        // Direct WebRTC audio broadcast to go2rtc
        const streamName = this._resolveStreamName(this._config.camera_entity);
        if (streamName && window.RTCPeerConnection) {
          this._startWebRTCAudioPush(streamName);
        }
      } catch (err) {
        console.warn("Microphone access error:", err);
        alert("Permiso de micrófono no concedido en el navegador: " + err.message);
      }
    } else {
      if (this._micStream) {
        this._micStream.getTracks().forEach(t => t.stop());
        this._micStream = null;
        this._micAudioTrack = null;
      }
      if (this._audioPeerConnection) {
        try { this._audioPeerConnection.close(); } catch (_) {}
        this._audioPeerConnection = null;
      }
      this._isTalking = false;
      if (centerBtn) centerBtn.classList.remove('talking');
      if (label) label.innerText = 'HABLAR';
    }
  }

  async _startWebRTCAudioPush(streamName) {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      this._audioPeerConnection = pc;

      if (this._micAudioTrack) {
        pc.addTrack(this._micAudioTrack, this._micStream);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch(`/api/go2rtc/webrtc?src=${encodeURIComponent(streamName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ sdp: offer.sdp })
      });

      if (response.ok) {
        const answer = await response.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      }
    } catch (e) {
      console.debug("WebRTC audio backchannel negotiation:", e);
    }
  }

  _render() {
    const title = this._config.title || (
      this._hass && this._config.camera_entity && this._hass.states[this._config.camera_entity]
        ? this._hass.states[this._config.camera_entity].attributes.friendly_name || 'Cámara Chuangmi 2K'
        : 'Cámara Chuangmi PTZ'
    );

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          overflow: hidden;
          background: #101216;
          border-radius: 18px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.45);
          color: #e5e7eb;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px 10px 18px;
          background: linear-gradient(180deg, rgba(24, 27, 32, 0.95) 0%, rgba(16, 18, 22, 0.85) 100%);
        }
        .header-title {
          font-weight: 700;
          font-size: 1.05rem;
          letter-spacing: 0.3px;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .badge {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 20px;
          letter-spacing: 0.6px;
          border: 1px solid rgba(16, 185, 129, 0.35);
          text-transform: uppercase;
        }
        .video-container {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000;
          overflow: hidden;
        }
        webrtc-camera {
          width: 100%;
          height: 100%;
          display: block;
        }
        .controls-panel {
          padding: 20px 16px 14px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          background: #14171d;
        }
        /* CIRCULAR PTZ DPAD */
        .ptz-circle {
          position: relative;
          width: 210px;
          height: 210px;
          background: radial-gradient(circle, #222731 0%, #161920 100%);
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.07);
          box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.6), 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        .dpad-btn {
          position: absolute;
          background: transparent;
          border: none;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          outline: none;
          transition: transform 0.08s ease, color 0.1s ease;
          padding: 0;
          margin: 0;
          -webkit-tap-highlight-color: transparent;
        }
        .dpad-btn:active {
          transform: scale(0.92);
          color: #10b981;
        }
        .dpad-btn svg {
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        }
        .btn-up {
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          width: 60px;
          height: 50px;
        }
        .btn-down {
          bottom: 8px;
          left: 50%;
          transform: translateX(-50%);
          width: 60px;
          height: 50px;
        }
        .btn-left {
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 50px;
          height: 60px;
        }
        .btn-right {
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 50px;
          height: 60px;
        }
        /* CENTER MICROPHONE INTERCOM */
        .btn-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 76px;
          height: 76px;
          border-radius: 50%;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: 3px solid #14171d;
          box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          outline: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 10;
        }
        .btn-center:hover {
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.55);
        }
        .btn-center:active, .btn-center.talking {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          box-shadow: 0 0 25px rgba(239, 68, 68, 0.8);
          transform: translate(-50%, -50%) scale(0.96);
          animation: pulse-talking 1.4s infinite;
        }
        @keyframes pulse-talking {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 16px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .center-label {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.5px;
          margin-top: 2px;
          text-transform: uppercase;
        }
        /* BOTTOM 3-ACTION BAR */
        .action-bar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          width: 100%;
          max-width: 380px;
          padding: 8px 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 4px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          outline: none;
        }
        .action-btn:hover {
          background: rgba(255, 255, 255, 0.07);
          color: #f1f5f9;
        }
        .action-btn:active {
          transform: scale(0.94);
        }
        .action-btn.active {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.35);
          color: #10b981;
        }
        .action-btn svg {
          width: 22px;
          height: 22px;
          fill: currentColor;
        }
      </style>

      <ha-card>
        <div class="header">
          <div class="header-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#10b981">
              <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
            </svg>
            <span id="cardTitle">${title}</span>
          </div>
          <div class="badge">2K WEBRTC</div>
        </div>

        <div class="video-container" id="videoContainer"></div>

        <div class="controls-panel">
          <div class="ptz-circle">
            <button class="dpad-btn btn-up" id="btnUp" title="Arriba">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z"/>
              </svg>
            </button>
            <button class="dpad-btn btn-left" id="btnLeft" title="Izquierda">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M15.41,16.59L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.59Z"/>
              </svg>
            </button>

            <!-- CENTER BUTTON: TWO-WAY INTERCOM / MICROPHONE -->
            <button class="btn-center" id="btnCenter" title="Pulsar para hablar">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
              </svg>
              <span class="center-label" id="centerLabel">HABLAR</span>
            </button>

            <button class="dpad-btn btn-right" id="btnRight" title="Derecha">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M8.59,16.59L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.59Z"/>
              </svg>
            </button>
            <button class="dpad-btn btn-down" id="btnDown" title="Abajo">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M7.41,8.59L12,13.17L16.59,8.59L18,10L12,16L6,10L7.41,8.59Z"/>
              </svg>
            </button>
          </div>

          <!-- Bottom Action Bar: ONLY Invertir cámara, Modo noche, Modo privacidad -->
          <div class="action-bar">
            <!-- 1. Invertir Cámara (Flip 180°) -->
            <button class="action-btn" id="btnFlip" title="Invertir imagen 180°">
              <svg viewBox="0 0 24 24"><path d="M19,7H16V9H19A3,3 0 0,1 22,12A3,3 0 0,1 19,15H16V17H19A5,5 0 0,0 24,12A5,5 0 0,0 19,7M5,7A5,5 0 0,0 0,12A5,5 0 0,0 5,17H8V15H5A3,3 0 0,1 2,12A3,3 0 0,1 5,9H8V7H5M7,11H17V13H7V11Z"/></svg>
              <span>Invertir</span>
            </button>

            <!-- 2. Modo Noche (Night Vision) -->
            <button class="action-btn" id="btnNight" title="Modo Noche / Visión Nocturna">
              <svg viewBox="0 0 24 24"><path d="M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.84 4.94,4.94C7.77,2.1 11.83,1.38 15.34,3.14C16.15,3.55 16.03,4.68 15.17,4.88C11.8,5.65 9.29,8.68 9.29,12.35C9.29,16.42 12.58,19.71 16.65,19.71C17.47,19.71 18.25,19.57 18.97,19.32V15.95Z"/></svg>
              <span>Modo Noche</span>
            </button>

            <!-- 3. Modo Privacidad (Reposo / Apagado) -->
            <button class="action-btn" id="btnSleep" title="Modo Privacidad (Reposo / Apagado)">
              <svg viewBox="0 0 24 24"><path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.82 18,15.47C17.76,16 17.47,16.5 17.13,17Z"/></svg>
              <span>Privacidad</span>
            </button>
          </div>
        </div>
      </ha-card>
    `;

    // Embed WebRTC element
    const container = this.shadowRoot.getElementById('videoContainer');
    container.innerHTML = '';
    const webrtc = document.createElement('webrtc-camera');
    const streamName = this._resolveStreamName(this._config.camera_entity);
    webrtc.setConfig({
      url: streamName,
      entity: this._config.camera_entity,
      mode: 'webrtc'
    });
    if (this._hass) {
      webrtc.hass = this._hass;
    }
    container.appendChild(webrtc);

    // Event listeners for PTZ
    this.shadowRoot.getElementById('btnUp').onclick = () => this._callButton(this._discoveredEntities.ptz_up);
    this.shadowRoot.getElementById('btnDown').onclick = () => this._callButton(this._discoveredEntities.ptz_down);
    this.shadowRoot.getElementById('btnLeft').onclick = () => this._callButton(this._discoveredEntities.ptz_left);
    this.shadowRoot.getElementById('btnRight').onclick = () => this._callButton(this._discoveredEntities.ptz_right);

    // Center button: Microphone intercom
    this.shadowRoot.getElementById('btnCenter').onclick = () => this._toggleMicrophone();

    // 3 Action buttons
    this.shadowRoot.getElementById('btnFlip').onclick = () => this._callSwitch(this._discoveredEntities.flip);
    this.shadowRoot.getElementById('btnNight').onclick = () => this._cycleNightMode(this._discoveredEntities.night);
    this.shadowRoot.getElementById('btnSleep').onclick = () => this._callSwitch(this._discoveredEntities.sleep);

    this._rendered = true;
    this._updateStates();
  }

  _updateStates() {
    if (!this._hass) return;

    // Flip button state
    const flipBtn = this.shadowRoot.getElementById('btnFlip');
    if (flipBtn && this._discoveredEntities.flip) {
      const state = this._hass.states[this._discoveredEntities.flip]?.state;
      flipBtn.classList.toggle('active', state === 'on');
    }

    // Night mode button state
    const nightBtn = this.shadowRoot.getElementById('btnNight');
    if (nightBtn && this._discoveredEntities.night) {
      const state = this._hass.states[this._discoveredEntities.night]?.state;
      nightBtn.classList.toggle('active', state === 'always_on' || state === 'auto');
    }

    // Privacy / Sleep button state
    const sleepBtn = this.shadowRoot.getElementById('btnSleep');
    if (sleepBtn && this._discoveredEntities.sleep) {
      const state = this._hass.states[this._discoveredEntities.sleep]?.state;
      sleepBtn.classList.toggle('active', state === 'off');
    }
  }

  getCardSize() {
    return 7;
  }
}

/**
 * Visual Configuration Editor for Chuangmi PTZ Card
 * Features strict filtering of Chuangmi Liberator cameras
 */
class ChuangmiPTZCardEditor extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass) return;
    this.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 16px; padding: 12px 0;';

    // 1. Strict filter of Chuangmi Liberator cameras
    const chuangmiCameras = [];
    for (const [eid, state] of Object.entries(this._hass.states)) {
      if (eid.startsWith('camera.')) {
        const attrs = state.attributes || {};
        const isChuangmi = (
          attrs.brand === 'Chuangmi Liberator WebRTC' ||
          (attrs.stream_name && attrs.stream_name.startsWith('chuangmi_')) ||
          attrs.did ||
          eid.includes('camera_entrada_camera_') ||
          eid.includes('camara_portable_live_camera')
        );

        if (isChuangmi) {
          chuangmiCameras.push({
            value: eid,
            label: `${attrs.friendly_name || eid} (${eid})`
          });
        }
      }
    }

    // Fallback if none detected yet: scan all cameras except excluded ones
    if (chuangmiCameras.length === 0) {
      for (const [eid, state] of Object.entries(this._hass.states)) {
        if (eid.startsWith('camera.') && !eid.includes('comedor') && !eid.includes('oukitel')) {
          chuangmiCameras.push({
            value: eid,
            label: `${state.attributes.friendly_name || eid} (${eid})`
          });
        }
      }
    }

    const currentEntity = this._config.camera_entity || (chuangmiCameras[0] ? chuangmiCameras[0].value : '');

    // Title input
    const titleBox = document.createElement('div');
    titleBox.innerHTML = `
      <label style="display:block; font-weight:600; margin-bottom:6px; color:var(--primary-text-color);">Título de la tarjeta:</label>
      <input type="text" id="cfgTitle" value="${this._config.title || ''}" placeholder="Cámara Entrada (2K PTZ)"
        style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); box-sizing: border-box;" />
    `;
    container.appendChild(titleBox);

    // Camera Selector Dropdown
    const selectorBox = document.createElement('div');
    const optionsHtml = chuangmiCameras.map(cam => `
      <option value="${cam.value}" ${cam.value === currentEntity ? 'selected' : ''}>${cam.label}</option>
    `).join('');

    selectorBox.innerHTML = `
      <label style="display:block; font-weight:600; margin-bottom:6px; color:var(--primary-text-color);">Seleccionar Cámara Chuangmi / Xiaomi:</label>
      <select id="cfgEntity" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); box-sizing: border-box; cursor: pointer;">
        ${optionsHtml}
      </select>
      <small style="display:block; margin-top:6px; color:var(--secondary-text-color);">
        ✨ Detección automática: la cruceta PTZ, el micrófono bidireccional y las acciones inferiores se vinculan automáticamente sin escribir IDs ni parámetros manuales.
      </small>
    `;
    container.appendChild(selectorBox);

    // Event handlers
    const updateConfig = () => {
      const titleInput = this.querySelector('#cfgTitle');
      const entitySelect = this.querySelector('#cfgEntity');
      const newConfig = {
        ...this._config,
        title: titleInput ? titleInput.value : '',
        camera_entity: entitySelect ? entitySelect.value : currentEntity,
      };

      this._config = newConfig;
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: newConfig },
        bubbles: true,
        composed: true
      }));
    };

    titleBox.querySelector('#cfgTitle').addEventListener('input', updateConfig);
    selectorBox.querySelector('#cfgEntity').addEventListener('change', updateConfig);

    this.appendChild(container);
  }
}

customElements.define('chuangmi-ptz-card-editor', ChuangmiPTZCardEditor);
ChuangmiPTZCard.getConfigElement = () => document.createElement('chuangmi-ptz-card-editor');

customElements.define('chuangmi-ptz-card', ChuangmiPTZCard);

// Register in Home Assistant Card Picker ("Add to dashboard")
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'chuangmi-ptz-card',
  name: 'Chuangmi PTZ Camera Card',
  description: 'WebRTC 2K live stream with PTZ controls, two-way audio, and local camera controls for Chuangmi / Imilab cameras.',
  preview: true,
  documentationURL: 'https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc'
});

console.info(
  '%c CHUANGMI-PTZ-CARD %c v1.0.0 REPO RELEASE & DYNAMIC ZERO-CONFIG ',
  'color: white; background: #10b981; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
  'color: #10b981; background: #18181b; font-weight: bold; padding: 2px 6px; border-radius: 4px;'
);
