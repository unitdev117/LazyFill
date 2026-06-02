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
import { handleError } from '../util/error_handler.js';
import db from '../../../backend/database/db_adapter.js';

// Optimization Services
import FieldFilter from '../../../backend/services/field_filter.js';
import CacheManager from '../../../backend/services/cache_manager.js';
import LocalMatcher from '../../../backend/services/local_matcher.js';
import { inferFieldIntent, inferProfileKeyIntent } from '../shared/field-semantics.js';

// Global map to track active AI requests per tab for cancellation
const activeControllers = new Map();

/* -------------------------------------------------------
 *  MASTER POWER SWITCH (session-scoped)
 * -------------------------------------------------------
 *  LazyFill stays OFF by default at the start of every browser
 *  session and only runs after the user explicitly turns it on
 *  from the popup. We store the flag in chrome.storage.session,
 *  which is automatically cleared when the browser restarts — so
 *  "off on every browser start" requires no extra bookkeeping.
 *  When OFF, nothing scans, suggests, or fills (no AI usage).
 */

const MASTER_KEY = 'masterEnabled';

async function isMasterEnabled() {
  try {
    const result = await chrome.storage.session.get(MASTER_KEY);
    return result[MASTER_KEY] === true;
  } catch (_) {
    return false;
  }
}

async function setMasterEnabled(enabled) {
  try {
    await chrome.storage.session.set({ [MASTER_KEY]: enabled === true });
  } catch (err) {
    console.warn('[LazyFill] Failed to persist master state:', err.message);
  }
}

/* -------------------------------------------------------
 *  USER DISABLED LIST (whole-domain, user-driven)
 * -------------------------------------------------------
 *  Authoritative guard for the autonomous AI path. The list is
 *  whatever the user added from the popup's "Disabled" section
 *  (nothing hardcoded). A stored host disables the COMPLETE site
 *  — every path and every subdomain.
 */

const DISABLED_SITES_KEY = 'lazyfill_disabled_sites';

function normalizeHost(host) {
  return (host || '').toString().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
}

async function isUrlDisabled(url) {
  const current = normalizeHost(hostFromUrl(url));
  if (!current) return false;
  try {
    const res = await chrome.storage.local.get([DISABLED_SITES_KEY]);
    const list = Array.isArray(res[DISABLED_SITES_KEY]) ? res[DISABLED_SITES_KEY] : [];
    return list.some((entry) => {
      const d = normalizeHost(entry);
      return d && (current === d || current.endsWith('.' + d));
    });
  } catch (_) {
    return false;
  }
}

/**
 * Cleanup and abort any pending AI calls for a specific tab.
 */
function cleanupTabRequest(tabId) {
  const controller = activeControllers.get(tabId);
  if (controller) {
    console.log(`[LazyFill] Aborting AI request for tab: ${tabId}`);
    controller.abort('Tab closed or abandoned.');
    activeControllers.delete(tabId);
  }
}

// Field/profile-key semantics come from the shared, unit-tested module so
// that local matching and this post-AI validation use the SAME category table.

function getMatchingProfileKeyIntents(mapping, profileFields) {
  if (mapping.profileKey) {
    const intent = inferProfileKeyIntent(mapping.profileKey);
    return intent ? [intent] : [];
  }

  const matchedKeys = Object.entries(profileFields)
    .filter(([, value]) => value === mapping.value)
    .map(([key]) => inferProfileKeyIntent(key))
    .filter(Boolean);

  return [...new Set(matchedKeys)];
}

function filterMappingsByIntent(mappings, scannedFields, profileFields) {
  if (!Array.isArray(mappings)) return [];

  return mappings.filter((mapping) => {
    if (!mapping || typeof mapping.index !== 'number') return false;

    const field = scannedFields[mapping.index];
    if (!field) return false;

    const fieldIntent = inferFieldIntent(field);
    if (!fieldIntent) return true;

    const profileKeyIntents = getMatchingProfileKeyIntents(mapping, profileFields);
    if (profileKeyIntents.length === 0) return true;

    return profileKeyIntents.includes(fieldIntent);
  });
}

function clearGhostText(tabId) {
  if (!tabId) return;

  chrome.tabs.sendMessage(tabId, { action: 'CLEAR_GHOST_TEXT' }).catch(() => {});
}

/* -------------------------------------------------------
 *  INTELLIGENCE ENGINE — Unified Mapping Orchestrator
 * ------------------------------------------------------- */

/**
 * The single source of truth for form mapping.
 * Enforces: Clean -> Cache -> Local Match -> AI Healing -> Save Cache.
 */
async function executeMappingCycle(scannedFields, tabId, options = {}) {
  // 1. Get Context
  const apiKey = await SettingsManager.getApiKey();
  const profile = await SettingsManager.getActiveProfile();
  const settings = await SettingsManager.getSettings();

  if (!apiKey || !profile) {
    return { success: false, error: 'Not configured' };
  }

  // 2. Pre-calculate THE Form Fingerprint (Stable structure)
  const fprint = CacheManager.generateFingerprint(scannedFields);

  // 3. Optimization: Exclude already-filled fields
  const emptyFields = FieldFilter.clean(scannedFields);
  if (emptyFields.length === 0) {
    if (tabId && options.isGhost) {
      clearGhostText(tabId);
    }
    return { success: true, mappings: [], reason: 'No empty fields' };
  }

  // 4. Cache Look-up (Assembly Line 2.0)
  const rawCachedMappings = (await CacheManager.get(fprint)) || [];
  const cachedMappings = filterMappingsByIntent(
    CacheManager.reconcileMappings(rawCachedMappings, scannedFields),
    scannedFields,
    profile.fields
  );

  // 5. Gap Detection (Healing)
  const missingFields = emptyFields.filter(
    (field) => !cachedMappings.some((m) => m.index === field.index)
  );

  // 6. Local Matcher Priority (Instant Healing)
  const { localMappings, remainingFields } = LocalMatcher.findMatches(missingFields, profile.fields);

  // Combine Cache + Local Matcher for an "Instant" first-pass
  let currentMappings = filterMappingsByIntent(
    [...cachedMappings, ...localMappings],
    scannedFields,
    profile.fields
  );

  // 7. Instant UI Update / Autofill
  if (tabId && (options.isGhost || settings.autoFillEnabled) && currentMappings.length > 0) {
    if (settings.autoFillEnabled) {
      clearGhostText(tabId);
      console.log(`[LazyFill] Intelligence Engine: Autofilling ${currentMappings.length} fields (Auto-fill Mode ON)`);
      chrome.tabs.sendMessage(tabId, {
        action: 'FILL_FIELDS',
        payload: { mappings: currentMappings, scannedFields },
      }).catch(() => {});
    } else if (settings.ghostPreviewEnabled) {
      chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_GHOST_TEXT',
        payload: { mappings: currentMappings, scannedFields },
      }).catch(() => {});
    }
  }

  // 8. AI Healing (if needed)
  if (remainingFields.length > 0) {
    console.log(`[LazyFill] Intelligence Engine: Calling AI for ${remainingFields.length} missing fields.`);
    try {
      const aiResult = await AIController.generateFill(apiKey, remainingFields, profile.fields, profile.name, {
        signal: options.signal,
      });

      if (aiResult.success && aiResult.mappings) {
        // Merge New AI results into our mappings
        currentMappings = filterMappingsByIntent(
          [...currentMappings, ...aiResult.mappings],
          scannedFields,
          profile.fields
        );

        // Save the "Healed" cache back for next time
        await CacheManager.save(fprint, currentMappings, scannedFields);

        // Update UI or Autofill with the final complete set
        if (tabId && (options.isGhost || settings.autoFillEnabled)) {
          if (settings.autoFillEnabled) {
            clearGhostText(tabId);
            chrome.tabs.sendMessage(tabId, {
              action: 'FILL_FIELDS',
              payload: { mappings: currentMappings, scannedFields },
            }).catch(() => {});
          } else if (settings.ghostPreviewEnabled) {
            chrome.tabs.sendMessage(tabId, {
              action: 'SHOW_GHOST_TEXT',
              payload: { mappings: currentMappings, scannedFields },
            }).catch(() => {});
          }
        }
      } else if (!aiResult.success) {
        // Log to extension DB since AIController backend handler doesn't persist to chrome.storage
        await handleError(aiResult.error || aiResult, 'background.executeMappingCycle.ai_failure');
        
        if (!options.isGhost) {
          // Only return AI error back to UI if this is a manual autofill request
          return aiResult;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.warn('[LazyFill] Mapping cycle AI failed:', err.message);
      // Explicitly log to extension DB since AIController now uses the clean backend handler
      await handleError(err, 'background.executeMappingCycle.ai_healing');
    }
  } else if (localMappings.length > 0) {
    // If we healed via local matcher, update the cache so we don't even run Local Matcher next time
    await CacheManager.save(fprint, currentMappings, scannedFields);
    console.log('[LazyFill] Intelligence Engine: Form healed locally. Cache updated.');
  }

  return { success: true, mappings: currentMappings };
}

/* -------------------------------------------------------
 *  MESSAGE ROUTER — maps action names to handler functions
 * ------------------------------------------------------- */

const handlers = {
  /* ---- AUTH ---- */
  AUTH_SIGNUP: async (payload) => {
    const result = await db.signUp(payload);
    return { success: true, ...result };
  },

  AUTH_LOGIN: async (payload) => {
    const result = await db.login(payload);
    return { success: true, ...result };
  },

  AUTH_LOGOUT: async () => {
    await db.logout();
    return { success: true };
  },

  AUTH_GET_SESSION: async () => {
    const state = await db.getAuthState();
    return { success: true, ...state };
  },

  AUTH_CHANGE_PASSWORD: async (payload) => {
    const result = await db.changePassword(payload);
    return { success: true, ...result };
  },

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

  /* ---- MASTER POWER SWITCH ---- */
  GET_MASTER_STATE: async () => {
    return { success: true, enabled: await isMasterEnabled() };
  },

  SET_MASTER_STATE: async (payload) => {
    const enabled = payload?.enabled === true;
    await setMasterEnabled(enabled);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (enabled) {
      // Kick off an immediate pass on the current tab so suggestions appear.
      if (tab?.id && tab.url?.startsWith('http')) {
        checkAndGhost(tab.id);
      }
    } else {
      // Turning off: abort any in-flight AI work and clear existing suggestions.
      for (const pendingTabId of Array.from(activeControllers.keys())) {
        cleanupTabRequest(pendingTabId);
      }
      if (tab?.id) clearGhostText(tab.id);
    }

    return { success: true, enabled };
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

  PROCESS_SCAN_RESULTS: async (payload, sender) => {
    // Master switch gate — manual autofill is also disabled while LazyFill is off.
    if (!(await isMasterEnabled())) {
      return {
        success: false,
        masterOff: true,
        error: { message: 'LazyFill is off. Turn it on from the popup to use autofill.' },
      };
    }

    const tabId = sender?.tab?.id;
    const { scannedFields } = payload;

    // Cancellation support
    if (tabId) cleanupTabRequest(tabId);
    const controller = new AbortController();
    if (tabId) activeControllers.set(tabId, controller);

    try {
      return await executeMappingCycle(scannedFields, tabId, {
        signal: controller.signal,
        isGhost: false,
      });
    } finally {
      if (tabId) activeControllers.delete(tabId);
    }
  },

  BACKGROUND_PROCESS_SCAN: async (payload, sender) => {
    // Master switch gate — ignore passive observer scans while LazyFill is off.
    if (!(await isMasterEnabled())) {
      return { success: false, masterOff: true, reason: 'LazyFill is off' };
    }

    // User disabled-list gate.
    if (await isUrlDisabled(sender?.tab?.url)) {
      return { success: false, disabled: true, reason: 'Site disabled by user' };
    }

    const tabId = sender?.tab?.id;
    if (!tabId) return { success: false, error: 'No tab id' };

    // Anti-Race-Condition: Keep track of the latest scan trigger per tab
    const currentScanTime = Date.now();
    if (!self.__activeBackgroundScans) self.__activeBackgroundScans = new Map();
    self.__activeBackgroundScans.set(tabId, currentScanTime);

    // Cancellation support
    cleanupTabRequest(tabId);
    const controller = new AbortController();
    activeControllers.set(tabId, controller);

    try {
      const result = await executeMappingCycle(payload.scannedFields, tabId, {
        signal: controller.signal,
        isGhost: true,
      });

      // Verify if a newer scan hijacked us first
      if (self.__activeBackgroundScans.get(tabId) !== currentScanTime) {
        return { success: false, reason: 'Outdated scan' };
      }

      return result;
    } finally {
      activeControllers.delete(tabId);
    }
  },

  /* ---- SETTINGS ---- */
  SET_GHOST_PREVIEW: async (payload) => {
    const res = await SettingsManager.setGhostPreview(payload.enabled);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      clearGhostText(tab.id);
    }
    if (payload.enabled) {
      if (tab?.id) checkAndGhost(tab.id);
    }
    return res;
  },

  SET_AUTO_FILL_MODE: async (payload) => {
    const res = await SettingsManager.setAutoFillMode(payload.enabled);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      clearGhostText(tab.id);
    }
    if (payload.enabled) {
      if (tab?.id) checkAndGhost(tab.id);
    }
    return res;
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
  // Master switch gate — do nothing until the user turns LazyFill on.
  if (!(await isMasterEnabled())) return;

  // User disabled-list gate — never run on a site the user turned off.
  const tabInfo = await chrome.tabs.get(tabId).catch(() => null);
  if (tabInfo && (await isUrlDisabled(tabInfo.url))) {
    return;
  }

  console.log('[LazyFill] Auto-ghost check for tab:', tabId);
  const settings = await SettingsManager.getSettings();
  
  // Scans are allowed if either Ghost Preview OR Auto-fill Mode is active
  if (!settings.ghostPreviewEnabled && !settings.autoFillEnabled) return;

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
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  if (!scanRes?.success || !scanRes.scannedFields?.length) {
    console.log('[LazyFill] Auto-ghost check timed out or found no fields');
    return;
  }

  // Anti-Race-Condition: Navigation trigger counts as an active scan
  const currentScanTime = Date.now();
  if (!self.__activeBackgroundScans) self.__activeBackgroundScans = new Map();
  self.__activeBackgroundScans.set(tabId, currentScanTime);

  // Cancellation support
  cleanupTabRequest(tabId);
  const controller = new AbortController();
  activeControllers.set(tabId, controller);

  try {
    await executeMappingCycle(scanRes.scannedFields, tabId, {
      signal: controller.signal,
      isGhost: true,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[LazyFill] Autonomous scan cancelled.');
    } else {
      console.warn('[LazyFill] Autonomous scan failed:', err.message);
    }
  } finally {
    activeControllers.delete(tabId);
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
  if (changeInfo.status === 'loading') {
    cleanupTabRequest(tabId); // Cancel moving away
  }
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    checkAndGhost(tabId);
  }
});

// tab closed
chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupTabRequest(tabId);
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

// Force the master switch OFF whenever a new browser session begins.
// (chrome.storage.session is already cleared on restart; this is belt-and-suspenders.)
chrome.runtime.onStartup.addListener(() => {
  setMasterEnabled(false);
});

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
    await purgeOldCache();
  } catch (_) {}
});

/**
 * Identify and remove legacy v1 cache keys from storage.
 */
async function purgeOldCache() {
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter(
    (k) =>
      k.startsWith('cache_fprint_') ||
      k.startsWith('cache_v2_fprint_') ||
      k.startsWith('cache_v3_fprint_')
  );
  if (keysToRemove.length > 0) {
    console.log(`[LazyFill] Purging ${keysToRemove.length} legacy cache entries.`);
    await chrome.storage.local.remove(keysToRemove);
  }
}


/* -------------------------------------------------------
 *  STARTUP - self-healing storage check on every wake-up
 * ------------------------------------------------------- */

self.addEventListener('activate', async () => {
  try {
    // Triggers auto-migration: detects & wipes old encrypted blobs
    await SettingsManager.getApiKey();
    await purgeOldCache();
    console.log('[LazyFill] Storage check passed.');
  } catch (err) {
    console.warn('[LazyFill] Storage check failed (non-fatal):', err.message);
  }
});

console.log('[LazyFill] Service Worker loaded.');
