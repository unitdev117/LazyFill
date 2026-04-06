/**
 * ============================================================
 *  GHOST TEXT — Inline Suggestion UI (Overlay-based)
 * ============================================================
 *  Shows AI suggestions as a real floating overlay div
 *  positioned directly over each matched input field.
 *
 *  Why overlay instead of placeholder?
 *  - Google Forms and React/Vue inputs use controlled components.
 *    Mutating `placeholder` is silently ignored or overwritten.
 *  - A real DOM overlay is framework-agnostic and always visible.
 *
 *  Tab to commit: works on both empty AND pre-filled fields.
 * ============================================================
 */

(function () {
  'use strict';

  if (window.__lazyFillGhostTextLoaded) return;
  window.__lazyFillGhostTextLoaded = true;

  const ghostState = new Map();
  let lastMappings = null;
  let lastScannedFields = null;

  /* --------------------------------------------------
   *  INJECT STYLESHEET
   * -------------------------------------------------- */

  const STYLE_ID = '__lazyfill_ghost_style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .lazyfill-ghost-overlay {
        position: absolute;
        pointer-events: none;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        padding: 0 8px;
        box-sizing: border-box;
        overflow: hidden;
        white-space: nowrap;
        font-size: inherit;
        font-family: inherit;
        border-radius: 4px;
        background: transparent;
      }
      .lazyfill-ghost-text {
        color: #a78bfa;
        font-style: italic;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: rgba(124, 58, 237, 0.08);
        border: 1px dashed rgba(124, 58, 237, 0.4);
        border-radius: 3px;
        padding: 1px 6px;
        letter-spacing: 0.01em;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lazyfill-ghost-tab-hint {
        font-size: 10px;
        color: #7c3aed;
        opacity: 0.7;
        margin-left: 4px;
        background: rgba(124, 58, 237, 0.12);
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 3px;
        padding: 0px 4px;
        font-family: monospace;
        flex-shrink: 0;
      }
      @keyframes lazyfill-fadein {
        from { opacity: 0; transform: translateY(-3px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .lazyfill-ghost-overlay { animation: lazyfill-fadein 0.2s ease; }

      @keyframes lazyfill-commit-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.6); }
        70%  { box-shadow: 0 0 0 8px rgba(124, 58, 237, 0); }
        100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0); }
      }
      .lazyfill-committed {
        animation: lazyfill-commit-pulse 0.6s ease !important;
      }
    `;
    document.head.appendChild(style);
  }

  /* --------------------------------------------------
   *  OVERLAY CREATION
   * -------------------------------------------------- */

  function createOverlay(el, suggestion) {
    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const overlay = document.createElement('div');
    overlay.className = 'lazyfill-ghost-overlay';
    overlay.style.left = `${rect.left + scrollX}px`;
    overlay.style.top = `${rect.top + scrollY}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    // Copy the input's font-size for alignment
    const computed = window.getComputedStyle(el);
    overlay.style.fontSize = computed.fontSize;
    overlay.style.fontFamily = computed.fontFamily;

    overlay.innerHTML = `
      <span class="lazyfill-ghost-text">${escapeHtml(suggestion)}</span>
      <span class="lazyfill-ghost-tab-hint">Tab ↵</span>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* --------------------------------------------------
   *  SHOW / CLEAR GHOST
   * -------------------------------------------------- */

  function showGhost(el, suggestion) {
    if (!el || !suggestion) return;

    const key = getElementKey(el);

    // Remove any existing overlay for this element first
    if (ghostState.has(key)) {
      const old = ghostState.get(key);
      if (old.overlay && old.overlay.parentNode) old.overlay.remove();
      ghostState.delete(key);
    }

    const overlay = createOverlay(el, suggestion);

    ghostState.set(key, { el, overlay, suggestedValue: suggestion });

    // Reposition if window scrolls or resizes
    const reposition = () => {
      const rect = el.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      overlay.style.left = `${rect.left + scrollX}px`;
      overlay.style.top = `${rect.top + scrollY}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    };

    window.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition, { passive: true });

    // Cleanup listeners when overlay is removed
    const observer = new MutationObserver(() => {
      if (!overlay.parentNode) {
        observer.disconnect();
        window.removeEventListener('scroll', reposition);
        window.removeEventListener('resize', reposition);
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }

  function clearGhost(el) {
    const key = getElementKey(el);
    const state = ghostState.get(key);
    if (state) {
      if (state.overlay && state.overlay.parentNode) state.overlay.remove();
      ghostState.delete(key);
    }
  }

  function clearAllGhosts() {
    ghostState.forEach((state) => {
      if (state.overlay && state.overlay.parentNode) state.overlay.remove();
    });
    ghostState.clear();
  }

  /* --------------------------------------------------
   *  COMMIT GHOST — write value into the input
   * -------------------------------------------------- */

  function commitGhost(el) {
    const key = getElementKey(el);
    const state = ghostState.get(key);
    if (!state || !state.suggestedValue) return false;

    const value = state.suggestedValue;

    // Framework-safe value injection
    if (window.__lazyFillInjector) {
      window.__lazyFillInjector.setFieldValue(el, value);
    } else {
      // Native setter bypass for React/Vue
      try {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(el, value);
        } else {
          el.value = value;
        }
      } catch (_) {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Remove overlay
    if (state.overlay && state.overlay.parentNode) state.overlay.remove();
    ghostState.delete(key);

    // Visual pulse feedback on the input
    el.classList.add('lazyfill-committed');
    setTimeout(() => el.classList.remove('lazyfill-committed'), 700);

    return true;
  }

  /* --------------------------------------------------
   *  KEYBOARD — Tab on focused input commits suggestion
   * -------------------------------------------------- */

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Tab') return;

      const el = document.activeElement;
      if (!el) return;

      const key = getElementKey(el);
      if (ghostState.has(key)) {
        e.preventDefault();
        e.stopPropagation();
        commitGhost(el);
      }
    },
    true // capture phase — fires before website listeners
  );

  /* --------------------------------------------------
   *  INPUT LISTENER — typing clears ghost overlay
   * -------------------------------------------------- */

  document.addEventListener('input', (e) => {
    const el = e.target;
    const key = getElementKey(el);
    // If user types something, clear our suggestion
    if (ghostState.has(key) && el.value) {
      clearGhost(el);
    }
  });

  /* --------------------------------------------------
   *  FOCUS LISTENER — show overlay on focus if ghost exists
   * -------------------------------------------------- */

  document.addEventListener('focus', (e) => {
    const el = e.target;
    const key = getElementKey(el);
    const state = ghostState.get(key);
    // If overlay was removed (e.g. scrolled out), recreate it
    if (state && (!state.overlay || !state.overlay.parentNode)) {
      const newOverlay = createOverlay(el, state.suggestedValue);
      state.overlay = newOverlay;
    }
  }, true);

  /* --------------------------------------------------
   *  ELEMENT KEY UTILITIES
   * -------------------------------------------------- */

  function getElementKey(el) {
    if (el.id) return `id:${el.id}`;
    if (el.name) return `name:${el.name}`;
    // DOM path fallback
    const path = [];
    let current = el;
    while (current && current !== document.body) {
      const tag = current.tagName?.toLowerCase() || '';
      const idx = current.parentElement
        ? Array.from(current.parentElement.children).indexOf(current)
        : 0;
      path.unshift(`${tag}[${idx}]`);
      current = current.parentElement;
    }
    return `path:${path.join('>')}`;
  }

  function findElementByKey(key) {
    if (key.startsWith('id:')) return document.getElementById(key.slice(3));
    if (key.startsWith('name:')) return document.querySelector(`[name="${CSS.escape(key.slice(5))}"]`);
    return null;
  }

  /* --------------------------------------------------
   *  MESSAGE LISTENER
   * -------------------------------------------------- */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'SHOW_GHOST_TEXT') {
      const { mappings, scannedFields } = message.payload;
      
      // Store globally so Complete Auto Fill can force-fill everything
      lastMappings = mappings;
      lastScannedFields = scannedFields;

      // Clear previous overlays before showing new ones
      clearAllGhosts();

      let shown = 0;
      mappings.forEach((mapping) => {
        const fieldMeta = scannedFields[mapping.index];
        if (!fieldMeta || !mapping.value) return;

        let el = null;

        // Resolve element from metadata
        if (fieldMeta.id) {
          el = document.getElementById(fieldMeta.id);
        }
        if (!el && fieldMeta.name) {
          el = document.querySelector(`[name="${CSS.escape(fieldMeta.name)}"]`);
        }
        // Fallback: match by placeholder or aria-label
        if (!el && fieldMeta.placeholder) {
          el = document.querySelector(
            `input[placeholder="${CSS.escape(fieldMeta.placeholder)}"],` +
            `textarea[placeholder="${CSS.escape(fieldMeta.placeholder)}"]`
          );
        }

        if (el) {
          // If the field is already filled (either by native autofill or user), DO NOT show suggestions
          const currentVal = el.value || (el.isContentEditable ? el.innerText.replace(/\s/g, '') : '');
          if (!currentVal) {
             showGhost(el, mapping.value);
             shown++;
          }
        }
      });

      sendResponse({ success: true, shown });
      return true;
    }

    if (message.action === 'CLEAR_GHOST_TEXT') {
      clearAllGhosts();
      sendResponse({ success: true });
      return true;
    }

    // Commits only visible ghosts (e.g. if we trigger via hotkey for just empty fields)
    if (message.action === 'COMMIT_ALL_GHOSTS') {
      let committed = 0;
      ghostState.forEach((state, key) => {
        const el = state.el || findElementByKey(key);
        if (el && commitGhost(el)) committed++;
      });
      sendResponse({ success: true, committed });
      return true;
    }

    // Force commits ALL background AI mappings, including fields that already had data
    if (message.action === 'COMMIT_ALL_MAPPINGS') {
      if (!lastMappings || lastMappings.length === 0) {
        sendResponse({ success: false, error: 'No cached AI mappings available.' });
        return true;
      }
      
      let filled = 0;
      
      if (window.__lazyFillInjector && window.__lazyFillInjector.batchFill) {
        const result = window.__lazyFillInjector.batchFill(lastMappings, lastScannedFields);
        filled = result.filled;
      }
      
      // Since everything is fully filled now, clear any remaining overlays
      clearAllGhosts();
      
      sendResponse({ success: true, committed: filled });
      return true;
    }
  });

  /* --------------------------------------------------
   *  EXPOSE
   * -------------------------------------------------- */

  window.__lazyFillGhostText = {
    showGhost,
    clearGhost,
    clearAllGhosts,
    commitGhost
  };
})();
