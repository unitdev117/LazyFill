/**
 * ============================================================
 *  PASSIVE AUTOFILL OBSERVER
 * ============================================================
 *  Watches the DOM for any new fillable fields added by dynamic
 *  frameworks (like React on Eightfold AI).
 *  Segregated from scanner.js to keep code clean.
 *  Applies debounce, retry polling, and fingerprint detection.
 *  Only runs in top-level window (manifest no longer uses all_frames).
 * ============================================================
 */

(function () {
  'use strict';

  // Only run in the top-level window — not inside iframes
  if (window !== window.top) return;

  if (window.__lazyFillObserverLoaded) return;
  window.__lazyFillObserverLoaded = true;

  const FILLABLE_SELECTORS = 'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]';
  let scanBounceTimer = null;
  let lastScanFingerprint = '';

  // Two SEPARATE counters so they don't exhaust each other
  let scannerReadyPolls = 0;
  let noFieldsPolls = 0;
  const MAX_SCANNER_POLLS = 10; // 10 × 500ms = 5s to find scanner.js global
  const MAX_FIELD_POLLS = 8;    // 8 × 2s = 16s of patience for slow React apps

  function triggerBackgroundScan() {
    // Guard: wait until scanner.js has registered its global object
    if (!window.__lazyFillScanner || !window.__lazyFillScanner.performScan) {
      if (scannerReadyPolls < MAX_SCANNER_POLLS) {
        scannerReadyPolls++;
        scanBounceTimer = setTimeout(triggerBackgroundScan, 500);
      }
      return;
    }

    const fields = window.__lazyFillScanner.performScan();

    // Polling: retry if the form hasn't rendered yet (slow React/SPA)
    if (fields.length === 0) {
      if (noFieldsPolls < MAX_FIELD_POLLS) {
        noFieldsPolls++;
        scanBounceTimer = setTimeout(triggerBackgroundScan, 2000);
      }
      return;
    }

    // Fingerprint: only call the AI if this is a genuinely new form state
    const currentFingerprint = fields.map(f => `${f.id}:${f.name}:${f.type}`).join('|');

    if (currentFingerprint !== lastScanFingerprint) {
      lastScanFingerprint = currentFingerprint;
      scannerReadyPolls = 0;
      noFieldsPolls = 0;
      try {
        chrome.runtime.sendMessage({
          action: 'BACKGROUND_PROCESS_SCAN',
          payload: { scannedFields: fields }
        }).catch(() => {});
      } catch (err) {
        // Extension context invalidated — user must reload the tab
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            if (node.matches && node.matches(FILLABLE_SELECTORS)) {
              shouldScan = true; break;
            } else if (node.querySelector && node.querySelector(FILLABLE_SELECTORS)) {
              shouldScan = true; break;
            }
          }
        }
      }
      if (shouldScan) break;
    }

    if (shouldScan) {
      clearTimeout(scanBounceTimer);
      noFieldsPolls = 0; // Reset no-field counter when new nodes appear
      scanBounceTimer = setTimeout(triggerBackgroundScan, 1000);
    }
  });

  const startObserver = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true });

    // Reset all state cleanly on page load
    scannerReadyPolls = 0;
    noFieldsPolls = 0;
    lastScanFingerprint = '';

    // Give scanner.js 1.5s head start to register its global
    scanBounceTimer = setTimeout(triggerBackgroundScan, 1500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})();
