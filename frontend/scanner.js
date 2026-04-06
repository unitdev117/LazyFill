/**
 * ============================================================
 *  SCANNER — Content Script: DOM Form Field Scanner
 * ============================================================
 *  Scans the current page for all fillable form elements:
 *    <input>, <textarea>, <select>
 *
 *  Recursively traverses:
 *    - Shadow DOM (#shadow-root)
 *    - Iframes (same-origin)
 *
 *  Packages lightweight JSON and sends to the Backend.
 * ============================================================
 */

(function () {
  'use strict';

  if (window.__lazyFillScannerLoaded) return;
  window.__lazyFillScannerLoaded = true;

  /* --------------------------------------------------
   *  FIELD EXTRACTION
   * -------------------------------------------------- */

  const FILLABLE_SELECTORS = 'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]';

  const EXCLUDED_INPUT_TYPES = new Set([
    'hidden',
    'submit',
    'button',
    'reset',
    'image',
    'file',
  ]);

  /**
   * Retrieves 12 layers of structural context and surrounding text for AI hints.
   * Walks up the DOM tree up to 12 levels deep.
   */
  function getStructuralContext(el) {
    let parent = el.parentElement || el.parentNode;
    let pathFingerprint = [];
    let surroundingText = '';
    
    for (let depth = 0; parent && depth < 12; depth++) {
      // Guard against ShadowRoots / Document Fragments which don't have a tagName
      if (!parent.tagName) {
        parent = parent.host || parent.parentElement || parent.parentNode;
        if (!parent) break;
      }
      
      if (parent.tagName === 'BODY' || parent.tagName === 'HTML') break;

      // Build Fingerprint
      let nodeStr = parent.tagName.toLowerCase();
      if (parent.id) nodeStr += '#' + parent.id;
      if (parent.className && typeof parent.className === 'string') {
        const classes = parent.className.split(/\s+/).filter(c => c).slice(0, 3).join('.');
        if (classes) nodeStr += '.' + classes;
      }
      pathFingerprint.push(nodeStr);
      
      // Attempt to gather focused contextual text (not the entire page)
      if (!surroundingText && depth >= 1 && depth <= 4) {
         let text = (parent.innerText || parent.textContent || '').replace(/\s+/g, ' ').trim();
         // Ensure the text isn't massive (which means we grabbed too high up the tree)
         if (text && text.length > 2 && text.length < 250) {
           surroundingText = text;
         }
      }
      
      parent = parent.parentElement || parent.parentNode;
    }
    
    return {
      path: pathFingerprint.reverse().join(' > '),
      surroundingText: surroundingText ? surroundingText.substring(0, 150) : ''
    };
  }

  /**
   * Extract metadata from a single form element.
   * @param {HTMLElement} el
   * @param {string}      [frameSelector]
   * @returns {Object|null}
   */
  function extractFieldData(el, frameSelector = '') {
    let tagName = el.tagName.toLowerCase();
    const isContentEditable = el.getAttribute('contenteditable') === 'true';
    const isAriaInput = el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'combobox';

    let type = (el.getAttribute('type') || '').toLowerCase();

    // Skip non-fillable inputs
    if (tagName === 'input' && EXCLUDED_INPUT_TYPES.has(type)) return null;

    // Treat contenteditable or aria-inputs as textareas if they aren't inputs
    if ((isContentEditable || isAriaInput) && tagName !== 'input' && tagName !== 'textarea' && tagName !== 'select') {
       type = tagName = 'contenteditable';
    }

    // Skip invisible / disabled elements
    if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return null;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null;

    const domContext = getStructuralContext(el);

    const field = {
      tagName,
      type: type || (tagName === 'textarea' ? 'textarea' : tagName === 'select' ? 'select' : 'text'),
      id: el.id || '',
      name: el.getAttribute('name') || el.id || '',
      placeholder: el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '',
      label: findLabel(el),
      ariaLabel: el.getAttribute('aria-label') || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      currentValue: el.value || el.innerText || '',
      frameSelector,
      domPath: domContext.path,
      surroundingText: domContext.surroundingText
    };

    // Collect <select> options or custom ARIA listboxes
    if (tagName === 'select') {
      field.options = Array.from(el.options).map((opt) => ({
        value: opt.value,
        text: opt.textContent.trim(),
      }));
    } else if (el.getAttribute('role') === 'combobox' && el.getAttribute('aria-owns')) {
      // Very basic attempt to grab aria-owned listbox options
      const listbox = el.ownerDocument.getElementById(el.getAttribute('aria-owns'));
      if (listbox) {
         field.options = Array.from(listbox.querySelectorAll('[role="option"]')).map((opt) => ({
           value: opt.getAttribute('data-value') || opt.textContent.trim(),
           text: opt.textContent.trim()
         }));
      }
    }

    return field;
  }

  /**
   * Attempt to find the <label> text for an element.
   * Uses 9 strategies to cover standard HTML, Google Forms,
   * Eightfold AI, Workday, Greenhouse, and other enterprise platforms.
   */
  function findLabel(el) {
    const doc = el.ownerDocument || document;

    // 1. Standard: <label for="id">
    if (el.id) {
      const label = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent.trim();
    }

    // 2. Enterprise pattern: label with id = inputId + "_label" (Eightfold AI, Workday)
    if (el.id) {
      const suffixLabel = doc.getElementById(el.id + '_label');
      if (suffixLabel) return suffixLabel.textContent.trim();
    }

    // 3. aria-label attribute directly on the element
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // 4. aria-labelledby (can reference multiple IDs)
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/);
      let combinedLabel = '';
      for (const id of ids) {
        if (!id) continue;
        const labelEl = doc.getElementById(id);
        if (labelEl) combinedLabel += labelEl.textContent.trim() + ' ';
      }
      if (combinedLabel.trim()) return combinedLabel.trim();
    }

    // 5. Parent <label> wrapping the input
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      const childInput = clone.querySelector(FILLABLE_SELECTORS);
      if (childInput) childInput.remove();
      const text = clone.textContent.trim();
      if (text) return text;
    }

    // 6. Fieldset > legend (phone groups, address groups)
    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) return legend.textContent.trim();
    }

    // 7. Google Forms support
    const gFormContainer = el.closest('.geS5n') || el.closest('[role="listitem"]');
    if (gFormContainer) {
      const gTitle = gFormContainer.querySelector('.M7eMe') || gFormContainer.querySelector('[role="heading"]');
      if (gTitle) return gTitle.textContent.trim();
    }

    // 8. Previous sibling: label, span, p, div, h-tags
    const prev = el.previousElementSibling;
    if (prev) {
      const tag = prev.tagName;
      if (tag === 'LABEL' || tag === 'SPAN' || tag === 'P' || tag === 'DIV' || tag === 'H3' || tag === 'H4') {
        const text = prev.textContent.trim();
        if (text && text.length < 200) return text;
      }
    }

    // 9. Walk up to nearest container and find the first label/span/legend text
    let parent = el.parentElement;
    for (let depth = 0; parent && depth < 5; depth++) {
      // Check for a label sibling of the input's parent
      const label = parent.querySelector(':scope > label, :scope > span.label, :scope > legend');
      if (label && !label.querySelector(FILLABLE_SELECTORS)) {
        const text = label.textContent.trim();
        if (text && text.length < 200) return text;
      }
      parent = parent.parentElement;
    }

    // 10. Fallback: use placeholder or name as the label hint
    const placeholder = el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '';
    if (placeholder && placeholder !== 'Your answer' && placeholder !== 'Select') return placeholder;

    return '';
  }

  /* --------------------------------------------------
   *  RECURSIVE DOM TRAVERSAL
   * -------------------------------------------------- */

  /**
   * Recursively scan a root node for form fields,
   * descending into Shadow DOMs and same-origin iframes.
   */
  function scanNode(root, fields = [], frameSelector = '') {
    // 1. Query fillable elements in this root
    const elements = root.querySelectorAll(FILLABLE_SELECTORS);
    elements.forEach((el) => {
      const data = extractFieldData(el, frameSelector);
      if (data) fields.push(data);
    });

    // 2. Traverse Shadow DOMs
    const allElements = root.querySelectorAll('*');
    allElements.forEach((el) => {
      if (el.shadowRoot) {
        scanNode(el.shadowRoot, fields, frameSelector);
      }
    });

    // 3. Traverse same-origin iframes
    const iframes = root.querySelectorAll('iframe');
    iframes.forEach((iframe, idx) => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const iframeSelector = frameSelector
            ? `${frameSelector} > iframe:nth-of-type(${idx + 1})`
            : `iframe:nth-of-type(${idx + 1})`;
          scanNode(iframeDoc, fields, iframeSelector);
        }
      } catch (_) {
        // Cross-origin iframe — skip silently
      }
    });

    return fields;
  }

  /* --------------------------------------------------
   *  MAIN SCAN FUNCTION
   * -------------------------------------------------- */

  function performScan() {
    const fields = scanNode(document);

    // Assign stable indices
    fields.forEach((f, i) => {
      f.index = i;
    });

    return fields;
  }

  /* --------------------------------------------------
   *  MESSAGE LISTENER — Backend triggers scan
   * -------------------------------------------------- */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'SCAN_PAGE') {
      try {
        const fields = performScan();
        sendResponse({ success: true, scannedFields: fields, count: fields.length });
      } catch (err) {
        sendResponse({ success: false, error: { message: err.message } });
      }
      return true;
    }

    if (message.action === 'GET_FIELD_COUNT') {
      try {
        const fields = performScan();
        sendResponse({ success: true, count: fields.length });
      } catch (err) {
        sendResponse({ success: false, count: 0 });
      }
      return true;
    }
  });

  /* --------------------------------------------------
   *  EXPOSE FOR OTHER CONTENT SCRIPTS
   * -------------------------------------------------- */

  window.__lazyFillScanner = { performScan };
})();
