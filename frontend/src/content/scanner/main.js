/**
 * ============================================================
 *  SCANNER — Content Script: DOM Form Field Scanner
 * ============================================================
 *  Scans the current page for true text-entry form elements only.
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
  console.log('[LazyFill] Scanner module initializing...');

  console.log('[LazyFill] Scanner module initializing...');

  window.__lazyFillScannerLoaded = true;

  /* --------------------------------------------------
   *  FIELD EXTRACTION
   * -------------------------------------------------- */

  const TEXT_ENTRY_SELECTOR = [
    'input:not([type])',
    'input[type="text" i]',
    'input[type="search" i]',
    'input[type="email" i]',
    'input[type="url" i]',
    'input[type="tel" i]',
    'input[type="password" i]',
    'textarea',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[role="textbox"]',
  ].join(', ');

  const TEXT_ENTRY_INPUT_TYPES = new Set([
    '',
    'text',
    'search',
    'email',
    'url',
    'tel',
    'password',
  ]);

  const DISALLOWED_TAGS = new Set(['select', 'option', 'optgroup', 'datalist']);
  const DISALLOWED_ROLES = new Set([
    'combobox',
    'listbox',
    'option',
    'menu',
    'menuitem',
    'tree',
    'treeitem',
    'grid',
    'button',
    'checkbox',
    'radio',
    'switch',
    'tab',
    'slider',
    'spinbutton',
  ]);
  const CHOICE_PLACEHOLDER_PATTERN = /^(select|choose)\b/i;
  const CHOICE_WIDGET_CLASS_PATTERN = /\b(dropdown|picker|autocomplete|combo-?box|select-?input|select-?module)\b/i;

  const EXCLUDED_INPUT_TYPES = new Set([
    'hidden',
    'submit',
    'button',
    'reset',
    'image',
    'file',
  ]);

  function getRole(el) {
    return (el.getAttribute('role') || '').trim().toLowerCase();
  }

  function getExplicitContentEditableValue(el) {
    const value = el.getAttribute('contenteditable');
    return value == null ? null : value.trim().toLowerCase();
  }

  function hasAllowedContentEditableValue(el) {
    const value = getExplicitContentEditableValue(el);
    return value === '' || value === 'true' || value === 'plaintext-only';
  }

  function hasMeaningfulAriaAttribute(el, attrName) {
    const value = el.getAttribute(attrName);
    if (value == null) return false;

    const normalized = value.trim().toLowerCase();
    return normalized !== '' && normalized !== 'false' && normalized !== 'none';
  }

  function hasChoiceWidgetContainer(el) {
    let current = el;
    for (let depth = 0; current && depth < 5; depth++) {
      const className = typeof current.className === 'string' ? current.className : '';
      const identifier = `${current.id || ''} ${className}`;
      if (CHOICE_WIDGET_CLASS_PATTERN.test(identifier)) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  function isTextEntryPrimitive(el) {
    const tagName = el.tagName.toLowerCase();
    const role = getRole(el);

    if (DISALLOWED_TAGS.has(tagName) || DISALLOWED_ROLES.has(role)) {
      return false;
    }

    if (tagName === 'textarea') {
      return true;
    }

    if (tagName === 'input') {
      const type = (el.getAttribute('type') || '').trim().toLowerCase();
      return !EXCLUDED_INPUT_TYPES.has(type) && TEXT_ENTRY_INPUT_TYPES.has(type);
    }

    if (role && role !== 'textbox') {
      return false;
    }

    if (!el.isContentEditable && !hasAllowedContentEditableValue(el)) {
      return false;
    }

    return hasAllowedContentEditableValue(el) || el.isContentEditable;
  }

  function hasChoiceWidgetSignals(el) {
    const tagName = el.tagName.toLowerCase();
    const role = getRole(el);
    const placeholder = (el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '').trim();
    const isPrimitiveInput = tagName === 'input' || tagName === 'textarea';
    const relationSignals = ['aria-controls', 'aria-owns', 'aria-activedescendant']
      .some((attr) => hasMeaningfulAriaAttribute(el, attr));
    const stateSignals = ['aria-expanded', 'aria-autocomplete']
      .some((attr) => hasMeaningfulAriaAttribute(el, attr));

    if (DISALLOWED_TAGS.has(tagName) || DISALLOWED_ROLES.has(role)) {
      return true;
    }

    if (tagName === 'input' && el.hasAttribute('list')) {
      return true;
    }

    if (placeholder && CHOICE_PLACEHOLDER_PATTERN.test(placeholder)) {
      return true;
    }

    if (hasChoiceWidgetContainer(el)) {
      return true;
    }

    if (hasMeaningfulAriaAttribute(el, 'aria-haspopup')) {
      return true;
    }

    if (!isPrimitiveInput && (relationSignals || stateSignals)) {
      return true;
    }

    if (relationSignals && stateSignals) {
      return true;
    }

    return false;
  }

  function isPureTextField(el) {
    if (!isTextEntryPrimitive(el) || hasChoiceWidgetSignals(el)) {
      return false;
    }

    if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') {
      return false;
    }

    if (el.inert || el.closest('[inert]')) {
      return false;
    }

    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    return true;
  }

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
      surroundingText: surroundingText ? surroundingText.substring(0, 100) : ''
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
    let type = (el.getAttribute('type') || '').toLowerCase();
    const role = getRole(el);

    if (!isPureTextField(el)) return null;

    if (tagName === 'input' && !TEXT_ENTRY_INPUT_TYPES.has(type)) return null;

    // Treat eligible custom contenteditable textboxes as synthetic contenteditable fields
    if (tagName !== 'input' && tagName !== 'textarea') {
      type = tagName = 'contenteditable';
    }

    const domContext = getStructuralContext(el);

    const field = {
      tagName,
      type: type || (tagName === 'textarea' ? 'textarea' : 'text'),
      id: el.id || '',
      name: el.getAttribute('name') || el.id || '',
      placeholder: el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '',
      label: findLabel(el),
      ariaLabel: el.getAttribute('aria-label') || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      role,
      hasListAttribute: el.hasAttribute('list'),
      currentValue: el.value || el.innerText || '',
      frameSelector,
      domPath: domContext.path,
      surroundingText: domContext.surroundingText
    };

    return field;
  }

  /**
   * Attempt to find the <label> text for an element.
   * Uses 9 strategies to cover standard HTML, Google Forms,
   * Eightfold AI, Workday, Greenhouse, and other enterprise platforms.
   */
  function findLabel(el) {
    const doc = el.ownerDocument || document;

    const GENERIC_LABELS = new Set([
      'your answer',
      'enter text',
      'type here',
      'placeholder',
      'answer',
      'input',
      'your name', /* sometimes used as generic placeholder */
    ]);

    // 1. Google Forms support (High Priority)
    // Google Forms question titles are typically in .M7eMe elements or have role="heading"
    // They are siblings or cousins of the input's container.
    const gFormContainer = el.closest('.geS5n') || el.closest('[role="listitem"]') || el.closest('.M7eMe')?.parentElement;
    if (gFormContainer) {
      const gTitle = gFormContainer.querySelector('.M7eMe') || 
                     gFormContainer.querySelector('[role="heading"]') ||
                     gFormContainer.querySelector('.Ho8CH');
      if (gTitle) {
        const text = gTitle.textContent.trim();
        if (text && !GENERIC_LABELS.has(text.toLowerCase())) return text;
      }
    }

    // 2. aria-labelledby (can reference multiple IDs)
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/);
      let combinedLabel = '';
      for (const id of ids) {
        if (!id) continue;
        const labelEl = doc.getElementById(id);
        if (labelEl) {
          const text = labelEl.textContent.trim();
          if (text && !GENERIC_LABELS.has(text.toLowerCase())) {
            combinedLabel += text + ' ';
          }
        }
      }
      if (combinedLabel.trim()) return combinedLabel.trim();
    }

    // 3. Standard: <label for="id">
    if (el.id) {
      const label = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) {
        const text = label.textContent.trim();
        if (text && !GENERIC_LABELS.has(text.toLowerCase())) return text;
      }
    }

    // 4. Enterprise pattern: label with id = inputId + "_label" (Eightfold AI, Workday)
    if (el.id) {
      const suffixLabel = doc.getElementById(el.id + '_label');
      if (suffixLabel) {
        const text = suffixLabel.textContent.trim();
        if (text && !GENERIC_LABELS.has(text.toLowerCase())) return text;
      }
    }

    // 5. aria-label attribute directly on the element
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      const text = ariaLabel.trim();
      if (!GENERIC_LABELS.has(text.toLowerCase())) return text;
    }

    // 6. Parent <label> wrapping the input
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      const childInput = clone.querySelector(TEXT_ENTRY_SELECTOR);
      if (childInput) childInput.remove();
      const text = clone.textContent.trim();
      if (text && !GENERIC_LABELS.has(text.toLowerCase())) return text;
    }

    // 7. Fieldset > legend (phone groups, address groups)
    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) {
        const text = legend.textContent.trim();
        if (text && !GENERIC_LABELS.has(text.toLowerCase())) return text;
      }
    }

    // 8. Previous sibling: label, span, p, div, h-tags
    const prev = el.previousElementSibling;
    if (prev) {
      const tag = prev.tagName;
      if (tag === 'LABEL' || tag === 'SPAN' || tag === 'P' || tag === 'DIV' || tag === 'H3' || tag === 'H4') {
        const text = prev.textContent.trim();
        if (text && text.length < 200 && !GENERIC_LABELS.has(text.toLowerCase())) return text;
      }
    }

    // 9. Walk up to nearest container and find the first label/span/legend text
    let parent = el.parentElement;
    for (let depth = 0; parent && depth < 5; depth++) {
      // Check for a label sibling of the input's parent
      const label = parent.querySelector(':scope > label, :scope > span.label, :scope > legend');
      if (label && !label.querySelector(TEXT_ENTRY_SELECTOR)) {
        const text = label.textContent.trim();
        if (text && text.length < 200 && !GENERIC_LABELS.has(text.toLowerCase())) return text;
      }
      parent = parent.parentElement;
    }

    // 10. Fallback: use placeholder or name as the label hint
    const placeholder = el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '';
    if (placeholder && !GENERIC_LABELS.has(placeholder.toLowerCase()) && placeholder !== 'Select') return placeholder;

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
    const elements = root.querySelectorAll(TEXT_ENTRY_SELECTOR);
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

  function matchesResolvedField(el, fieldMeta) {
    if (!el || !isPureTextField(el)) return false;

    if (fieldMeta.tagName === 'contenteditable') {
      return el.isContentEditable || getRole(el) === 'textbox';
    }

    return el.tagName.toLowerCase() === fieldMeta.tagName;
  }

  /* --------------------------------------------------
   *  MESSAGE LISTENER — Backend triggers scan
   * -------------------------------------------------- */

  /* --------------------------------------------------
   *  CENTRAL MESSAGE LISTENER
   * -------------------------------------------------- */
  
  function handleMessage(message, sender, sendResponse) {
    const { action, payload } = message;

    // 1. Scanner Actions
    if (action === 'SCAN_PAGE') {
      try {
        const fields = performScan();
        sendResponse({ success: true, scannedFields: fields, count: fields.length });
      } catch (err) {
        sendResponse({ success: false, error: { message: err.message } });
      }
      return true;
    }

    if (action === 'GET_FIELD_COUNT') {
      try {
        const fields = performScan();
        sendResponse({ success: true, count: fields.length });
      } catch (err) {
        sendResponse({ success: false, count: 0 });
      }
      return true;
    }

    // 2. Ghost Text Actions (delegated to window.__lazyFillGhostText)
    if (window.__lazyFillGhostText) {
      if (action === 'SHOW_GHOST_TEXT') {
        window.__lazyFillGhostText.showGhostBatch(payload.mappings, payload.scannedFields);
        sendResponse({ success: true });
        return true;
      }
      if (action === 'CLEAR_GHOST_TEXT') {
        window.__lazyFillGhostText.clearAllGhosts();
        sendResponse({ success: true });
        return true;
      }
      if (action === 'GET_GHOST_COUNT') {
        sendResponse({ success: true, count: window.__lazyFillGhostText.getGhostCount() });
        return true;
      }
      if (action === 'COMMIT_ALL_GHOSTS') {
        const count = window.__lazyFillGhostText.commitAllVisible();
        sendResponse({ success: true, committed: count });
        return true;
      }
      if (action === 'COMMIT_ALL_MAPPINGS') {
        window.__lazyFillGhostText.commitAllMappings(sendResponse);
        return true;
      }
    }

    // 3. Injector Actions
    if (action === 'FILL_FIELDS') {
      if (window.__lazyFillInjector) {
         const res = window.__lazyFillInjector.batchFill(payload.mappings, payload.scannedFields);
         sendResponse({ success: true, filled: res.filled });
      } else {
         sendResponse({ success: false, error: 'Injector not ready' });
      }
      return true;
    }
  }

  chrome.runtime.onMessage.addListener(handleMessage);

  /**
   * Robustly find a DOM element based on its scan-time metadata.
   * Handles ID changes, SPA navigation, and dynamic Google Forms structures.
   */
  function resolveElement(fieldMeta, allFields = []) {
    let root = document;

    // 1. Handle Frame Context
    if (fieldMeta.frameSelector) {
      try {
        const iframe = document.querySelector(fieldMeta.frameSelector);
        if (iframe?.contentDocument) {
          root = iframe.contentDocument;
        }
      } catch (_) {}
    }

    // 2. Try by ID (Best)
    if (fieldMeta.id) {
      const el = root.getElementById(fieldMeta.id);
      if (matchesResolvedField(el, fieldMeta)) return el;
    }

    // 3. Try by Name (Standard)
    if (fieldMeta.name) {
      if (fieldMeta.tagName === 'contenteditable') {
        const candidates = root.querySelectorAll(`[name="${CSS.escape(fieldMeta.name)}"]`);
        const el = Array.from(candidates).find((candidate) => matchesResolvedField(candidate, fieldMeta));
        if (el) return el;
      } else {
        const el = root.querySelector(`${fieldMeta.tagName}[name="${CSS.escape(fieldMeta.name)}"]`);
        if (matchesResolvedField(el, fieldMeta)) return el;
      }
    }

    // 4. Try by Aria-Label, Placeholder, or Label Text (Google Forms / enterprise support)
    if (fieldMeta.ariaLabel || fieldMeta.placeholder || fieldMeta.label) {
      const searchTerms = [
        fieldMeta.ariaLabel ? `[aria-label="${CSS.escape(fieldMeta.ariaLabel)}"]` : null,
        fieldMeta.placeholder ? `[placeholder="${CSS.escape(fieldMeta.placeholder)}"]` : null,
        fieldMeta.label ? `[aria-label="${CSS.escape(fieldMeta.label)}"]` : null
      ].filter(Boolean).join(',');

      let el = null;
      if (searchTerms) {
        const candidates = root.querySelectorAll(searchTerms);
        el = Array.from(candidates).find((candidate) => matchesResolvedField(candidate, fieldMeta));
      }
      if (el) return el;

      // 4b. Deep search for aria-labelledby matches
      if (fieldMeta.label) {
        const allTextInputs = root.querySelectorAll(TEXT_ENTRY_SELECTOR);
        for (const input of allTextInputs) {
          if (!matchesResolvedField(input, fieldMeta)) continue;
          
          const labelledBy = input.getAttribute('aria-labelledby');
          if (labelledBy) {
            const labelTexts = labelledBy.split(/\s+/)
              .map(id => root.getElementById(id)?.textContent?.trim())
              .filter(Boolean);
            
            if (labelTexts.some(t => t.includes(fieldMeta.label) || fieldMeta.label.includes(t))) {
              return input;
            }
          }
        }
      }
    }

    // 5. Positional / Index Fallback (Last resort)
    if (typeof fieldMeta.index === 'number') {
      const allEls = root.querySelectorAll(TEXT_ENTRY_SELECTOR);
      const filtered = Array.from(allEls).filter((el) => isPureTextField(el));
      if (filtered[fieldMeta.index]) return filtered[fieldMeta.index];
    }

    return null;
  }

  /* --------------------------------------------------
   *  EXPOSE FOR OTHER CONTENT SCRIPTS
   * -------------------------------------------------- */

  window.__lazyFillScanner = { performScan, resolveElement };
})();
