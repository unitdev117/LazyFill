/**
 * ============================================================
 *  FIELD SEMANTICS — single source of "what does this field mean?"
 * ============================================================
 *  One normalized category table used by BOTH:
 *    - the local matcher (to match a form field to a profile key), and
 *    - the background's post-AI validation (to reject mismatched fills).
 *
 *  Previously these two layers each had their own field-name → meaning
 *  rules (regex intents vs. alias lists) that could disagree. Sharing one
 *  table makes matching and validation agree by construction.
 *
 *  Pure module (no `chrome`, no app state) — unit-testable. Categories are
 *  generic field semantics, not user data; the values filled always come
 *  from the user's profile.
 * ============================================================
 */

// Order matters: more specific categories before the generic "name".
const INTENT_RULES = [
  { intent: 'email', pattern: /\b(e ?mail|email)\b/ },
  { intent: 'phone', pattern: /\b(phone|mobile|cell|telephone|tel|contact number)\b/ },
  { intent: 'city', pattern: /\b(city|town|locality)\b/ },
  { intent: 'state', pattern: /\b(state|province|region|county)\b/ },
  { intent: 'zip', pattern: /\b(zip|postal|postcode|pincode)\b/ },
  { intent: 'country', pattern: /\b(country|nationality)\b/ },
  { intent: 'address', pattern: /\b(address|street|address line)\b/ },
  { intent: 'first_name', pattern: /\b(first name|given name|forename|fname)\b/ },
  { intent: 'last_name', pattern: /\b(last name|surname|family name|lname)\b/ },
  { intent: 'full_name', pattern: /\b(full name|name)\b/ },
];

function normalizeIntentText(value) {
  return (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

/** Classify a free-text hint into a normalized category, or null. */
export function detectIntent(text) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;
  const match = INTENT_RULES.find((rule) => rule.pattern.test(normalized));
  return match ? match.intent : null;
}

/** Infer the category of a scanned form field from all of its text hints. */
export function inferFieldIntent(field) {
  if (!field) return null;
  return detectIntent([
    field.label,
    field.placeholder,
    field.ariaLabel,
    field.autocomplete,
    field.name,
    field.id,
  ].join(' '));
}

/** Infer the category of a user's profile key (e.g. "First Name" -> first_name). */
export function inferProfileKeyIntent(key) {
  return detectIntent(key);
}
