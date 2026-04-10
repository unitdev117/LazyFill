const BACKEND_PORT = 9000;
const API_PATH = '/api';

export const STORAGE_KEYS = Object.freeze({
  API_KEY: 'lazyfill_api_key',
  PROFILES: 'lazyfill_profiles',
  SETTINGS: 'lazyfill_settings',
  LOGS: 'lazyfill_error_logs',
  AUTH_TOKEN: 'lazyfill_auth_token',
  USER_DATA: 'lazyfill_user_data',
  ONBOARDING_DONE: 'lazyfill_onboarding_done',
});

export const DEFAULT_SETTINGS = Object.freeze({
  activeProfileId: null,
  ghostPreviewEnabled: true,
  autoFillEnabled: false,
});

export const CONFIG = Object.freeze({
  API_BASE_URL: `http://127.0.0.1:${BACKEND_PORT}${API_PATH}`,
  API_BASE_URLS: Object.freeze([
    `http://127.0.0.1:${BACKEND_PORT}${API_PATH}`,
    `http://localhost:${BACKEND_PORT}${API_PATH}`,
  ]),
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  SYNC_DEBOUNCE_MS: 600,
  MAX_LOG_ENTRIES: 100,
});
