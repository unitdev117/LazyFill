/**
 * ============================================================
 *  SERVICE WORKER — Central Message Orchestrator
 * ============================================================
 *  The background service worker listens for messages from:
 *    - Popup (settings, profile CRUD, trigger scan)
 *    - Content scripts (scan results, fill requests)
 *
 *  It orchestrates: Settings Manager ↔ AI Controller ↔ DB Adapter
 *  and routes responses back to the caller.
 * ============================================================
 */

import SettingsManager from './settings_manager.js';
import AIController from './controllers/ai_controller.js';
import { handleError } from './error_handler.js';
import db from '../database/db_adapter.js';

/* -------------------------------------------------------
 *  MESSAGE ROUTER — maps action names to handler functions
 * ------------------------------------------------------- */

const handlers = {
  /* ---- API KEY ---- */
  SAVE_API_KEY: async (payload) => {
    return SettingsManager.saveApiKey(payload.apiKey);
  },

  GET_API_KEY: async () => {
    const key = await SettingsManager.getApiKey();
    return { success: true, apiKey: key };
  },

  DELETE_API_KEY: async () => {
    return SettingsManager.deleteApiKey();
  },

  /* ---- PROFILES ---- */
  CREATE_PROFILE: async (payload) => {
    const profile = await SettingsManager.createProfile(payload.name, payload.fields);
    return { success: true, profile };
  },

  UPDATE_PROFILE: async (payload) => {
    const profile = await SettingsManager.updateProfile(payload.profileId, payload.updates);
    return { success: true, profile };
  },

  DELETE_PROFILE: async (payload) => {
    return SettingsManager.deleteProfile(payload.profileId);
  },

  GET_ALL_PROFILES: async () => {
    const profiles = await SettingsManager.getAllProfiles();
    return { success: true, profiles };
  },

  GET_PROFILE: async (payload) => {
    const profile = await SettingsManager.getProfile(payload.profileId);
    return { success: true, profile };
  },

  SET_ACTIVE_PROFILE: async (payload) => {
    return SettingsManager.setActiveProfile(payload.profileId);
  },

  GET_ACTIVE_PROFILE: async () => {
    const profile = await SettingsManager.getActiveProfile();
    return { success: true, profile };
  },

  GET_SETTINGS: async () => {
    const settings = await SettingsManager.getSettings();
    return { success: true, settings };
  },

  /* ---- AI AUTOFILL ---- */
  TRIGGER_SCAN: async (_payload, sender) => {
    // Inject the content script scan function into the active tab
    const tabId = sender?.tab?.id;
    if (!tabId) {
      // Called from popup — get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        return { success: false, error: { message: 'No active tab found.' } };
      }
      // Send scan command to the content script on that tab
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' });
        return response;
      } catch (err) {
        return handleError(err, 'service_worker.TRIGGER_SCAN');
      }
    }
    return { success: true };
  },

  PROCESS_SCAN_RESULTS: async (payload) => {
    const { scannedFields } = payload;

    // 1. Get API key
    const apiKey = await SettingsManager.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: { category: 'AUTH_ERROR', message: 'API key not set. Configure it in the popup.' },
      };
    }

    // 2. Get active profile
    const profile = await SettingsManager.getActiveProfile();
    if (!profile) {
      return {
        success: false,
        error: { category: 'VALIDATION_ERROR', message: 'No active profile selected. Choose a profile first.' },
      };
    }

    // 3. Call AI Controller
    const result = await AIController.generateFill(apiKey, scannedFields, profile.fields, profile.name);
    return result;
  },

  BACKGROUND_PROCESS_SCAN: async (payload, sender) => {
    const tabId = sender?.tab?.id;
    if (!tabId) return { success: false, error: 'No tab id' };

    // Anti-Race-Condition: Keep track of the latest scan trigger per tab
    const currentScanTime = Date.now();
    if (!self.__activeBackgroundScans) self.__activeBackgroundScans = new Map();
    self.__activeBackgroundScans.set(tabId, currentScanTime);

    // Same logic as PROCESS_SCAN_RESULTS, but we intercept and push to UI autonomously
    const apiKey = await SettingsManager.getApiKey();
    const profile = await SettingsManager.getActiveProfile();
    const settings = await SettingsManager.getSettings();

    // Do NOT run autonomous scan ONLY if the user has explicitly disabled Ghost Preview
    if (settings.ghostPreviewEnabled === false || !apiKey || !profile) return { success: false, error: 'Not configured or disabled' };

    const result = await AIController.generateFill(apiKey, payload.scannedFields, profile.fields, profile.name);
    
    // Check if a newer scan was requested while Gemini was thinking
    if (self.__activeBackgroundScans.get(tabId) !== currentScanTime) {
       console.log('[LazyFill] Discarding stale AI result (superseded by newer DOM render)');
       return { success: false, error: 'Superseded by newer scan' };
    }

    // If successful, push mapped results directly back to the active tab's Ghost Text module
    if (result.success && result.mappings) {
       if (result.mappings.length > 0) {
         chrome.tabs.sendMessage(tabId, {
           action: 'SHOW_GHOST_TEXT',
           payload: { mappings: result.mappings, scannedFields: payload.scannedFields }
         }).catch(() => {}); // Catch if tab is closed or not ready
       } else {
         chrome.tabs.sendMessage(tabId, { action: 'CLEAR_GHOST_TEXT' }).catch(() => {});
       }
    }

    return result;
  },

  /* ---- SETTINGS ---- */
  SET_GHOST_PREVIEW: async (payload) => {
    return SettingsManager.setGhostPreview(payload.enabled);
  },

  /* ---- ERROR LOGS ---- */
  GET_LOGS: async () => {
    const logs = await db.getLogs();
    return { success: true, logs };
  },

  CLEAR_LOGS: async () => {
    await db.clearLogs();
    return { success: true };
  },
};

/* -------------------------------------------------------
 *  MAIN LISTENER
 * ------------------------------------------------------- */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;
  const handler = handlers[action];

  if (!handler) {
    sendResponse({ success: false, error: { message: `Unknown action: ${action}` } });
    return false;
  }

  // Execute the handler asynchronously
  (async () => {
    try {
      const result = await handler(payload || {}, sender);
      sendResponse(result);
    } catch (err) {
      const errorResult = await handleError(err, `service_worker.${action}`);
      sendResponse(errorResult);
    }
  })();

  // Return true to indicate we will send a response asynchronously
  return true;
});

/* -------------------------------------------------------
 *  INSTALL / UPDATE HOOKS
 * ------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[LazyFill] Extension installed. Initializing defaults...');
    // Create a default "General" profile
    try {
      await SettingsManager.createProfile('General', {
        'First Name': '',
        'Last Name': '',
        Email: '',
        Phone: '',
        Address: '',
        City: '',
        State: '',
        'Zip Code': '',
        Country: '',
      });
    } catch (_) {}
  }

  // Always run storage migration on install/update
  try {
    await SettingsManager.getApiKey(); // triggers auto-migration in db_adapter
  } catch (_) {}
});

/* -------------------------------------------------------
 *  STARTUP — self-healing storage check on every wake-up
 * ------------------------------------------------------- */

self.addEventListener('activate', async () => {
  try {
    // Triggers auto-migration: detects & wipes old encrypted blobs
    await SettingsManager.getApiKey();
    console.log('[LazyFill] Storage check passed.');
  } catch (err) {
    console.warn('[LazyFill] Storage check failed (non-fatal):', err.message);
  }
});

console.log('[LazyFill] Service Worker loaded.');
