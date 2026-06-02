/**
 * ============================================================
 *  FIELD CLASSIFICATION — single source of truth
 * ============================================================
 *  The rule constants, DOM predicate helpers, and the metadata
 *  classifier that decide whether an element/field is a plain
 *  text-entry field LazyFill may touch (vs. a select / combobox /
 *  date-picker / other choice widget).
 *
 *  Previously these constants + helpers were copy-pasted across
 *  scanner, injector and local_matcher; a security-relevant guard
 *  drifting between copies was a real risk. This module is pure
 *  (no `chrome`, no app state) so it is unit-testable and shared.
 *
 *  password / credential types are intentionally absent from the
 *  allowed input types — LazyFill never reads or fills them.
 * ============================================================
 */

export const TEXT_ENTRY_SELECTOR = [
  'input:not([type])',
  'input[type="text" i]',
  'input[type="search" i]',
  'input[type="email" i]',
  'input[type="url" i]',
  'input[type="tel" i]',
  'textarea',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
].join(', ');

export const ALLOWED_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel']);

// input types that are never text-entry (scanner-side exclusion).
export const EXCLUDED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'file', 'reset']);

export const DISALLOWED_TAGS = new Set(['select', 'option', 'optgroup', 'datalist']);

export const DISALLOWED_ROLES = new Set([
  'combobox', 'listbox', 'option', 'menu', 'menuitem', 'tree', 'treeitem',
  'grid', 'button', 'checkbox', 'radio', 'switch', 'tab', 'slider', 'spinbutton',
]);

export const CHOICE_PLACEHOLDER_PATTERN = /^(select|choose)\b/i;
export const CHOICE_WIDGET_CLASS_PATTERN =
  /\b(dropdown|picker|autocomplete|combo-?box|select-?input|select-?module)\b/i;

/* --------------------------------------------------
 *  DOM PREDICATE HELPERS (operate on live elements)
 * -------------------------------------------------- */

export function getRole(el) {
  return (el.getAttribute('role') || '').trim().toLowerCase();
}

export function getExplicitContentEditableValue(el) {
  const value = el.getAttribute('contenteditable');
  return value == null ? null : value.trim().toLowerCase();
}

export function hasAllowedContentEditableValue(el) {
  const value = getExplicitContentEditableValue(el);
  return value === '' || value === 'true' || value === 'plaintext-only';
}

export function hasMeaningfulAriaAttribute(el, attrName) {
  const value = el.getAttribute(attrName);
  if (value == null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== 'false' && normalized !== 'none';
}

export function hasChoiceWidgetContainer(el) {
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

/* --------------------------------------------------
 *  METADATA CLASSIFIER (operates on scanned field data)
 * --------------------------------------------------
 *  Shared by the injector (final fill sink) and the local
 *  matcher. Does NOT include sensitive-field exclusion — that
 *  is composed by callers (the injector adds it) so this stays
 *  a pure "is it a plain text field?" decision.
 */
export function isFillableFieldMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;

  const tagName = (meta.tagName || '').toLowerCase();
  const type = (meta.type || '').toLowerCase();
  const role = (meta.role || '').toLowerCase();
  const placeholder = (meta.placeholder || '').trim().toLowerCase();
  const domPath = (meta.domPath || '').toLowerCase();

  if (DISALLOWED_TAGS.has(tagName) || DISALLOWED_ROLES.has(role)) return false;
  if (meta.hasListAttribute) return false;
  if (CHOICE_PLACEHOLDER_PATTERN.test(placeholder)) return false;
  if (CHOICE_WIDGET_CLASS_PATTERN.test(domPath)) return false;

  if (tagName === 'input') return ALLOWED_INPUT_TYPES.has(type);
  return tagName === 'textarea' || tagName === 'contenteditable';
}
