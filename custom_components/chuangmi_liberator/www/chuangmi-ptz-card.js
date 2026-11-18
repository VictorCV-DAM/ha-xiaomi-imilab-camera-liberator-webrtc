/**
 * Chuangmi / Imilab PTZ Camera Lovelace Card for Home Assistant (v1.9.1)
 * Features:
 *  - 2K WebRTC streaming via go2rtc
 *  - Tactile PTZ controller with directional buttons
 *  - Center intercom/microphone button for bidirectional audio
 *  - Clean bottom bar with 3 actions: Flip 180°, Night Mode, and Privacy Mode
 *  - Clean, professional camera listing in dropdown
 *  - Pure Spanish localization with zero English leakage
 *  - Clickable title to open Home Assistant device/entity info modal
 *  - Direct, reliable go2rtc stream binding without WebSocket proxy errors
 */

// Register in Home Assistant Lovelace Card Picker immediately
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'chuangmi-ptz-card')) {
  window.customCards.push({
    type: 'chuangmi-ptz-card',
    name: 'Chuangmi PTZ Camera (Cámara PTZ)',
    description: 'Live 2K WebRTC streaming with PTZ controls, instant recording, and local toggles for Chuangmi / Imilab cameras.',
    preview: true,
    documentationURL: 'https://github.com/VictorCV-DAM/ha-xiaomi-imilab-camera-liberator-webrtc'
  });
}
try {
  window.dispatchEvent(new CustomEvent('custom-card-registered', { detail: 'chuangmi-ptz-card' }));
} catch (e) {}

const CARD_I18N = {
  es: {
    record: 'GRABAR',
    recording: 'GRABANDO',
    record_tooltip: 'Hacer clic para grabar vídeo en directo / Detener grabación',
    record_saved: '¡Grabación guardada!',
    flip: 'Invertir',
    flip_tooltip: 'Invertir imagen 180°',
    night_vision: 'Visión Nocturna',
    night_vision_auto: 'Auto',
    night_vision_on: 'Visión Nocturna',
    night_vision_off: 'Desactivado',
    night_tooltip: 'Visión Nocturna (Auto / Activada / Desactivada)',
    privacy: 'Privacidad',
    privacy_tooltip: 'Modo Privacidad (Reposo / Apagado)',
    up: 'Mover Arriba',
    down: 'Mover Abajo',
    left: 'Mover Izquierda',
    right: 'Mover Derecha',
    editor_title: 'Título de la tarjeta:',
    editor_title_placeholder: 'Cámara (2K PTZ)',
    editor_select_camera: 'Seleccionar Cámara Chuangmi / Xiaomi:',
    editor_helper: '✨ Detección automática: la cruceta PTZ, el botón de grabación y las acciones inferiores se vinculan automáticamente sin escribir IDs ni parámetros manuales.',
    card_name: 'Tarjeta Cámara Chuangmi PTZ',
    card_desc: 'Streaming WebRTC 2K en directo con controles PTZ, grabación instantánea y controles locales para cámaras Chuangmi / Imilab.',
    hide_controls: 'Ocultar controles (Cruceta PTZ y acciones)',
    show_controls: 'Desplegar controles (Cruceta PTZ y acciones)',
    editor_show_controls: 'Mostrar controles inferiores (Cruceta PTZ y acciones)',
    editor_hide_header: 'Ocultar barra superior / cabecera',
    connecting: 'Conectando con la cámara...',
    buffering: 'Reanudando emisión...',
    stream_error: 'Emisión no disponible o reconectando...',
    retry: 'Reintentar conexión',
    default_title: 'Cámara Chuangmi PTZ',
    more_info_tooltip: 'Ver información y detalles del dispositivo'
  },
  en: {
    record: 'RECORD',
    recording: 'RECORDING',
    record_tooltip: 'Click to record live clip / Stop recording',
    record_saved: 'Recording saved!',
    flip: 'Flip',
    flip_tooltip: 'Flip image 180°',
    night_vision: 'Night Vision',
    night_vision_auto: 'Auto',
    night_vision_on: 'Night Vision',
    night_vision_off: 'Off',
    night_tooltip: 'Night Vision (Auto / On / Off)',
    privacy: 'Privacy',
    privacy_tooltip: 'Privacy Mode (Sleep / Standby)',
    up: 'Move Up',
    down: 'Move Down',
    left: 'Move Left',
    right: 'Move Right',
    editor_title: 'Card title:',
    editor_title_placeholder: 'Camera (2K PTZ)',
    editor_select_camera: 'Select Chuangmi / Xiaomi Camera:',
    editor_helper: '✨ Automatic detection: PTZ D-pad, record button, and bottom action buttons bind automatically.',
    card_name: 'Chuangmi PTZ Camera Card',
    card_desc: 'Live 2K WebRTC streaming with PTZ controls, instant recording, and local toggles for Chuangmi / Imilab cameras.',
    hide_controls: 'Hide controls (PTZ D-pad & actions)',
    show_controls: 'Show controls (PTZ D-pad & actions)',
    editor_show_controls: 'Show bottom controls (PTZ D-pad & actions)',
    editor_hide_header: 'Hide top bar / header',
    connecting: 'Connecting to camera...',
    buffering: 'Resuming stream...',
    stream_error: 'Stream unavailable or reconnecting...',
    retry: 'Retry connection',
    default_title: 'Chuangmi PTZ Camera',
    more_info_tooltip: 'View device info and settings'
  }
};

function getCardI18n(hass) {
  let lang = '';
  if (hass) {
    lang = hass.locale?.language || hass.language || hass.selectedLanguage || '';
  }
  if (!lang && typeof document !== 'undefined') {
    try {
      const ha = document.querySelector('home-assistant');
      if (ha && ha.hass) {
        lang = ha.hass.locale?.language || ha.hass.language || ha.hass.selectedLanguage || '';
      }
    } catch (_) {}
  }
  if (!lang && typeof navigator !== 'undefined' && navigator.language) {
    lang = navigator.language;
  }
  lang = (lang || 'en').toLowerCase();
  if (lang.startsWith('es')) {
    return CARD_I18N.es;
  }
  return CARD_I18N.en;
}

function cleanCameraDisplayName(name, did = '') {
  if (!name) return 'Camera';
  let cleaned = name.replace(/\s+(Live Camera|Cámara en directo|Camera Control|Control de cámara)$/i, '').trim();
  if (cleaned.startsWith('camera.')) {
    cleaned = cleaned.replace(/^camera\./, '');
  }
  cleaned = cleaned.replace(/_/g, ' ');
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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
    this._isRecording = false;
    this._mediaRecorder = null;
    this._recordChunks = [];
    this._recordTimer = null;
    this._recordSeconds = 0;
    this._rendered = false;
    this._hasRenderedWithHass = false;
    this._discoveredEntities = {}; // Default is 'hd' (native camera resolution, stable and fluid)
    this._controlsCollapsed = false;
    this._compactMargins = false;
    this._preferencesLoaded = false;
    this._currentLang = null;
    this._statusTimer = null;
  }

  _getCamDid() {
    if (this._config?.did) return String(this._config.did);
    const camEntity = this._config?.camera_entity || '';
    if (this._hass && this._hass.states[camEntity]) {
      const attrs = this._hass.states[camEntity].attributes || {};
      if (attrs.did) return String(attrs.did);
    }
    const match = camEntity.match(/\d{8,10}/);
    if (match) return match[0];
    return '';
  }

  _getControlsStorageKey() {
    const did = this._getCamDid() || (this._config?.camera_entity || 'default');
    return `chuangmi_controls_${did}`;
  }

  _getHeaderStorageKey() {
    const did = this._getCamDid() || (this._config?.camera_entity || 'default');
    return `chuangmi_header_${did}`;
  }

  _loadPreferences() {
    // Controls collapsed / expanded
    try {
      const savedControls = localStorage.getItem(this._getControlsStorageKey());
      if (savedControls !== null) {
        this._controlsCollapsed = (savedControls === 'collapsed');
      } else if (this._config.show_controls !== undefined) {
        this._controlsCollapsed = !this._config.show_controls;
      } else if (this._config.hide_controls !== undefined) {
        this._controlsCollapsed = !!this._config.hide_controls;
      } else {
        this._controlsCollapsed = false;
      }
    } catch (_) {
      this._controlsCollapsed = this._config.show_controls !== undefined ? !this._config.show_controls : false;
    }

    // 3. Header hidden / visible
    try {
      const savedHeader = localStorage.getItem(this._getHeaderStorageKey());
      if (savedHeader !== null) {
        this._headerHidden = (savedHeader === 'hidden');
      } else if (this._config.hide_header !== undefined) {
        this._headerHidden = !!this._config.hide_header;
      } else {
        this._headerHidden = false;
      }
    } catch (_) {
      this._headerHidden = !!this._config.hide_header;
    }

    this._preferencesLoaded = true;
  }

  _toggleControls() {
    this._controlsCollapsed = !this._controlsCollapsed;
    try {
      localStorage.setItem(this._getControlsStorageKey(), this._controlsCollapsed ? 'collapsed' : 'expanded');
    } catch (_) {}
    this._updateControlsVisibility();
  }

  _updateControlsVisibility() {
    const panel = this.shadowRoot.getElementById('controlsPanel');
    const toggleBtn = this.shadowRoot.getElementById('btnToggleControls');
    const floatBtn = this.shadowRoot.getElementById('btnFloatingToggle');
    const card = this.shadowRoot.querySelector('ha-card');
    const i18n = getCardI18n(this._hass);

    if (panel) {
      panel.classList.toggle('collapsed', this._controlsCollapsed);
    }
    if (card) {
      card.classList.toggle('controls-hidden', this._controlsCollapsed);
    }
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', !this._controlsCollapsed);
      toggleBtn.title = this._controlsCollapsed ? i18n.show_controls : i18n.hide_controls;
      const chevron = toggleBtn.querySelector('.toggle-icon');
      if (chevron) {
        chevron.style.transform = this._controlsCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    }
    if (floatBtn) {
      floatBtn.title = this._controlsCollapsed ? i18n.show_controls : i18n.hide_controls;
    }
  }

  _toggleHeader() {
    this._headerHidden = !this._headerHidden;
    try {
      localStorage.setItem(this._getHeaderStorageKey(), this._headerHidden ? 'hidden' : 'visible');
    } catch (_) {}
    this._updateHeaderVisibility();
  }

  _updateHeaderVisibility() {
    const card = this.shadowRoot.querySelector('ha-card');
    if (card) {
      card.classList.toggle('header-hidden', this._headerHidden);
    }
  }

  connectedCallback() {
    this._onPageUnload = () => {
      try {
        const webrtc = this.shadowRoot?.querySelector('webrtc-camera');
        if (webrtc) {
          if (typeof webrtc.ondisconnect === 'function') webrtc.ondisconnect();
          if (webrtc.ws) webrtc.ws.close();
          if (webrtc.pc) webrtc.pc.close();
        }
      } catch (_) {}
    };
    window.addEventListener('beforeunload', this._onPageUnload);
    window.addEventListener('pagehide', this._onPageUnload);
  }

  disconnectedCallback() {
    if (this._onPageUnload) {
      window.removeEventListener('beforeunload', this._onPageUnload);
      window.removeEventListener('pagehide', this._onPageUnload);
      this._onPageUnload();
    }
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this._config = { ...config };
    this._loadPreferences();

    if (this._hass) {
      this._updateEntities();
      this._hasRenderedWithHass = true;
      this._render();
    }
  }

  set hass(hass) {
    const prevLang = this._currentLang;
    this._hass = hass;
    this._currentLang = (hass?.locale?.language || hass?.language || 'en').toLowerCase().slice(0, 2);

    if (!this._preferencesLoaded) {
      this._loadPreferences();
    }
    this._updateEntities();

    if (!this._rendered || !this._hasRenderedWithHass || (prevLang && prevLang !== this._currentLang)) {
      this._hasRenderedWithHass = true;
      this._render();
    } else {
      this._updateStates();
      this._ensureWebRTC();
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
            (attrs.brand && attrs.brand.includes('Liberator')) ||
            attrs.brand === 'Xiaomi & Imilab Camera Liberator (WebRTC & PTZ)' ||
            attrs.brand === 'Chuangmi Liberator WebRTC' ||
            (attrs.stream_name && attrs.stream_name.startsWith('chuangmi_')) ||
            attrs.did ||
            eid.includes('chuangmi') ||
            eid.includes('imilab')
          ) {
            defaultCam = eid;
            defaultDid = attrs.did ? String(attrs.did) : (eid.match(/\d{8,10}/)?.[0] || '');
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
    if (!camEntity) return '';

    const did = this._getCamDid();
    let base = '';
    if (did) {
      base = `chuangmi_${did}`;
    } else if (this._config?.stream_name) {
      base = this._config.stream_name.replace(/_sd$/, '');
    } else {
      base = camEntity.replace(/^camera\./, '');
    }

    return base;
  }

  _updateEntities() {
    if (!this._hass) return;
    const camEntity = this._config.camera_entity;
    if (!camEntity) return;

    const camState = this._hass.states[camEntity];
    const attrs = camState?.attributes || {};
    const did = attrs.did ? String(attrs.did) : (this._config.did ? String(this._config.did) : (camEntity.match(/\d{8,10}/)?.[0] || ''));

    // Extract search tokens from camera entity and friendly name
    const camTokens = camEntity.replace(/^camera\./, '').toLowerCase().split(/[^a-z0-9]+/i).filter(t => t.length >= 3 && !['camera', 'camara', 'live'].includes(t));
    const fnTokens = (attrs.friendly_name || '').toLowerCase().split(/[^a-z0-9]+/i).filter(t => t.length >= 3 && !['camera', 'camara', 'live'].includes(t));

    const found = {
      ptz_up: '',
      ptz_down: '',
      ptz_left: '',
      ptz_right: '',
      record_clip: '',
      flip: '',
      night: '',
      sleep: ''
    };

    const states = this._hass.states;
    for (const [eid, s] of Object.entries(states)) {
      const eidLower = eid.toLowerCase();
      const fnLower = (s.attributes?.friendly_name || '').toLowerCase();
      const entityDid = s.attributes?.did ? String(s.attributes.did) : '';

      const matchesCamera = (
        (did && (entityDid === did || eidLower.includes(did))) ||
        (camTokens.length > 0 && camTokens.some(tok => eidLower.includes(tok))) ||
        (fnTokens.length > 0 && fnTokens.some(tok => fnLower.includes(tok)))
      );

      if (!matchesCamera) continue;

      if (eid.startsWith('button.')) {
        if (eidLower.includes('up') || eidLower.includes('arriba') || fnLower.includes('up')) found.ptz_up = eid;
        else if (eidLower.includes('down') || eidLower.includes('abajo') || fnLower.includes('down')) found.ptz_down = eid;
        else if (eidLower.includes('left') || eidLower.includes('izquierda') || fnLower.includes('left')) found.ptz_left = eid;
        else if (eidLower.includes('right') || eidLower.includes('derecha') || fnLower.includes('right')) found.ptz_right = eid;
        else if (eidLower.includes('record') || eidLower.includes('grabar')) found.record_clip = eid;
      } else if (eid.startsWith('number.')) {
        // Prioritize physical camera hardware image_rollover number entity (0 or 180)
        if (eidLower.includes('rollover') || eidLower.includes('flip')) {
          found.flip = eid;
        }
      } else if (eid.startsWith('switch.')) {
        if ((eidLower.includes('flip') || eidLower.includes('voltear')) && !found.flip) {
          found.flip = eid;
        } else if (eidLower.includes('switch_status')) {
          // Prioritize real hardware camera control switch_status (on/off)
          found.sleep = eid;
        } else if ((eidLower.includes('power') || eidLower.includes('reposo') || eidLower.includes('sleep')) && !found.sleep) {
          found.sleep = eid;
        }
      } else if (eid.startsWith('select.')) {
        if (eidLower.includes('night_shot')) {
          // Prioritize real hardware camera night_shot ('Auto', 'Off', 'On')
          found.night = eid;
        } else if ((eidLower.includes('night') || eidLower.includes('nocturna')) && !found.night) {
          found.night = eid;
        }
      }
    }

    this._discoveredEntities = found;
  }

  _callButton(entityId) {
    if (!this._hass || !entityId) return;
    this._hass.callService('button', 'press', { entity_id: entityId });
  }

  _callFlip(entityId) {
    if (!this._hass || !entityId) return;
    if (entityId.startsWith('number.')) {
      const current = parseFloat(this._hass.states[entityId]?.state || '0');
      const target = current >= 90 ? 0 : 180;
      this._hass.callService('number', 'set_value', { entity_id: entityId, value: target });
    } else {
      this._hass.callService('switch', 'toggle', { entity_id: entityId });
    }
  }

  _cycleNightVision(entityId) {
    if (!this._hass || !entityId) return;
    const stateObj = this._hass.states[entityId];
    const current = String(stateObj?.state || 'auto').toLowerCase();
    const options = stateObj?.attributes?.options || [];

    // 3 states: auto -> on (night vision) -> off (desactivado) -> auto
    let target = 'on';
    if (current === 'auto' || current === '0') {
      target = 'on'; // Auto -> Night Vision
    } else if (current === 'on' || current === 'always_on' || current === '1') {
      target = 'off'; // Night Vision -> Desactivado
    } else {
      target = 'auto'; // Desactivado -> Auto
    }

    if (options.length > 0) {
      let matched = '';
      if (target === 'auto') {
        matched = options.find(o => o.toLowerCase() === 'auto') || options[0];
      } else if (target === 'on') {
        matched = options.find(o => o.toLowerCase() === 'on' || o.toLowerCase() === 'always_on') || options.find(o => o.toLowerCase().includes('on')) || options[options.length - 1];
      } else if (target === 'off') {
        matched = options.find(o => o.toLowerCase() === 'off') || options.find(o => o.toLowerCase().includes('off')) || options[0];
      }
      if (matched) {
        this._hass.callService('select', 'select_option', { entity_id: entityId, option: matched });
        return;
      }
    }

    const cycleMap = { 'auto': 'always_on', 'always_on': 'off', 'off': 'auto', 'on': 'off' };
    const next = cycleMap[current] || 'auto';
    this._hass.callService('select', 'select_option', { entity_id: entityId, option: next });
  }

  _callSleep(entityId) {
    if (!this._hass || !entityId) return;
    this._hass.callService('switch', 'toggle', { entity_id: entityId });
  }

  async _toggleRecording() {
    const i18n = getCardI18n(this._hass);
    const centerBtn = this.shadowRoot.getElementById('btnCenter');
    const label = this.shadowRoot.getElementById('centerLabel');

    if (!this._isRecording) {
      this._isRecording = true;
      this._recordSeconds = 0;
      if (centerBtn) {
        centerBtn.classList.add('recording');
        centerBtn.classList.add('active');
      }
      if (label) label.textContent = `● ${i18n.recording} 00:00`;

      // Live second timer
      this._recordTimer = setInterval(() => {
        this._recordSeconds++;
        const mins = String(Math.floor(this._recordSeconds / 60)).padStart(2, '0');
        const secs = String(this._recordSeconds % 60).padStart(2, '0');
        if (label) label.textContent = `● ${i18n.recording} ${mins}:${secs}`;
      }, 1000);

      // Trigger complementary HA backend record service if entity exists
      if (this._discoveredEntities.record_clip) {
        this._callButton(this._discoveredEntities.record_clip);
      }

      // Record directly from WebRTC video element in the browser
      try {
        const webrtc = this.shadowRoot.querySelector('webrtc-camera');
        const video = webrtc?.shadowRoot?.querySelector('video') || webrtc?.querySelector('video') || this.shadowRoot.querySelector('video');

        if (video) {
          const stream = video.captureStream ? video.captureStream() : (video.srcObject || null);
          if (stream) {
            let options = {};
            if (window.MediaRecorder) {
              if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
                options = { mimeType: 'video/mp4;codecs=avc1' };
              } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
                options = { mimeType: 'video/webm;codecs=vp8,opus' };
              } else if (MediaRecorder.isTypeSupported('video/webm')) {
                options = { mimeType: 'video/webm' };
              }

              this._recordChunks = [];
              this._mediaRecorder = new MediaRecorder(stream, options);
              this._mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                  this._recordChunks.push(e.data);
                }
              };
              this._mediaRecorder.start(1000);
            }
          }
        }
      } catch (err) {
        console.debug('MediaRecorder browser start error:', err);
      }
    } else {
      // Stop recording
      if (this._recordTimer) {
        clearInterval(this._recordTimer);
        this._recordTimer = null;
      }
      this._isRecording = false;

      if (centerBtn) {
        centerBtn.classList.remove('recording');
        centerBtn.classList.remove('active');
      }
      if (label) label.textContent = i18n.record;

      if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
        try {
          this._mediaRecorder.onstop = () => {
            if (this._recordChunks && this._recordChunks.length > 0) {
              const mime = this._mediaRecorder?.mimeType || 'video/webm';
              const ext = mime.includes('mp4') ? 'mp4' : 'webm';
              const blob = new Blob(this._recordChunks, { type: mime });
              const url = URL.createObjectURL(blob);
              const camState = this._hass && this._config.camera_entity ? this._hass.states[this._config.camera_entity] : null;
              const title = getCameraAssignedName(camState, this._config, this._hass).replace(/[^a-zA-Z0-9_-]/g, '_');
              const now = new Date();
              const dateStr = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
              const a = document.createElement('a');
              a.href = url;
              a.download = `Grabacion_${title}_${dateStr}.${ext}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 6000);

              if (label) {
                label.textContent = i18n.record_saved;
                setTimeout(() => {
                  if (!this._isRecording && label) label.textContent = i18n.record;
                }, 2500);
              }
            }
            this._mediaRecorder = null;
            this._recordChunks = [];
          };
          this._mediaRecorder.stop();
        } catch (err) {
          console.warn('Error stopping MediaRecorder:', err);
          this._mediaRecorder = null;
        }
      }
    }
  }

  _is2KModel() {
    const camState = this._hass && this._config?.camera_entity ? this._hass.states[this._config.camera_entity] : null;
    const model = (camState?.attributes?.model || '').toLowerCase();
    return model.includes('026c02') || model.includes('046c04') || model.includes('069a01') || model.includes('ipc021') || model.includes('ipc022') || model.includes('2k') || model.includes('3k') || model.includes('c300') || model.includes('c400') || model.includes('c500');
  }

  _switchStream(streamName) {
    const container = this.shadowRoot.getElementById('videoContainer');
    if (!container || !streamName) {
      return;
    }

    const currentWebrtc = container.querySelector('webrtc-camera');
    const currentStream = currentWebrtc?._config?.url || currentWebrtc?.config?.url || '';

    // If stream is already active and playing this exact URL, do not tear down WebRTC!
    if (currentStream === streamName) {
      this._hideOverlay();
      return;
    }

    const i18n = getCardI18n(this._hass);
    this._showOverlay(i18n.connecting, true, false);

    if (currentWebrtc) {
      try {
        if (typeof currentWebrtc.ondisconnect === 'function') currentWebrtc.ondisconnect();
        if (currentWebrtc.disconnectTID) clearTimeout(currentWebrtc.disconnectTID);
        if (currentWebrtc.reconnectTID) clearTimeout(currentWebrtc.reconnectTID);
        if (currentWebrtc.ws) currentWebrtc.ws.close();
        if (currentWebrtc.pc) currentWebrtc.pc.close();
      } catch (_) {}
      try { currentWebrtc.remove(); } catch (_) {}
    }

    setTimeout(() => {
      this._ensureWebRTC(true);
    }, 100);
  }

  _showOverlay(text, showSpinner = true, showRetry = false) {
    const overlay = this.shadowRoot.getElementById('videoOverlay');
    const textEl = this.shadowRoot.getElementById('videoStatusText');
    const spinner = this.shadowRoot.getElementById('videoSpinner');
    const retryBtn = this.shadowRoot.getElementById('videoRetryBtn');
    if (!overlay) return;

    if (text && textEl) textEl.textContent = text;
    if (spinner) spinner.style.display = showSpinner ? 'block' : 'none';
    if (retryBtn) retryBtn.style.display = showRetry ? 'block' : 'none';
    overlay.classList.remove('hidden');
  }

  _hideOverlay() {
    const overlay = this.shadowRoot.getElementById('videoOverlay');
    if (overlay) overlay.classList.add('hidden');
    if (this._statusTimer) {
      clearTimeout(this._statusTimer);
      this._statusTimer = null;
    }
  }

  _monitorVideoElement(webrtc) {
    const i18n = getCardI18n(this._hass);
    const attachHandlers = (video) => {
      if (!video || video._hasStatusHandlers) return;
      video._hasStatusHandlers = true;

      try {
        video.controls = false;
      } catch (_) {}

      const tuneLatency = () => {
        try {
          if (webrtc && webrtc.pc) {
            webrtc.pc.getReceivers().forEach(r => {
              if ('jitterBufferTarget' in r) {
                r.jitterBufferTarget = 0;
              }
              if ('playoutDelayHint' in r) {
                r.playoutDelayHint = 0;
              }
            });
          }
        } catch (_) {}
      };

      const onFrameReady = () => {
        // Ensure video is rendered and painted before removing overlay
        if (video.videoWidth > 0 || video.currentTime > 0.1) {
          video.style.opacity = '1';
          tuneLatency();
          this._hideOverlay();
          if (this._statusTimer) {
            clearTimeout(this._statusTimer);
            this._statusTimer = null;
          }
        }
      };

            video.addEventListener('playing', () => {
        onFrameReady();
        tuneLatency();
      });
      video.addEventListener('loadeddata', () => {
        onFrameReady();
        tuneLatency();
      });
      const latencyTimer = setInterval(() => {
        if (!video.paused && video.srcObject) {
          tuneLatency();
        } else if (!this.isConnected) {
          clearInterval(latencyTimer);
        }
      }, 2500);
      video.addEventListener('loadeddata', onFrameReady);
      video.addEventListener('timeupdate', () => {
        if (video.currentTime > 0) onFrameReady();
      });

      // Immediate check if video is already ready or playing
      if (video.readyState >= 2 || video.currentTime > 0 || (video.srcObject && video.srcObject.active)) {
        onFrameReady();
      }

      // Safety watchdog: after 2.5 seconds, if video has srcObject, hide overlay
      setTimeout(() => {
        if (video.srcObject || video.currentTime > 0) {
          onFrameReady();
        }
      }, 2500);

      video.addEventListener('error', () => {
        this._showOverlay(i18n.stream_error, false, true);
      });
    };

    // Find video immediately or watch for attachment
    let video = webrtc.querySelector('video') || webrtc.shadowRoot?.querySelector('video');
    if (video) {
      attachHandlers(video);
    } else {
      const interval = setInterval(() => {
        video = webrtc.querySelector('video') || webrtc.shadowRoot?.querySelector('video');
        if (video) {
          attachHandlers(video);
          clearInterval(interval);
        }
      }, 100);
      setTimeout(() => clearInterval(interval), 5000);
    }
  }

  _applyVideoEdgeToEdge(webrtc) {
    if (!webrtc) return;
    const inject = () => {
      try {
        const video = webrtc.querySelector('video') || webrtc.shadowRoot?.querySelector('video');
        if (video) {
          video.controls = false;
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'contain';
          video.style.display = 'block';
          video.style.backgroundColor = '#0b0d11';
          video.style.pointerEvents = 'none';
          video.style.transition = 'opacity 0.3s ease';
        }
        const root = webrtc.shadowRoot || webrtc;
        const msgEls = root.querySelectorAll ? root.querySelectorAll('.status, .mode, .msg') : [];
        msgEls.forEach(el => {
          el.style.display = 'none';
          el.style.opacity = '0';
          el.style.visibility = 'hidden';
        });
      } catch (_) {}
    };
    inject();
    setTimeout(inject, 50);
    setTimeout(inject, 250);
    setTimeout(inject, 1000);
  }

  _ensureWebRTC(forceReload = false) {
    const container = this.shadowRoot.getElementById('videoContainer');
    if (!container) return;

    const streamName = this._resolveStreamName(this._config?.camera_entity);
    const i18n = getCardI18n(this._hass);

    if (!streamName) {
      const isEs = (this._hass?.language || 'en').startsWith('es');
      this._showOverlay(isEs ? 'Seleccione una cámara en el editor' : 'Select a camera in card editor', false, false);
      return;
    }

    if (!customElements.get('webrtc-camera')) {
      this._showOverlay(i18n.connecting, true, false);
      customElements.whenDefined('webrtc-camera').then(() => {
        this._ensureWebRTC(forceReload);
      });
      return;
    }

    let webrtc = container.querySelector('webrtc-camera');
    if (!webrtc || forceReload) {
      if (webrtc) {
        try {
          if (typeof webrtc.ondisconnect === 'function') webrtc.ondisconnect();
          if (webrtc.disconnectTID) clearTimeout(webrtc.disconnectTID);
          if (webrtc.reconnectTID) clearTimeout(webrtc.reconnectTID);
          if (webrtc.ws) webrtc.ws.close();
          if (webrtc.pc) webrtc.pc.close();
          webrtc.remove();
        } catch (_) {}
      }
      this._showOverlay(i18n.connecting, true, false);

      webrtc = document.createElement('webrtc-camera');
      webrtc.setConfig({
        url: streamName,
        muted: true,
        mode: 'webrtc',
        mse: false
      });
      if (this._hass) {
        webrtc.hass = this._hass;
      }
      // Insert before overlay so overlay remains on top
      const overlay = this.shadowRoot.getElementById('videoOverlay');
      if (overlay) {
        container.insertBefore(webrtc, overlay);
      } else {
        container.appendChild(webrtc);
      }

      this._applyVideoEdgeToEdge(webrtc);
      this._monitorVideoElement(webrtc);
    } else {
      if (this._hass && webrtc.hass !== this._hass) {
        webrtc.hass = this._hass;
      }
      this._applyVideoEdgeToEdge(webrtc);
      this._monitorVideoElement(webrtc);
    }

    // Force connect if it was idle
    if (this._hass && webrtc && !webrtc.ws && !webrtc.pc) {
      try {
        if (typeof webrtc.onconnect === 'function') {
          webrtc.onconnect();
        }
      } catch (e) {}
    }

    // Safety timeout: if after 25s video is still not playing, show retry button
    if (this._statusTimer) clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => {
      const v = webrtc.shadowRoot?.querySelector('video') || webrtc.querySelector('video');
      if (!v || v.paused || v.currentTime === 0) {
        this._showOverlay(i18n.stream_error, false, true);
      }
    }, 25000);
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
          position: relative;
          z-index: 0;
        }
        ha-card {
          position: relative;
          z-index: 0;
          overflow: hidden;
          background: #101216;
          border-radius: 18px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.45);
          color: #e5e7eb;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.25s ease;
        }
        ha-card.header-hidden .header {
          display: none !important;
        }
        ha-card.header-hidden .video-container {
          border-top-left-radius: 18px;
          border-top-right-radius: 18px;
        }
        ha-card.controls-hidden .video-container {
          border-bottom-left-radius: 18px;
          border-bottom-right-radius: 18px;
        }
        ha-card.header-hidden.controls-hidden .video-container {
          border-radius: 18px;
        }
        .header {
          display: flex;
          align-items: center;
          padding: 14px 18px 12px 18px;
          background: linear-gradient(180deg, rgba(24, 27, 32, 0.95) 0%, rgba(16, 18, 22, 0.85) 100%);
          width: 100%;
          box-sizing: border-box;
        }
        .header-title {
          flex: 1;
          min-width: 0;
          width: 100%;
          font-weight: 700;
          font-size: 1.05rem;
          letter-spacing: 0.3px;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
          transition: opacity 0.15s ease, transform 0.1s ease;
        }
        .header-title svg {
          flex-shrink: 0;
        }
        .header-title #cardTitle {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .header-title:hover {
          opacity: 0.85;
        }
        .header-title:active {
          transform: scale(0.98);
        }
        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
        }
        .video-overlay {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle, rgba(17, 21, 28, 0.94) 0%, rgba(9, 11, 15, 0.98) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          z-index: 5;
          transition: opacity 0.35s ease, visibility 0.35s ease;
          padding: 20px;
          text-align: center;
        }
        .video-overlay.hidden {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }
        .video-spinner {
          width: 38px;
          height: 38px;
          border: 3px solid rgba(16, 185, 129, 0.15);
          border-top-color: #10b981;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .video-status-text {
          font-size: 0.86rem;
          font-weight: 600;
          color: #cbd5e1;
          letter-spacing: 0.3px;
        }
        .video-retry-btn {
          background: #10b981;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 8px 18px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
        }
        .video-retry-btn:hover {
          background: #059669;
          transform: scale(1.05);
        }
        .video-container {
          position: relative;
          width: 100%;
          background: #000;
          overflow: hidden;
          line-height: 0;
          transition: border-radius 0.25s ease;
        }
        .video-container webrtc-camera {
          width: 100%;
          display: block;
          margin: 0;
          padding: 0;
          color: transparent !important;
          user-select: none;
          --ha-card-border-radius: 0px !important;
          --ha-card-border-width: 0px !important;
          --ha-card-box-shadow: none !important;
          --ha-card-background: transparent !important;
        }
        .video-container webrtc-camera * {
          color: transparent !important;
        }
        .video-container webrtc-camera video {
          color: initial !important;
        }
        .floating-toggle-btn {
          position: absolute;
          bottom: 12px;
          right: 12px;
          z-index: 4;
          background: rgba(16, 18, 22, 0.78);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #94a3b8;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0.65;
          transition: all 0.2s ease;
          outline: none;
        }
        .floating-toggle-btn:hover {
          opacity: 1;
          transform: scale(1.1);
          background: rgba(16, 185, 129, 0.9);
          color: #ffffff;
          border-color: #10b981;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);
        }
        .controls-panel {
          padding: 16px 12px 14px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          background: #13161c;
          transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, padding 0.35s ease;
          max-height: 500px;
          opacity: 1;
          overflow: hidden;
        }
        .controls-panel.collapsed {
          max-height: 0 !important;
          opacity: 0 !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          pointer-events: none;
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
          background: radial-gradient(circle, #1e2430 0%, #12151c 100%);
          border: 3px solid #101216;
          color: #94a3b8;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
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
        .btn-center svg {
          fill: #ef4444;
          transition: transform 0.2s ease, fill 0.2s ease;
        }
        .btn-center:hover {
          background: radial-gradient(circle, #252d3d 0%, #161b24 100%);
          color: #f1f5f9;
          transform: scale(1.05);
        }
        .btn-center:active {
          transform: scale(0.95);
        }
        .btn-center.active, .btn-center.recording {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #ffffff;
          box-shadow: 0 0 25px rgba(16, 185, 129, 0.8);
          animation: pulse-recording 1.5s infinite;
        }
        .btn-center.active svg, .btn-center.recording svg {
          fill: #ffffff;
        }
        @keyframes pulse-recording {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { box-shadow: 0 0 0 14px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
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
        .action-btn.active, .action-btn.state-on {
          background: rgba(16, 185, 129, 0.16);
          border-color: rgba(16, 185, 129, 0.45);
          color: #10b981;
        }
        .action-btn.state-auto {
          background: rgba(6, 182, 212, 0.12);
          border-color: rgba(6, 182, 212, 0.35);
          color: #06b6d4;
        }
        .action-btn.state-off {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.06);
          color: #64748b;
        }
        .action-btn svg {
          width: 22px;
          height: 22px;
          fill: currentColor;
        }
      </style>

      <ha-card class="${this._controlsCollapsed ? 'controls-hidden' : ''} ${this._headerHidden ? 'header-hidden' : ''}">
        <div class="header">
          <div class="header-title" id="headerTitle" title="${i18n.more_info_tooltip}">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#10b981">
              <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
            </svg>
            <span id="cardTitle">${title}</span>
          </div>
        </div>
        <div class="video-container" id="videoContainer">
          <button class="floating-toggle-btn" id="btnFloatingToggle" title="${this._controlsCollapsed ? i18n.show_controls : i18n.hide_controls}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M7,10L12,15L17,10H7Z"/>
            </svg>
          </button>
          <div class="video-overlay" id="videoOverlay">
            <div class="video-spinner" id="videoSpinner"></div>
            <div class="video-status-text" id="videoStatusText">${i18n.connecting}</div>
            <button class="video-retry-btn" id="videoRetryBtn" style="display: none;">${i18n.retry}</button>
          </div>
        </div>

        <div class="controls-panel ${this._controlsCollapsed ? 'collapsed' : ''}" id="controlsPanel">
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

            <!-- CENTER BUTTON: QUICK VIDEO RECORDING -->
            <button class="btn-center" id="btnCenter" title="${i18n.record_tooltip}">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                <circle cx="12" cy="12" r="7"/>
              </svg>
              <span class="center-label" id="centerLabel">${i18n.record}</span>
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

            <!-- 2. Visión Nocturna (Night Vision con 3 estados: Auto, Night Vision, Desactivado) -->
            <button class="action-btn" id="btnNight" title="${i18n.night_tooltip}">
              <svg viewBox="0 0 24 24"><path d="M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.84 4.94,4.94C7.77,2.1 11.83,1.38 15.34,3.14C16.15,3.55 16.03,4.68 15.17,4.88C11.8,5.65 9.29,8.68 9.29,12.35C9.29,16.42 12.58,19.71 16.65,19.71C17.47,19.71 18.25,19.57 18.97,19.32V15.95Z"/></svg>
              <span id="nightLabel">${i18n.night_vision}</span>
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

    this._ensureWebRTC();

    // Event listeners for PTZ (intelligently accounts for 180° inverted ceiling mount)
    const getDirButton = (dir) => {
      const flipState = this._hass && this._discoveredEntities.flip ? String(this._hass.states[this._discoveredEntities.flip]?.state || '') : 'off';
      const isFlipped = (flipState === 'on' || flipState === '180');

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

    // Center button: Quick Recording
    this.shadowRoot.getElementById('btnCenter').onclick = () => this._toggleRecording();

    // 3 Action buttons
    this.shadowRoot.getElementById('btnFlip').onclick = () => this._callFlip(this._discoveredEntities.flip);
    this.shadowRoot.getElementById('btnNight').onclick = () => this._cycleNightVision(this._discoveredEntities.night);
    this.shadowRoot.getElementById('btnSleep').onclick = () => this._callSleep(this._discoveredEntities.sleep);

    // Toggle controls collapse
    const btnToggleControls = this.shadowRoot.getElementById('btnToggleControls');
    if (btnToggleControls) btnToggleControls.onclick = () => this._toggleControls();

    const btnFloatingToggle = this.shadowRoot.getElementById('btnFloatingToggle');
    if (btnFloatingToggle) btnFloatingToggle.onclick = () => this._toggleControls();


    // Reconnect Retry Button
    const retryBtn = this.shadowRoot.getElementById('videoRetryBtn');
    if (retryBtn) retryBtn.onclick = () => this._ensureWebRTC(true);

    // Click on Card Title opens Home Assistant More-Info modal for the camera
    const headerTitle = this.shadowRoot.getElementById('headerTitle');
    if (headerTitle) {
      headerTitle.onclick = () => {
        const camEntity = this._config?.camera_entity;
        if (camEntity) {
          const event = new CustomEvent('hass-more-info', {
            detail: { entityId: camEntity },
            bubbles: true,
            composed: true
          });
          this.dispatchEvent(event);
        }
      };
    }

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

    // 1. Flip button state: VERDE si volteada 180°, GRIS si normal 0°
    const flipBtn = this.shadowRoot.getElementById('btnFlip');
    if (flipBtn && this._discoveredEntities.flip) {
      const state = String(this._hass.states[this._discoveredEntities.flip]?.state || '').toLowerCase();
      const isFlipped = (state === 'on' || state === '180');
      flipBtn.classList.toggle('active', isFlipped);
    }

    // 2. Visión Nocturna con 3 estados: auto, night vision y desactivado
    const nightBtn = this.shadowRoot.getElementById('btnNight');
    const nightLabel = this.shadowRoot.getElementById('nightLabel');
    if (nightBtn && this._discoveredEntities.night) {
      const state = String(this._hass.states[this._discoveredEntities.night]?.state || '').toLowerCase();
      const isEs = (this._currentLang || '').startsWith('es');

      nightBtn.classList.remove('state-auto', 'state-on', 'state-off', 'active');

      if (state === 'on' || state === 'always_on' || state === '1') {
        // Estado 2: Night Vision (Activada) -> VERDE
        nightBtn.classList.add('state-on', 'active');
        if (nightLabel) nightLabel.textContent = isEs ? 'Visión Nocturna' : 'Night Vision';
        nightBtn.title = isEs ? 'Visión Nocturna: Activada (Clic para Desactivar)' : 'Night Vision: Active (Click to Disable)';
      } else if (state === 'off' || state === '2') {
        // Estado 3: Desactivado -> GRIS
        nightBtn.classList.add('state-off');
        if (nightLabel) nightLabel.textContent = isEs ? 'Desactivado' : 'Off';
        nightBtn.title = isEs ? 'Visión Nocturna: Desactivada (Clic para modo Auto)' : 'Night Vision: Disabled (Click for Auto)';
      } else {
        // Estado 1: Auto -> AZUL/CYAN
        nightBtn.classList.add('state-auto');
        if (nightLabel) nightLabel.textContent = 'Auto';
        nightBtn.title = isEs ? 'Visión Nocturna: Automático (Clic para Activar)' : 'Night Vision: Auto (Click to Enable)';
      }
    }

    // 3. Privacidad: VERDE sólo si privacidad activa (cámara apagada / en reposo), GRIS si cámara encendida / transmitiendo
    const sleepBtn = this.shadowRoot.getElementById('btnSleep');
    const sleepEntity = this._discoveredEntities.sleep;
    if (sleepBtn && sleepEntity) {
      const state = String(this._hass.states[sleepEntity]?.state || '').toLowerCase();
      let isPrivacyActive = false;
      if (sleepEntity.includes('switch_status') || sleepEntity.includes('power') || sleepEntity.includes('energia')) {
        // En interruptores de encendido/estado: 'off' = cámara apagada/dormida (privacidad activa)
        isPrivacyActive = (state === 'off');
      } else {
        // En interruptores dedicados de privacidad/reposo: 'on' = privacidad activa
        isPrivacyActive = (state === 'on');
      }
      sleepBtn.classList.toggle('active', isPrivacyActive);
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
    if (this._hass) {
      this._render();
    }
  }

  set hass(hass) {
    const prevLang = this._currentLang;
    this._hass = hass;
    this._currentLang = (hass?.locale?.language || hass?.language || 'en').toLowerCase().slice(0, 2);
    if (!this._rendered || (prevLang && prevLang !== this._currentLang)) {
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
          (attrs.brand && attrs.brand.includes('Liberator')) ||
          attrs.brand === 'Xiaomi & Imilab Camera Liberator (WebRTC & PTZ)' ||
          attrs.brand === 'Chuangmi Liberator WebRTC' ||
          (attrs.stream_name && attrs.stream_name.startsWith('chuangmi_')) ||
          attrs.did ||
          eid.includes('chuangmi') ||
          eid.includes('imilab')
        );

        if (isChuangmi) {
          const did = attrs.did ? String(attrs.did) : (eid.match(/\d{8,10}/)?.[0] || '');
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
        if (eid.startsWith('camera.')) {
          const attrs = state.attributes || {};
          const did = attrs.did ? String(attrs.did) : (eid.match(/\d{8,10}/)?.[0] || '');
          chuangmiCameras.push({
            value: eid,
            label: cleanCameraDisplayName(attrs.friendly_name || eid, ''),
            stream_name: attrs.stream_name || (did ? `chuangmi_${did}` : ''),
            did: did
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

    // 3. Display and Layout Options (Hide Header, Hide Controls)
    const optionsBox = document.createElement('div');
    const isEs = (this._currentLang || '').startsWith('es');
    optionsBox.innerHTML = `
      <div style="font-weight:600; margin-bottom:8px; color:var(--primary-text-color);">${isEs ? 'Opciones de visualización' : 'Display Options'}</div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: var(--primary-text-color); font-size: 0.9rem;">
          <input type="checkbox" id="cfgShowControls" ${this._config.show_controls !== false ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: #10b981;" />
          <span>${i18n.editor_show_controls}</span>
        </label>
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: var(--primary-text-color); font-size: 0.9rem;">
          <input type="checkbox" id="cfgHideHeader" ${this._config.hide_header === true ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: #10b981;" />
          <span>${i18n.editor_hide_header}</span>
        </label>
      </div>
    `;
    container.appendChild(optionsBox);

    // Event handlers
    const updateConfig = () => {
      const titleInput = this.querySelector('#cfgTitle');
      const entitySelect = this.querySelector('#cfgEntity');
      const selectedVal = entitySelect ? entitySelect.value : currentEntity;
      const selectedCam = cameras.find(c => c.value === selectedVal);
      const showControlsInput = this.querySelector('#cfgShowControls');
      const hideHeaderInput = this.querySelector('#cfgHideHeader');

      const newConfig = {
        ...this._config,
        title: titleInput ? titleInput.value : '',
        camera_entity: selectedVal,
        stream_name: selectedCam ? selectedCam.stream_name : '',
        did: selectedCam ? selectedCam.did : '',
        show_controls: showControlsInput ? showControlsInput.checked : true,
        hide_header: hideHeaderInput ? hideHeaderInput.checked : false
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
    optionsBox.querySelector('#cfgShowControls').addEventListener('change', updateConfig);
    optionsBox.querySelector('#cfgHideHeader').addEventListener('change', updateConfig);

    this.appendChild(container);
    this._rendered = true;
  }
}

if (!customElements.get('chuangmi-ptz-card-editor')) {
  customElements.define('chuangmi-ptz-card-editor', ChuangmiPTZCardEditor);
}
ChuangmiPTZCard.getConfigElement = () => document.createElement('chuangmi-ptz-card-editor');

if (!customElements.get('chuangmi-ptz-card')) {
  customElements.define('chuangmi-ptz-card', ChuangmiPTZCard);
}

// Register in Home Assistant Card Picker (bottom safeguard)
window.customCards = window.customCards || [];
window.customCards = window.customCards.filter(c => c.type !== 'chuangmi-ptz-card');
window.customCards.push({
  type: 'chuangmi-ptz-card',
  name: 'Cámara Chuangmi PTZ',
  description: 'Streaming WebRTC 2K en directo con controles PTZ de movimiento, grabación instantánea y controles locales para cámaras Chuangmi, Imilab y Xiaomi.',
  preview: true,
  documentationURL: 'https://github.com/VictorCV-DAM/ha-xiaomi-imilab-camera-liberator-webrtc'
});
try {
  window.dispatchEvent(new CustomEvent('custom-card-registered', { detail: 'chuangmi-ptz-card' }));
} catch (e) {}

console.info(
  '%c CHUANGMI-PTZ-CARD %c v1.9.1 WEBRTC & LOVELACE HEADER SCROLL FIX ',
  'color: white; background: #10b981; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
  'color: #10b981; background: #18181b; font-weight: bold; padding: 2px 6px; border-radius: 4px;'
);
