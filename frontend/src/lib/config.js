/**
 * Global Configuration for the LazyFill Extension
 */

// Port is injected from .env during the build process
// Fallback to 9000 if not provided
const BACKEND_PORT = 9000; 

export const CONFIG = {
  API_BASE_URL: `http://localhost:${BACKEND_PORT}/api`,
  STORAGE_KEYS: Object.freeze({
    API_KEY:     'lazyfill_api_key',
    PROFILES:    'lazyfill_profiles',
    SETTINGS:    'lazyfill_settings',
    LOGS:        'lazyfill_error_logs',
    AUTH_TOKEN:  'lazyfill_auth_token',
    USER_DATA:   'lazyfill_user_data',
    ONBOARDING_DONE: 'lazyfill_onboarding_done',
  })
};
