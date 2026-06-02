/**
 * ============================================================
 *  SENSITIVE DATA — curated, tested security data set
 * ============================================================
 *  The host and field identifiers LazyFill must stay away from
 *  (banking / payment / government sites; credential / payment /
 *  identity fields). These are an explicitly-maintained, unit-
 *  tested security list — NOT user data. The user-driven controls
 *  are the session master switch and the disabled-list; this list
 *  is a baseline safety net beneath them.
 *
 *  Pure module (no `chrome`, no DOM) so it is trivially testable.
 *  Update deliberately and keep sensitive-data.test.js in sync.
 * ============================================================
 */

/* ---- SENSITIVE HOSTS ---- */

// Strong brand/keyword fragments — matched as a substring of the host.
// A rare false positive only means "autofill is disabled here" (safe
// direction), so a broad list is acceptable.
export const SENSITIVE_HOST_SUBSTRINGS = [
  'bank', 'banking', 'creditunion', 'paypal', 'venmo', 'wellsfargo',
  'americanexpress', 'capitalone', 'coinbase', 'binance', 'robinhood',
  'fidelity', 'vanguard', 'schwab', 'etrade', 'interactivebrokers',
  'incometax', 'aadhaar', 'phonepe', 'paytm',
];

// Short / ambiguous identifiers — matched only as a whole host label
// (split on "." and "-") to avoid accidental substring collisions.
export const SENSITIVE_HOST_LABELS = new Set([
  'chase', 'citi', 'citibank', 'hsbc', 'barclays', 'santander', 'lloyds',
  'natwest', 'amex', 'discover', 'usbank', 'pnc', 'tdbank', 'ally', 'sofi',
  'monzo', 'revolut', 'wise', 'kraken', 'gemini', 'stripe', 'zelle',
  'irs', 'ssa', 'hmrc', 'uidai', 'npci', 'sbi', 'icici', 'hdfc', 'axisbank',
  'kotak',
]);

/** Is `host` a banking / payment / government ("secure") site? */
export function isSensitiveHost(host) {
  const raw = (host || '').toString().toLowerCase();
  if (!raw) return false;

  const h = raw.replace(/^www\./, '');

  // 1. Government / dedicated-secure TLDs and suffixes.
  if (
    h.endsWith('.bank') ||
    h.endsWith('.gov') ||
    h.endsWith('.mil') ||
    h.includes('.gov.') ||
    h.includes('.gouv.')
  ) {
    return true;
  }

  // 2. Strong brand substrings.
  if (SENSITIVE_HOST_SUBSTRINGS.some((kw) => h.includes(kw))) return true;

  // 3. Whole-label identifiers (split on "." and "-").
  return h.split(/[.-]/).filter(Boolean).some((label) => SENSITIVE_HOST_LABELS.has(label));
}

/* ---- SENSITIVE FIELDS ---- */

// `autocomplete` tokens that flag credential / payment fields.
export const SENSITIVE_AUTOCOMPLETE = new Set([
  'current-password', 'new-password', 'one-time-code',
  'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year',
  'cc-name', 'cc-given-name', 'cc-family-name', 'cc-additional-name', 'cc-type',
]);

// Matched against the alphanumeric-collapsed concatenation of a field's
// identifying text (name/id/label/placeholder/aria-label). Fragments are
// chosen to avoid colliding with benign fields (e.g. bare "pin" is excluded
// because "shipping" collapses to contain "pin").
export const SENSITIVE_TEXT_FRAGMENTS = [
  'password', 'passwd', 'pwd', 'otp', 'onetime', 'twofa', '2fa', 'mfa',
  'verificationcode', 'securitycode', 'cvv', 'cvc', 'cardnumber', 'ccnumber',
  'cardno', 'creditcard', 'debitcard', 'cardexpir', 'expirydate',
  'expirationdate', 'ssn', 'socialsecurity', 'routingnumber', 'accountnumber',
  'iban', 'sortcode', 'passport', 'pannumber', 'taxid',
];

function collapse(value) {
  return (value || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Decide whether a scanned/described field is sensitive and must never be
 * read or filled.
 * @param {{name?:string,id?:string,label?:string,placeholder?:string,
 *          ariaLabel?:string,autocomplete?:string,type?:string}} hints
 */
export function isSensitiveField(hints) {
  if (!hints) return false;

  const type = (hints.type || '').toLowerCase();
  if (type === 'password') return true;

  const autocomplete = (hints.autocomplete || '').toLowerCase();
  if (autocomplete) {
    const tokens = autocomplete.split(/\s+/).filter(Boolean);
    if (tokens.some((t) => SENSITIVE_AUTOCOMPLETE.has(t))) return true;
  }

  const haystack = collapse(
    [hints.name, hints.id, hints.label, hints.placeholder, hints.ariaLabel].join(' ')
  );
  if (!haystack) return false;

  return SENSITIVE_TEXT_FRAGMENTS.some((frag) => haystack.includes(frag));
}
