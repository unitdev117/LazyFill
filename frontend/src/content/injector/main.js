/**
 * ============================================================
 *  EVENT INJECTOR — Framework-Safe Autofill Execution
 * ============================================================
 *  Fills form fields while bypassing React/Vue/Angular change
 *  detection blockers by using native property setters and
 *  dispatching synthetic events.
 * ============================================================
 */

(function () {
  'use strict';

  window.__lazyFillInjectorLoaded = true;

  /* --------------------------------------------------
   *  NATIVE SETTERS — bypass framework wrappers
   * -------------------------------------------------- */

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;

  const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value'
  )?.set;

  /* --------------------------------------------------
   *  SYNTHETIC EVENT DISPATCHERS
   * -------------------------------------------------- */

  /**
   * Dispatch a series of events to simulate real user interaction.
   * @param {HTMLElement} el
   */
  function dispatchEvents(el) {
    el.dispatchEvent(new Event('focus', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /**
   * More detailed event simulation for stubborn frameworks.
   * @param {HTMLElement} el
   * @param {string}      value
   */
  function dispatchKeyboardEvents(el, value) {
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    for (const char of value) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  /* --------------------------------------------------
   *  FIELD SETTER — set value using native setter
   * -------------------------------------------------- */

  /**
   * Set the value of a form element, bypassing framework interceptors.
   * @param {HTMLElement} el
   * @param {string}      value
   * @returns {boolean}    success
   */
  function setFieldValue(el, value) {
    const tag = el.tagName.toLowerCase();

    try {
      if (tag === 'select') {
        // Ensure the option exists
        const optionExists = Array.from(el.options).some((o) => o.value === value);
        if (!optionExists) {
          // Try matching by text content
          const matchByText = Array.from(el.options).find(
            (o) => o.textContent.trim().toLowerCase() === value.toLowerCase()
          );
          if (matchByText) {
            value = matchByText.value;
          } else {
            console.warn(`[LazyFill] Option "${value}" not found in <select>`);
            return false;
          }
        }
        if (nativeSelectValueSetter) {
          nativeSelectValueSetter.call(el, value);
        } else {
          el.value = value;
        }
      } else if (tag === 'textarea') {
        if (nativeTextAreaValueSetter) {
          nativeTextAreaValueSetter.call(el, value);
        } else {
          el.value = value;
        }
      } else if (tag === 'contenteditable' || el.isContentEditable) {
        el.innerText = value;
        // Also try to set value just in case it's a hybrid
        try { el.value = value; } catch(_) {}
      } else {
        // input
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'checkbox' || type === 'radio') {
          el.checked = value === 'true' || value === '1' || value === 'yes';
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, value);
        } else {
          el.value = value;
        }
      }

      // Dispatch events
      dispatchKeyboardEvents(el, value);

      // Visual feedback — brief highlight
      addFillAnimation(el);

      return true;
    } catch (err) {
      console.error('[LazyFill] Failed to set value:', err);
      return false;
    }
  }

  /* --------------------------------------------------
   *  VISUAL FEEDBACK
   * -------------------------------------------------- */

  function addFillAnimation(el) {
    el.style.transition = 'box-shadow 0.3s ease, background-color 0.3s ease';
    el.style.boxShadow = '0 0 0 2px #6C63FF, 0 0 12px rgba(108, 99, 255, 0.3)';
    el.style.backgroundColor = 'rgba(108, 99, 255, 0.05)';

    setTimeout(() => {
      el.style.boxShadow = '';
      el.style.backgroundColor = '';
      setTimeout(() => {
        el.style.transition = '';
      }, 300);
    }, 1500);
  }

  /* --------------------------------------------------
   *  ELEMENT RESOLVER — find element by scan metadata
   * -------------------------------------------------- */

  /**
   * Find the actual DOM element from scan metadata.
   * @param {Object} fieldMeta — { id, name, tagName, type, index, frameSelector }
   * @param {Array}  allFields — re-scanned fields for index-based lookup
   * @returns {HTMLElement|null}
   */
  function resolveElement(fieldMeta, allFields) {
    if (window.__lazyFillScanner && window.__lazyFillScanner.resolveElement) {
      return window.__lazyFillScanner.resolveElement(fieldMeta, allFields);
    }
    // Minimal fallback if scanner is missing (unlikely)
    return document.getElementById(fieldMeta.id) || document.querySelector(`[name="${CSS.escape(fieldMeta.name)}"]`);
  }

  /* --------------------------------------------------
   *  BATCH FILL — applies all AI mappings
   * -------------------------------------------------- */

  /**
   * Fill multiple fields from AI-generated mappings.
   * @param {Array} mappings    — [{ index, value }]
   * @param {Array} scannedFields — original scan data
   * @returns {{ filled: number, failed: number }}
   */
  function batchFill(mappings, scannedFields) {
    let filled = 0;
    let failed = 0;

    mappings.forEach((mapping) => {
      const fieldMeta = scannedFields[mapping.index];
      if (!fieldMeta) {
        failed++;
        return;
      }

      const el = resolveElement({ ...fieldMeta, index: mapping.index }, scannedFields);
      if (!el) {
        console.warn(`[LazyFill] Could not find element for index ${mapping.index}`);
        failed++;
        return;
      }

      const success = setFieldValue(el, mapping.value);
      if (success) filled++;
      else failed++;
    });

    return { filled, failed };
  }

  /* --------------------------------------------------
   *  MESSAGE LISTENER
   * -------------------------------------------------- */



  /* --------------------------------------------------
   *  EXPOSE FOR OTHER CONTENT SCRIPTS
   * -------------------------------------------------- */

  window.__lazyFillInjector = {
    setFieldValue,
    resolveElement,
    batchFill,
    dispatchKeyboardEvents,
  };
})();
