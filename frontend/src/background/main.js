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

import SettingsManager from './services/settings.js';
import AIController from '../../../backend/controllers/ai_controller.js';
import { handleError } from '../../../util/errors/error_handler.js';
import db from '../../../backend/database/db_adapter.js';

// Optimization Services
import FieldFilter from '../../../backend/services/field_filter.js';
import CacheManager from '../../../backend/services/cache_manager.js';
import LocalMatcher from '../../../backend/services/local_matcher.js';

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

    // 1. Get Context
    const apiKey = await SettingsManager.getApiKey();
    const profile = await SettingsManager.getActiveProfile();
    if (!apiKey || !profile) {
      return { success: false, error: 'Not configured' };
    }

    // 2. Optimization: Exclude already-filled fields
    const emptyFields = FieldFilter.clean(scannedFields);
    if (emptyFields.length === 0) {
      return { success: true, mappings: [], reason: 'No empty fields' };
    }

    // 3. Optimization: Local Matching
    const { localMappings, remainingFields } = LocalMatcher.findMatches(emptyFields, profile.fields);
    console.log(`[LazyFill] Manual Scan: ${localMappings.length} local matches, ${remainingFields.length} to AI.`);

    let finalMappings = [...localMappings];

    // 4. Call AI for remaining fields
    if (remainingFields.length > 0) {
      console.log('[LazyFill] Manual Scan: Requesting AI for complex fields...');
      const aiResult = await AIController.generateFill(apiKey, remainingFields, profile.fields, profile.name);
      if (aiResult.success && aiResult.mappings) {
        finalMappings = [...finalMappings, ...aiResult.mappings];
      } else if (!aiResult.success) {
        // If AI fails but we have local matches, we can still return those
        return aiResult;
      }
    }

    return { success: true, mappings: finalMappings };
  },

  BACKGROUND_PROCESS_SCAN: async (payload, sender) => {
    const tabId = sender?.tab?.id;
    if (!tabId) return { success: false, error: 'No tab id' };

    // Anti-Race-Condition: Keep track of the latest scan trigger per tab
    const currentScanTime = Date.now();
    if (!self.__activeBackgroundScans) self.__activeBackgroundScans = new Map();
    self.__activeBackgroundScans.set(tabId, currentScanTime);

    // 1. Get User Context
    const apiKey = await SettingsManager.getApiKey();
    const profile = await SettingsManager.getActiveProfile();
    const settings = await SettingsManager.getSettings();

    // Do NOT run autonomous scan ONLY if the user has explicitly disabled Ghost Preview
    if (settings.ghostPreviewEnabled === false || !apiKey || !profile) {
      return { success: false, error: 'Not configured or disabled' };
    }

    // 1. Pre-calculate THE Form Fingerprint (Stable structure)
    // We use payload.scannedFields (ALL fields) to ensure the fingerprint is consistent
    // even if some fields are filled.
    const fprint = CacheManager.generateFingerprint(payload.scannedFields);

    // 2. Optimization Pipeline: Identify which fields actually need filling
    const emptyFields = FieldFilter.clean(payload.scannedFields);
    const filteredCount = payload.scannedFields.length - emptyFields.length;
    if (filteredCount > 0) {
      console.log(`[LazyFill] Ignoring ${filteredCount} fields that are already filled.`);
    }

    if (emptyFields.length === 0) {
      chrome.tabs.sendMessage(tabId, { action: 'CLEAR_GHOST_TEXT' }).catch(() => {});
      return { success: true, count: 0, reason: 'No empty fields' };
    }

    // 3. Cache Look-up (Assembly Line 2.0)
    // Get whatever we already know about this form structure
    const cachedMappings = await CacheManager.get(fprint) || [];
    if (cachedMappings.length > 0) {
      console.log(`[LazyFill] ⚡ Cache Hit: Found ${cachedMappings.length} mappings for this form.`);
    }

    // 4. Gap Detection (Healing)
    // Find fields that are currently empty but have no mapping in our cache
    // (This happens if the user manually filled them in a previous session or if new fields appeared)
    const missingFields = emptyFields.filter(field => 
      !cachedMappings.some(m => m.index === field.index)
    );

    // 5. Local Matcher Priority (Instant Healing)
    const { localMappings, remainingFields } = LocalMatcher.findMatches(missingFields, profile.fields);
    
    // Combine Cache + Local Matcher for an "Instant" first-pass
    let instantMappings = [...cachedMappings, ...localMappings];

    // 6. Instant Local Preview
    // We send this immediately so the user sees results without waiting for the AI
    if (instantMappings.length > 0) {
      console.log(`[LazyFill] 🚀 Sending Instant Preview (${instantMappings.length} fields)`);
      chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_GHOST_TEXT',
        payload: { mappings: instantMappings, scannedFields: payload.scannedFields }
      }).catch(() => {});
    }

    // 7. Background Healing (AI Cycle)
    // If we still have missing fields, call Gemini to finish the job
    if (remainingFields.length > 0) {
      console.log(`[LazyFill] 🤖 Cache is missing ${remainingFields.length} fields. Healing via Gemini AI...`);
      const aiResult = await AIController.generateFill(apiKey, remainingFields, profile.fields, profile.name);
      
      if (aiResult.success && aiResult.mappings) {
        // Merge New AI results into our mappings
        const finalMappings = [...instantMappings, ...aiResult.mappings];
        
        // Save the "Healed" cache back for next time
        await CacheManager.save(fprint, finalMappings);

        // Update UI with the final complete set
        // Check if a newer scan hijacked us first
        if (self.__activeBackgroundScans.get(tabId) === currentScanTime) {
          chrome.tabs.sendMessage(tabId, {
            action: 'SHOW_GHOST_TEXT',
            payload: { mappings: finalMappings, scannedFields: payload.scannedFields }
          }).catch(() => {});
          console.log(`[LazyFill] ✅ Form "Healed"! Total mappings: ${finalMappings.length}`);
        }
        return { success: true, count: finalMappings.length };
      }
    } else if (localMappings.length > 0) {
      // If we healed via local matcher, update the cache so we don't even run Local Matcher next time
      await CacheManager.save(fprint, instantMappings);
      console.log('[LazyFill] ✅ Form healed locally. Cache updated.');
    } else {
      console.log('[LazyFill] ✅ Form fully covered. No AI required.');
    }

    return { success: true, mappings: instantMappings };
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

  REQUEST_AUTONOMOUS_GHOST: async (payload, sender) => {
    const tabId = payload.tabId || (sender.tab ? sender.tab.id : null);
    if (tabId) {
      await checkAndGhost(tabId);
      return { success: true };
    }
    return { success: false, error: 'No tab ID' };
  }
};

/* -------------------------------------------------------
 *  AUTONOMOUS GHOST ENGINE
 * ------------------------------------------------------- */

async function checkAndGhost(tabId) {
  console.log('[LazyFill] Auto-ghost check for tab:', tabId);
  const settings = await SettingsManager.getSettings();
  if (!settings.ghostPreviewEnabled) return;

  const apiKey = await SettingsManager.getApiKey();
  const profile = await SettingsManager.getActiveProfile();
  if (!apiKey || !profile) return;

  // SPA Retry Logic: Try up to 3 times with 2s delays to catch lazy-loaded forms
  const MAX_RETRIES = 3;
  let scanRes = null;

  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      scanRes = await chrome.tabs.sendMessage(tabId, { action: 'SCAN_PAGE' });
      if (scanRes?.success && scanRes.scannedFields?.length > 0) {
        console.log(`[LazyFill] Found ${scanRes.count} fields on attempt ${i + 1}`);
        break;
      }
    } catch (e) {
      // Content script might not be ready yet
    }
    if (i < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 2500));
    }
  }

  if (!scanRes?.success || !scanRes.scannedFields?.length) {
    console.log('[LazyFill] Auto-ghost check timed out or found no fields');
    return;
  }

  try {
    // 2. Consult AI
    const aiRes = await AIController.generateFill(
      apiKey, 
      scanRes.scannedFields, 
      profile.fields, 
      profile.name
    );

    // 3. Show Ghost Text
    if (aiRes.success && aiRes.mappings?.length) {
      console.log(`[LazyFill] AI returned ${aiRes.mappings.length} mappings. Showing ghosts...`);
      await chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_GHOST_TEXT',
        payload: { 
          mappings: aiRes.mappings, 
          scannedFields: scanRes.scannedFields 
        }
      });
    }
  } catch (err) {
    console.warn('[LazyFill] Autonomous scan failed:', err.message);
  }
}

/* -------------------------------------------------------
 *  NAVIGATION LISTENERS
 * ------------------------------------------------------- */

const handleNav = (details) => {
  if (details.frameId === 0 && details.url.startsWith('http')) {
    checkAndGhost(details.tabId);
  }
};

// standard load
chrome.webNavigation.onCompleted.addListener(handleNav);
// SPA / History pushState
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNav);

// Tab status manual fallback
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    checkAndGhost(tabId);
  }
});

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
