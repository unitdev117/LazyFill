/**
 * ============================================================
 *  DOMAIN HELPERS — pure, dependency-free
 * ============================================================
 *  Hostname normalization, whole-domain matching, and parsing
 *  of free-text/URL input into a clean host. Used by the popup's
 *  "Disabled" section. No `chrome`, no DOM — trivially testable.
 *
 *  Note: the content bundle has its own copy of normalizeHost /
 *  hostCoveredBy in content/shared/guards.js. They are kept
 *  separate on purpose because the content script is a classic
 *  (non-module) bundle and cannot share a module with the popup
 *  without rollup emitting a shared chunk. Both copies are tested.
 * ============================================================
 */

/** Lowercase, strip a leading "www." and any trailing dot. */
export function normalizeHost(host) {
  return (host || '').toString().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/**
 * Whole-domain match: `current` is covered by `entry` when it is the same
 * host OR a subdomain of it (so an entry disables every path and subdomain).
 */
export function hostCoveredBy(currentHost, entryHost) {
  const c = normalizeHost(currentHost);
  const d = normalizeHost(entryHost);
  if (!c || !d) return false;
  return c === d || c.endsWith('.' + d);
}

/**
 * Parse free-text or a pasted URL into a clean, validated hostname.
 * Returns the normalized host, or null when the input is not a plausible
 * domain. The user decides the scope — we only sanitize what they typed.
 *
 *  "https://Jobs.Example.com/apply?x=1" -> "jobs.example.com"
 *  "www.example.co.uk"                  -> "example.co.uk"
 *  "Example.COM"                        -> "example.com"
 *  "not a domain" / "localhost"         -> null
 */
export function parseDomainInput(raw) {
  if (raw == null) return null;
  let s = raw.toString().trim().toLowerCase();
  if (!s) return null;

  // Pull the host out of a full URL; otherwise drop any path/query/fragment.
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) {
    try {
      s = new URL(s).hostname;
    } catch {
      return null;
    }
  } else {
    s = s.split(/[/?#]/)[0];
  }

  s = s.replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');

  const labels = s.split('.');
  if (labels.length < 2) return null; // require a dotted domain (rejects "localhost")

  const labelOk = (l) => /^[a-z0-9-]+$/.test(l) && !l.startsWith('-') && !l.endsWith('-');
  if (!labels.every(labelOk)) return null;

  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) return null; // TLD must be alphabetic, 2+ chars

  return s;
}
