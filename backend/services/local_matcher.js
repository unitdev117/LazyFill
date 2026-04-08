/**
 * ============================================================
 *  LOCAL MATCHER — Deterministic Skip-AI Optimization
 * ============================================================
 *  Matches "obvious" fields against the user profile using
 *  standard attribute patterns (id, name, autocomplete).
 *  Reduces AI token usage and significantly improves speed.
 * ============================================================
 */

const MATCH_RULES = [
  { key: 'Email', patterns: [/email/i, /mail/i] },
  { key: 'First Name', patterns: [/fname/i, /first.*name/i, /given.*name/i] },
  { key: 'Last Name', patterns: [/lname/i, /last.*name/i, /family.*name/i, /surname/i] },
  { key: 'Full Name', patterns: [/^name$/i, /fullname/i, /complete.*name/i] },
  { key: 'Phone', patterns: [/phone/i, /tel/i, /mobile/i, /contact/i] },
  { key: 'Zip Code', patterns: [/zip/i, /postal/i, /pincode/i] },
  { key: 'City', patterns: [/city/i, /town/i, /location/i] },
  { key: 'State', patterns: [/state/i, /province/i, /region/i] },
  { key: 'Address', patterns: [/address/i, /street/i, /line1/i] }
];

const LocalMatcher = {
  /**
   * Attempts to match fields deterministicly.
   * @param {Array} fields — Current list of fields
   * @param {Object} profile — User's active profile data
   * @returns {Object} — { localMappings: Array, remainingFields: Array }
   */
  findMatches(fields, profile) {
    const localMappings = [];
    const remainingFields = [];

    fields.forEach((field) => {
      let matchedKey = null;

      // Extract attributes to check
      const attributes = [
        field.id || '',
        field.name || '',
        field.label || '',
        field.placeholder || '',
        field.autocomplete || ''
      ].map(s => s.toLowerCase());

      // Check against rules
      for (const rule of MATCH_RULES) {
        if (rule.patterns.some(p => attributes.some(attr => p.test(attr)))) {
          // Verify the key exists in the user's profile
          if (profile[rule.key]) {
            matchedKey = rule.key;
            break;
          }
        }
      }

      if (matchedKey) {
        localMappings.push({
          index: field.index,
          value: profile[matchedKey]
        });
      } else {
        remainingFields.push(field);
      }
    });

    return { localMappings, remainingFields };
  }
};

export default LocalMatcher;
