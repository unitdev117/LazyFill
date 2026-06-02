/**
 * ============================================================
 *  SHARED GUARDS — Sensitive Site & Field Detection
 * ============================================================
 *  Central safety layer for the content bundle.
 *
 *  LazyFill is a convenience autofill tool for non-sensitive
 *  profile data (name, email, phone, address). It must NOT
 *  operate on banking / payment / government ("secure") sites,
 *  and must NEVER touch credential, payment, or identity
 *  fields (passwords, OTPs, card numbers, SSNs, etc.) — even
 *  on otherwise-allowed pages.
 *
 *  Imported by the scanner (source), observer, injector (sink)
 *  and ghost-text UI so every code path enforces the same rules.
 *
 *  The curated sensitive host/field data lives in the tested
 *  shared/sensitive-data.js module; this file wires it to the
 *  live page + the user disabled-list.
 * ============================================================
 */

import { isSensitiveHost, isSensitiveField } from '../../shared/sensitive-data.js';

// Re-export so existing importers keep using `guards.isSensitiveField`.
export { isSensitiveField };

/**
 * Normalize a hostname for comparison: lowercase, strip a leading "www."
 * and any trailing dot.
 * @param {string} host
 * @returns {string}
 */
export function normalizeHost(host) {
  return (host || '').toString().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/**
 * Whole-domain match: `current` is blocked by `entry` when it is the same
 * host OR a subdomain of it. This makes a disabled entry cover the COMPLETE
 * website (every path and subdomain), never just one page.
 * @param {string} currentHost
 * @param {string} entryHost
 * @returns {boolean}
 */
export function hostCoveredBy(currentHost, entryHost) {
  const c = normalizeHost(currentHost);
  const d = normalizeHost(entryHost);
  if (!c || !d) return false;
  return c === d || c.endsWith('.' + d);
}

/**
 * Decide whether the current host is a banking / secure site that
 * LazyFill must stay out of.
 * @param {Location|{hostname:string}} [loc=window.location]
 * @returns {boolean}
 */
export function isSensitiveSite(loc = (typeof window !== 'undefined' ? window.location : null)) {
  return isSensitiveHost(loc && loc.hostname ? loc.hostname : '');
}

/* --------------------------------------------------
 *  USER DISABLED LIST (fully user-driven)
 * --------------------------------------------------
 *  Hosts the user has explicitly turned LazyFill off for, managed
 *  from the popup's "Disabled" section. Nothing here is hardcoded —
 *  the list is whatever the user added, persisted in chrome.storage.
 *  We cache it locally and keep it in sync so the (synchronous) scan
 *  path can consult it without an async round-trip.
 */

export const DISABLED_SITES_KEY = 'lazyfill_disabled_sites';

let disabledHosts = [];

(function initDisabledCache() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  try {
    chrome.storage.local.get([DISABLED_SITES_KEY], (res) => {
      if (chrome.runtime && chrome.runtime.lastError) return;
      const list = res && res[DISABLED_SITES_KEY];
      disabledHosts = Array.isArray(list) ? list : [];
    });
    if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[DISABLED_SITES_KEY]) {
          const next = changes[DISABLED_SITES_KEY].newValue;
          disabledHosts = Array.isArray(next) ? next : [];
        }
      });
    }
  } catch (_) {
    // chrome.storage unavailable (e.g. non-extension context) — stay empty.
  }
})();

/**
 * Has the user disabled LazyFill for the current website (whole domain)?
 * @param {Location|{hostname:string}} [loc=window.location]
 * @param {string[]} [hosts=disabledHosts] - injectable for testing
 * @returns {boolean}
 */
export function isSiteDisabled(
  loc = (typeof window !== 'undefined' ? window.location : null),
  hosts = disabledHosts
) {
  const host = loc && loc.hostname ? loc.hostname : '';
  if (!host) return false;
  return (Array.isArray(hosts) ? hosts : []).some((entry) => hostCoveredBy(host, entry));
}

/**
 * Single source of truth for "should LazyFill stay out of this page?".
 * Returns a reason object for UI messaging, or null when allowed.
 * @param {Location|{hostname:string}} [loc=window.location]
 * @returns {{code:string, message:string}|null}
 */
export function getBlockReason(loc = (typeof window !== 'undefined' ? window.location : null)) {
  if (isSensitiveSite(loc)) {
    return { code: 'secure', message: 'LazyFill is disabled on banking and other secure sites.' };
  }
  if (isSiteDisabled(loc)) {
    return { code: 'disabled', message: 'LazyFill is turned off for this site.' };
  }
  return null;
}

/* --------------------------------------------------
 *  SENSITIVE FIELDS
 * -------------------------------------------------- */

/**
 * Convenience wrapper that reads the identifying attributes straight off
 * a live DOM element and applies the shared sensitive-field check.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export function isSensitiveElement(el) {
  if (!el || !el.getAttribute) return false;
  return isSensitiveField({
    name: el.getAttribute('name') || '',
    id: el.id || '',
    placeholder: el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    autocomplete: el.getAttribute('autocomplete') || '',
    type: (el.getAttribute('type') || '').toLowerCase(),
  });
}
