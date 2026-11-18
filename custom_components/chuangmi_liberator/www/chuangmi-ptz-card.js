/**
 * Chuangmi / Imilab PTZ Camera Lovelace Card for Home Assistant (v1.6.4)
 * Features:
 *  - Ultra-low-latency 2K/HD WebRTC streaming via go2rtc
 *  - Tactile PTZ controller with directional buttons
 *  - Center intercom/microphone button for bidirectional audio
 *  - Clean bottom bar with 3 actions: Flip 180°, Night Mode, and Privacy Mode
 *  - Clean, professional camera listing in dropdown
 *  - Full bilingual localization (English / Spanish) with auto-detection
 *  - Direct, reliable go2rtc stream binding without WebSocket proxy errors
 */

// Register in Home Assistant Lovelace Card Picker immediately
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'chuangmi-ptz-card')) {
  window.customCards.push({
    type: 'chuangmi-ptz-card',
    name: 'Cámara Chuangmi PTZ / Chuangmi PTZ Camera',
    description: 'WebRTC 2K live stream with PTZ controls, two-way audio, and local camera controls for Chuangmi / Imilab / Xiaomi cameras. Cámara PTZ Xiaomi.',
    preview: true,
    documentationURL: 'https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc'
  });
}
try {
  window.dispatchEvent(new CustomEvent('custom-card-registered', { detail: 'chuangmi-ptz-card' }));
} catch (e) {}

const CARD_I18N = {
  es: {
    talk: 'HABLAR',
    talking: 'HABLANDO...',
    talk_tooltip: 'Mantener pulsado o hacer clic para hablar (Intercomunicador)',
    flip: 'Invertir',
    flip_tooltip: 'Invertir imagen 180°',
    night: 'Modo Noche',
    night_tooltip: 'Modo Noche / Visión Nocturna',
    privacy: 'Privacidad',
    privacy_tooltip: 'Modo Privacidad (Reposo / Apagado)',
    up: 'Mover Arriba',
    down: 'Mover Abajo',
    left: 'Mover Izquierda',
    right: 'Mover Derecha',
    editor_title: 'Título de la tarjeta:',
    editor_title_placeholder: 'Cámara Entrada (2K PTZ)',
    editor_select_camera: 'Seleccionar Cámara Chuangmi / Xiaomi:',
    editor_helper: '✨ Detección automática: la cruceta PTZ, el micrófono bidireccional y las acciones inferiores se vinculan automáticamente sin escribir IDs ni parámetros manuales.',
    card_name: 'Tarjeta Cámara Chuangmi PTZ',
    card_desc: 'Streaming WebRTC 2K en directo con controles PTZ, audio bidireccional y controles locales para cámaras Chuangmi / Imilab.',
    badge: '2K WEBRTC',
    default_title: 'Cámara Chuangmi PTZ'
  },
  en: {
    talk: 'TALK',
    talking: 'TALKING...',
    talk_tooltip: 'Click or hold to talk (Intercom)',
    flip: 'Flip 180°',
    flip_tooltip: 'Flip image 180°',
    night: 'Night Mode',
    night_tooltip: 'Night Vision / Night Mode',
    privacy: 'Privacy',
    privacy_tooltip: 'Privacy Mode (Sleep / Power)',
    up: 'Move Up',
    down: 'Move Down',
    left: 'Move Left',
    right: 'Move Right',
    editor_title: 'Card title:',
    editor_title_placeholder: 'Entrance Camera (2K PTZ)',
    editor_select_camera: 'Select Chuangmi / Xiaomi Camera:',
    editor_helper: '✨ Auto-detection: the PTZ D-pad, two-way microphone, and action buttons link automatically without manual IDs.',
    card_name: 'Chuangmi PTZ Camera Card',
    card_desc: '2K live WebRTC streaming with PTZ controls, two-way audio, and local controls for Chuangmi / Imilab cameras.',
    badge: '2K WEBRTC',
    default_title: 'Chuangmi PTZ Camera'
  }
};

function getCardI18n(hass) {
  const lang = (hass?.locale?.language || hass?.language || navigator.language || 'en').toLowerCase();
  return lang.startsWith('es') ? CARD_I18N.es : CARD_I18N.en;
}

function cleanCameraDisplayName(name, did = '') {
  if (!name) return 'Cámara';
  let cleaned = name.replace(/\s+(Live Camera|Cámara en directo|Camera Control|Control de cámara)$/i, '').trim();
  if (cleaned.startsWith('camera.')) {
    cleaned = cleaned.replace(/^camera\./, '');
  }
  if (cleaned.toLowerCase() === 'camera entrada' || cleaned.toLowerCase() === 'camera_entrada' || cleaned.toLowerCase() === 'entrada') {
    cleaned = 'Cámara Entrada';
  } else if (cleaned.toLowerCase() === 'camara portable' || cleaned.toLowerCase() === 'camara_portable' || cleaned.toLowerCase() === 'portable') {
    cleaned = 'Cámara portable';
  } else {
    cleaned = cleaned.replace(/_/g, ' ');
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }
  return did ? `${cleaned} (${did})` : cleaned;
}

function getCameraAssignedName(camState, config, hass) {
  if (config?.title && config.title.trim()) {
    return config.title.trim();
  }
  if (camState && camState.attributes) {
    const fn = camState.attributes.friendly_name;
    if (fn && fn.trim()) {
      return cleanCameraDisplayName(fn.trim(), '');
    }
  }
  if (hass && hass.states) {
    const targetEntity = config?.camera_entity;
    if (targetEntity && hass.states[targetEntity]?.attributes?.friendly_name) {
      return cleanCameraDisplayName(hass.states[targetEntity].attributes.friendly_name, '');
    }
    const targetDid = config?.did;
    const targetStream = config?.stream_name;
    for (const [eid, state] of Object.entries(hass.states)) {
      if (eid.startsWith('camera.')) {
        const attrs = state.attributes || {};
        if ((targetDid && attrs.did === targetDid) || (targetStream && attrs.stream_name === targetStream)) {
          if (attrs.friendly_name) {
            return cleanCameraDisplayName(attrs.friendly_name, '');
          }
        }
      }
    }
  }
  if (config?.camera_entity) {
    return cleanCameraDisplayName(config.camera_entity, '');
  }
  return getCardI18n(hass).default_title;
}

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
      throw new Error('Invalid configuration');
    }
    this._config = { ...config };
    if (this._hass) {
      this._updateEntities();
    }
    this._render();
  }

  set hass(hass) {
    const hadHass = !!this._hass;
    this._hass = hass;
    this._updateEntities();

    if (!this._rendered) {
      this._render();
    } else {
      this._updateStates();
      // Ensure webrtc-camera element receives hass
      const webrtc = this.shadowRoot.querySelector('webrtc-camera');
      if (webrtc) {
        if (!hadHass) {
          const streamName = this._resolveStreamName(this._config.camera_entity);
          if (streamName) {
            try {
              webrtc.setConfig({ url: streamName, mode: 'webrtc' });
            } catch (e) {}
          }
        }
        webrtc.hass = hass;
      }
    }
  }

  static getStubConfig(hass, unusedEntities, allEntities) {
    let defaultCam = '';
    let defaultStream = '';
    let defaultDid = '';

    if (hass && hass.states) {
      for (const [eid, state] of Object.entries(hass.states)) {
        if (eid.startsWith('camera.')) {
          const attrs = state.attributes || {};
          if (
            attrs.brand === 'Chuangmi Liberator WebRTC' ||
            (attrs.stream_name && attrs.stream_name.startsWith('chuangmi_')) ||
            attrs.did ||
            eid.includes('camera_entrada') ||
            eid.includes('camara_portable')
          ) {
            defaultCam = eid;
            defaultDid = attrs.did || (eid.includes('369136473') ? '369136473' : (eid.includes('369135587') ? '369135587' : ''));
            defaultStream = attrs.stream_name || (defaultDid ? `chuangmi_${defaultDid}` : '');
            break;
          }
        }
      }
    }

    return {
      type: 'custom:chuangmi-ptz-card',
      camera_entity: defaultCam,
      stream_name: defaultStream,
      did: defaultDid,
      title: ''
    };
  }

  _resolveStreamName(camEntity) {
    if (this._config && this._config.stream_name) {
      return this._config.stream_name;
    }
    if (!camEntity) return '';

    if (this._hass && this._hass.states[camEntity]) {
      const attrs = this._hass.states[camEntity].attributes || {};
      if (attrs.stream_name) return attrs.stream_name;
      if (attrs.did) return `chuangmi_${attrs.did}`;
    }

    const lower = camEntity.toLowerCase();
    if (lower.includes('369136473') || lower.includes('entrada')) return 'chuangmi_369136473';
    if (lower.includes('369135587') || lower.includes('portable')) return 'chuangmi_369135587';

    const match = camEntity.match(/\d{8,10}/);
    if (match) return `chuangmi_${match[0]}`;

    return camEntity;
  }

  _updateEntities() {
    if (!this._hass) return;
    const camEntity = this._config.camera_entity;
    if (!camEntity) return;

    const camState = this._hass.states[camEntity];
    const attrs = camState?.attributes || {};
    const did = attrs.did || this._config.did || (camEntity.includes('369136473') ? '369136473' : (camEntity.includes('369135587') ? '369135587' : ''));

    const isEntrada = did === '369136473' || camEntity.toLowerCase().includes('entrada');
    const isPortable = did === '369135587' || camEntity.toLowerCase().includes('portable');
    const key = isEntrada ? 'entrada' : (isPortable ? 'portable' : '');

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
      const eidLower = eid.toLowerCase();
      const fnLower = (s.attributes?.friendly_name || '').toLowerCase();
      const entityDid = s.attributes?.did || '';

      const matchesCamera = (
        (did && (entityDid === did || eidLower.includes(did))) ||
        (key && (eidLower.includes(key) || fnLower.includes(key)))
      );

      if (!matchesCamera) continue;

      if (eid.startsWith('button.')) {
        if (eidLower.includes('up') || eidLower.includes('arriba') || fnLower.includes('up')) found.ptz_up = eid;
        else if (eidLower.includes('down') || eidLower.includes('abajo') || fnLower.includes('down')) found.ptz_down = eid;
        else if (eidLower.includes('left') || eidLower.includes('izquierda') || fnLower.includes('left')) found.ptz_left = eid;
        else if (eidLower.includes('right') || eidLower.includes('derecha') || fnLower.includes('right')) found.ptz_right = eid;
      } else if (eid.startsWith('switch.')) {
        if (eidLower.includes('flip') || eidLower.includes('voltear') || fnLower.includes('flip')) found.flip = eid;
        else if (eidLower.includes('power') || eidLower.includes('reposo') || eidLower.includes('sleep') || fnLower.includes('power') || fnLower.includes('sleep')) found.sleep = eid;
      } else if (eid.startsWith('select.')) {
        if (eidLower.includes('night') || eidLower.includes('nocturna') || fnLower.includes('night')) found.night = eid;
      }
    }

    this._discoveredEntities = found;
  }

  _callButton(entityId) {
    if (!this._hass || !entityId) return;
    this._hass.callService('button', 'press', { entity_id: entityId });
  }

  _callSwitch(entityId) {
    if (!this._hass || !entityId) return;
    this._hass.callService('switch', 'toggle', { entity_id: entityId });
  }

  _cycleNightMode(entityId) {
    if (!this._hass || !entityId) return;
    const current = this._hass.states[entityId]?.state || 'auto';
    const cycle = { 'auto': 'always_on', 'always_on': 'off', 'off': 'auto' };
    const next = cycle[current] || 'auto';
    this._hass.callService('select', 'select_option', { entity_id: entityId, option: next });
  }

  async _toggleMicrophone() {
    const i18n = getCardI18n(this._hass);
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
        if (label) label.innerText = i18n.talking;

        const streamName = this._resolveStreamName(this._config.camera_entity);
        if (streamName && window.RTCPeerConnection) {
          this._startWebRTCAudioPush(streamName);
        }
      } catch (err) {
        console.warn('Microphone access error:', err);
        alert('Microphone access permission error: ' + err.message);
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
      if (label) label.innerText = i18n.talk;
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
      console.debug('WebRTC audio backchannel negotiation:', e);
    }
  }

  _render() {
    const i18n = getCardI18n(this._hass);
    const camState = this._hass && this._config.camera_entity ? this._hass.states[this._config.camera_entity] : null;
    const title = getCameraAssignedName(camState, this._config, this._hass);

    const streamName = this._resolveStreamName(this._config.camera_entity);

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
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid rgba(16, 185, 129, 0.3);
          letter-spacing: 0.5px;
        }
        .video-container {
          position: relative;
          width: 100%;
          min-height: 240px;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .video-container webrtc-camera {
          width: 100%;
          height: 100%;
          display: block;
        }
        .controls-panel {
          padding: 16px 12px 14px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          background: #13161c;
        }
        .ptz-circle {
          position: relative;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          background: radial-gradient(circle, #1a202c 0%, #0f131a 100%);
          box-shadow: inset 0 2px 5px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .dpad-btn {
          position: absolute;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          border-radius: 50%;
          outline: none;
        }
        .dpad-btn:hover {
          color: #10b981;
          transform: scale(1.15);
        }
        .dpad-btn:active, .dpad-btn.pressed {
          transform: scale(0.95);
          color: #34d399;
          background: rgba(16, 185, 129, 0.25);
        }
        .btn-up    { top: 6px;  left: 50%; transform: translateX(-50%); width: 44px; height: 38px; }
        .btn-down  { bottom: 6px; left: 50%; transform: translateX(-50%); width: 44px; height: 38px; }
        .btn-left  { left: 6px; top: 50%; transform: translateY(-50%); width: 38px; height: 44px; }
        .btn-right { right: 6px; top: 50%; transform: translateY(-50%); width: 38px; height: 44px; }

        .btn-center {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: 3px solid #101216;
          color: #ffffff;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          transition: all 0.2s ease;
          outline: none;
          z-index: 2;
        }
        .btn-center:hover {
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.6);
          transform: scale(1.05);
        }
        .btn-center:active {
          transform: scale(0.95);
        }
        .btn-center.talking {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          box-shadow: 0 0 25px rgba(239, 68, 68, 0.8);
          animation: pulse-talking 1.5s infinite;
        }
        @keyframes pulse-talking {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .center-label {
          font-size: 0.58rem;
          font-weight: 800;
          letter-spacing: 0.5px;
        }
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
          <div class="badge">${i18n.badge}</div>
        </div>

        <div class="video-container" id="videoContainer"></div>

        <div class="controls-panel">
          <div class="ptz-circle">
            <button class="dpad-btn btn-up" id="btnUp" title="${i18n.up}">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z"/>
              </svg>
            </button>
            <button class="dpad-btn btn-left" id="btnLeft" title="${i18n.left}">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M15.41,16.59L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.59Z"/>
              </svg>
            </button>

            <!-- CENTER BUTTON: TWO-WAY INTERCOM / MICROPHONE -->
            <button class="btn-center" id="btnCenter" title="${i18n.talk_tooltip}">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
              </svg>
              <span class="center-label" id="centerLabel">${i18n.talk}</span>
            </button>

            <button class="dpad-btn btn-right" id="btnRight" title="${i18n.right}">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M8.59,16.59L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.59Z"/>
              </svg>
            </button>
            <button class="dpad-btn btn-down" id="btnDown" title="${i18n.down}">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M7.41,8.59L12,13.17L16.59,8.59L18,10L12,16L6,10L7.41,8.59Z"/>
              </svg>
            </button>
          </div>

          <!-- Bottom Action Bar: Flip, Night Mode, Privacy -->
          <div class="action-bar">
            <!-- 1. Invertir Cámara (Flip 180°) -->
            <button class="action-btn" id="btnFlip" title="${i18n.flip_tooltip}">
              <svg viewBox="0 0 24 24"><path d="M19,7H16V9H19A3,3 0 0,1 22,12A3,3 0 0,1 19,15H16V17H19A5,5 0 0,0 24,12A5,5 0 0,0 19,7M5,7A5,5 0 0,0 0,12A5,5 0 0,0 5,17H8V15H5A3,3 0 0,1 2,12A3,3 0 0,1 5,9H8V7H5M7,11H17V13H7V11Z"/></svg>
              <span>${i18n.flip}</span>
            </button>

            <!-- 2. Modo Noche (Night Vision) -->
            <button class="action-btn" id="btnNight" title="${i18n.night_tooltip}">
              <svg viewBox="0 0 24 24"><path d="M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.84 4.94,4.94C7.77,2.1 11.83,1.38 15.34,3.14C16.15,3.55 16.03,4.68 15.17,4.88C11.8,5.65 9.29,8.68 9.29,12.35C9.29,16.42 12.58,19.71 16.65,19.71C17.47,19.71 18.25,19.57 18.97,19.32V15.95Z"/></svg>
              <span>${i18n.night}</span>
            </button>

            <!-- 3. Modo Privacidad (Reposo / Apagado) -->
            <button class="action-btn" id="btnSleep" title="${i18n.privacy_tooltip}">
              <svg viewBox="0 0 24 24"><path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.82 18,15.47C17.76,16 17.47,16.5 17.13,17Z"/></svg>
              <span>${i18n.privacy}</span>
            </button>
          </div>
        </div>
      </ha-card>
    `;

    // Embed WebRTC element - strictly passing url without entity to force direct go2rtc WebRTC routing
    const container = this.shadowRoot.getElementById('videoContainer');
    container.innerHTML = '';
    if (streamName && customElements.get('webrtc-camera')) {
      try {
        const webrtc = document.createElement('webrtc-camera');
        webrtc.setConfig({
          url: streamName,
          mode: 'webrtc'
        });
        if (this._hass) {
          webrtc.hass = this._hass;
        }
        container.appendChild(webrtc);
      } catch (err) {
        console.warn('Could not initialize webrtc-camera in card:', err);
      }
    } else if (!streamName) {
      container.innerHTML = `
        <div style="color: #71717a; font-size: 13px; text-align: center; padding: 24px;">
          <svg style="width:36px;height:36px;opacity:0.4;display:block;margin:0 auto 8px;" viewBox="0 0 24 24"><path fill="currentColor" d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z"/></svg>
          ${isEs ? 'Seleccione una cámara en el editor' : 'Select a camera in card editor'}
        </div>
      `;
    }

    // Event listeners for PTZ (intelligently accounts for 180° inverted ceiling mount)
    const getDirButton = (dir) => {
      const flipState = this._hass && this._discoveredEntities.flip ? this._hass.states[this._discoveredEntities.flip]?.state : 'off';
      const isFlipped = flipState === 'on';

      if (isFlipped) {
        if (dir === 'up') return this._discoveredEntities.ptz_down;
        if (dir === 'down') return this._discoveredEntities.ptz_up;
        if (dir === 'left') return this._discoveredEntities.ptz_right;
        if (dir === 'right') return this._discoveredEntities.ptz_left;
      }
      if (dir === 'up') return this._discoveredEntities.ptz_up;
      if (dir === 'down') return this._discoveredEntities.ptz_down;
      if (dir === 'left') return this._discoveredEntities.ptz_left;
      if (dir === 'right') return this._discoveredEntities.ptz_right;
      return null;
    };

    const triggerPtz = (btnId, dir) => {
      const btn = this.shadowRoot.getElementById(btnId);
      if (btn) {
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 200);
      }
      const targetBtn = getDirButton(dir);
      if (targetBtn) {
        this._callButton(targetBtn);
      }
    };

    this.shadowRoot.getElementById('btnUp').onclick = () => triggerPtz('btnUp', 'up');
    this.shadowRoot.getElementById('btnDown').onclick = () => triggerPtz('btnDown', 'down');
    this.shadowRoot.getElementById('btnLeft').onclick = () => triggerPtz('btnLeft', 'left');
    this.shadowRoot.getElementById('btnRight').onclick = () => triggerPtz('btnRight', 'right');

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

    // Dynamically update card title to user-assigned friendly_name
    const titleEl = this.shadowRoot.getElementById('cardTitle');
    if (titleEl) {
      const camState = this._config.camera_entity ? this._hass.states[this._config.camera_entity] : null;
      const resolvedTitle = getCameraAssignedName(camState, this._config, this._hass);
      if (resolvedTitle && titleEl.textContent !== resolvedTitle) {
        titleEl.textContent = resolvedTitle;
      }
    }

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
 * Features robust DOM persistence to avoid dropdown closing glitches,
 * clean human-friendly camera labels, and full internationalization.
 */
class ChuangmiPTZCardEditor extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._rendered = false;
    this._lastCameraListStr = '';
  }

  setConfig(config) {
    this._config = { ...config };
    if (!this._rendered) {
      this._render();
    } else {
      this._syncValues();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._render();
    } else {
      this._syncOptions();
    }
  }

  _syncValues() {
    const titleInput = this.querySelector('#cfgTitle');
    if (titleInput && titleInput.value !== (this._config.title || '')) {
      titleInput.value = this._config.title || '';
    }
    const entitySelect = this.querySelector('#cfgEntity');
    if (entitySelect && this._config.camera_entity && entitySelect.value !== this._config.camera_entity) {
      entitySelect.value = this._config.camera_entity;
    }
  }

  _getCameras() {
    if (!this._hass || !this._hass.states) return [];
    const chuangmiCameras = [];
    for (const [eid, state] of Object.entries(this._hass.states)) {
      if (eid.startsWith('camera.')) {
        const attrs = state.attributes || {};
        const isChuangmi = (
          attrs.brand === 'Chuangmi Liberator WebRTC' ||
          (attrs.stream_name && attrs.stream_name.startsWith('chuangmi_')) ||
          attrs.did ||
          eid.includes('camera_entrada') ||
          eid.includes('camara_portable')
        );

        if (isChuangmi) {
          const did = attrs.did || (eid.includes('369136473') ? '369136473' : (eid.includes('369135587') ? '369135587' : ''));
          const streamName = attrs.stream_name || (did ? `chuangmi_${did}` : '');
          const cleanName = cleanCameraDisplayName(attrs.friendly_name || eid, '');

          chuangmiCameras.push({
            value: eid,
            label: cleanName,
            stream_name: streamName,
            did: did
          });
        }
      }
    }

    if (chuangmiCameras.length === 0) {
      for (const [eid, state] of Object.entries(this._hass.states)) {
        if (eid.startsWith('camera.') && !eid.includes('comedor') && !eid.includes('oukitel')) {
          chuangmiCameras.push({
            value: eid,
            label: cleanCameraDisplayName(state.attributes.friendly_name || eid, ''),
            stream_name: eid,
            did: ''
          });
        }
      }
    }
    return chuangmiCameras;
  }

  _syncOptions() {
    const cameras = this._getCameras();
    const camStr = cameras.map(c => c.value).join('|');
    if (camStr === this._lastCameraListStr) {
      return; // No entity change, do not touch DOM!
    }
    this._lastCameraListStr = camStr;

    const select = this.querySelector('#cfgEntity');
    if (!select) return;

    const currentVal = select.value || this._config.camera_entity || (cameras[0] ? cameras[0].value : '');
    select.innerHTML = cameras.map(cam => `
      <option value="${cam.value}" ${cam.value === currentVal ? 'selected' : ''}>${cam.label}</option>
    `).join('');
    select.value = currentVal;
  }

  _render() {
    if (!this._hass) return;

    const i18n = getCardI18n(this._hass);
    const cameras = this._getCameras();
    this._lastCameraListStr = cameras.map(c => c.value).join('|');

    const currentEntity = this._config.camera_entity || (cameras[0] ? cameras[0].value : '');

    this.innerHTML = '';
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 16px; padding: 12px 0;';

    // 1. Title input
    const titleBox = document.createElement('div');
    titleBox.innerHTML = `
      <label style="display:block; font-weight:600; margin-bottom:6px; color:var(--primary-text-color);">${i18n.editor_title}</label>
      <input type="text" id="cfgTitle" value="${this._config.title || ''}" placeholder="${i18n.editor_title_placeholder}"
        style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); box-sizing: border-box;" />
    `;
    container.appendChild(titleBox);

    // 2. Camera Selector Dropdown
    const selectorBox = document.createElement('div');
    const optionsHtml = cameras.map(cam => `
      <option value="${cam.value}" ${cam.value === currentEntity ? 'selected' : ''}>${cam.label}</option>
    `).join('');

    selectorBox.innerHTML = `
      <label style="display:block; font-weight:600; margin-bottom:6px; color:var(--primary-text-color);">${i18n.editor_select_camera}</label>
      <select id="cfgEntity" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); box-sizing: border-box; cursor: pointer;">
        ${optionsHtml}
      </select>
      <small style="display:block; margin-top:6px; color:var(--secondary-text-color);">
        ${i18n.editor_helper}
      </small>
    `;
    container.appendChild(selectorBox);

    // Event handlers
    const updateConfig = () => {
      const titleInput = this.querySelector('#cfgTitle');
      const entitySelect = this.querySelector('#cfgEntity');
      const selectedVal = entitySelect ? entitySelect.value : currentEntity;
      const selectedCam = cameras.find(c => c.value === selectedVal);

      const newConfig = {
        ...this._config,
        title: titleInput ? titleInput.value : '',
        camera_entity: selectedVal,
        stream_name: selectedCam ? selectedCam.stream_name : '',
        did: selectedCam ? selectedCam.did : ''
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
    this._rendered = true;
  }
}

customElements.define('chuangmi-ptz-card-editor', ChuangmiPTZCardEditor);
ChuangmiPTZCard.getConfigElement = () => document.createElement('chuangmi-ptz-card-editor');

customElements.define('chuangmi-ptz-card', ChuangmiPTZCard);

// Register in Home Assistant Card Picker (bottom safeguard)
window.customCards = window.customCards || [];
window.customCards = window.customCards.filter(c => c.type !== 'chuangmi-ptz-card');
window.customCards.push({
  type: 'chuangmi-ptz-card',
  name: 'Cámara Chuangmi PTZ / Chuangmi PTZ Camera',
  description: 'WebRTC 2K live stream with PTZ controls, two-way audio, and local camera controls for Chuangmi / Imilab / Xiaomi cameras. Cámara PTZ Xiaomi.',
  preview: true,
  documentationURL: 'https://github.com/VictorCV-DAM/ha-chuangmi-liberator-webrtc'
});
try {
  window.dispatchEvent(new CustomEvent('custom-card-registered', { detail: 'chuangmi-ptz-card' }));
} catch (e) {}

console.info(
  '%c CHUANGMI-PTZ-CARD %c v1.6.4 USER-ASSIGNED-TITLES & DIRECT-WEBRTC ',
  'color: white; background: #10b981; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
  'color: #10b981; background: #18181b; font-weight: bold; padding: 2px 6px; border-radius: 4px;'
);
