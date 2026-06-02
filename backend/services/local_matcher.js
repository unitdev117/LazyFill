/**
 * ============================================================
 *  LOCAL MATCHER — Deterministic Skip-AI Optimization
 * ============================================================
 *  Matches "obvious" fields against the user profile using
 *  standard attribute patterns (id, name, autocomplete).
 *  Reduces AI token usage and significantly improves speed.
 * ============================================================
 */

// Shared, unit-tested classifiers (live in the extension's shared dir;
// local_matcher is extension-only code, not used by the Node server).
import { isFillableFieldMeta } from '../../frontend/src/shared/field-classification.js';
import { inferFieldIntent, inferProfileKeyIntent } from '../../frontend/src/shared/field-semantics.js';

const LocalMatcher = {
  _normalizeAttribute(value) {
    return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  },

  /**
   * Calculates similarity between two strings (Sørensen–Dice coefficient)
   * Returns value between 0 and 1.
   */
  calculateSimilarity(str1, str2) {
    const s1 = this._normalizeAttribute(str1);
    const s2 = this._normalizeAttribute(str2);
    
    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1.0 : 0.0;

    const getBigrams = (s) => {
      const bigrams = new Set();
      for (let i = 0; i < s.length - 1; i++) {
        bigrams.add(s.substring(i, i + 2));
      }
      return bigrams;
    };

    const bigrams1 = getBigrams(s1);
    const bigrams2 = getBigrams(s2);
    let intersect = 0;

    for (const b of bigrams1) {
      if (bigrams2.has(b)) intersect++;
    }

    return (2.0 * intersect) / (bigrams1.size + bigrams2.size);
  },

  _isPureTextField(field) {
    return isFillableFieldMeta(field);
  },

  /**
   * Attempts to match fields deterministicly based on the user's actual profile keys.
   * @param {Array} fields — Current list of scanned fields
   * @param {Object} profileFields — User's active profile data { "First Name": "John", ... }
   * @returns {Object} — { localMappings: Array, remainingFields: Array }
   */
  findMatches(fields, profileFields) {
    const localMappings = [];
    const remainingFields = [];
    
    // Pre-calculate normalized labels from the profile to speed up matching
    const profileKeys = Object.keys(profileFields).map(key => ({
      original: key,
      normalized: key.toLowerCase().replace(/[^a-z0-9]/g, '')
    }));

    fields.forEach((field) => {
      if (!this._isPureTextField(field)) {
        return;
      }

      let matchedKey = null;
      const isLongFormText = field.tagName === 'textarea' || field.tagName === 'contenteditable';

      // Favor user-visible cues for long-form fields so hidden IDs/names cannot override a clear label.
      const visibleAttributes = [
        field.label || '',
        field.placeholder || '',
        field.ariaLabel || '',
      ]
        .map((s) => this._normalizeAttribute(s))
        .filter(Boolean);

      const machineAttributes = [
        field.id || '',
        field.name || '',
        field.autocomplete || ''
      ]
        .map((s) => this._normalizeAttribute(s))
        .filter(Boolean);

      const attributes = isLongFormText
        ? visibleAttributes
        : [...visibleAttributes, ...machineAttributes];

      // 2. Try to match any of the profile's keys against the field's attributes
      for (const key of profileKeys) {
        if (!key.normalized) continue;

        // Keep long-form fields conservative: only exact visible-label matches should resolve locally.
        const isMatch = attributes.some(attr => {
          if (attr === key.normalized) return true;

          if (isLongFormText) return false;
          
          const score = this.calculateSimilarity(key.normalized, attr);
          
          // Minimum threshold for local matching (high confidence only)
          // We also ensure the attribute isn't just a tiny substring of a long key
          return score > 0.8 && (attr.length / key.normalized.length) > 0.4;
        });

        if (isMatch) {
          matchedKey = key.original;
          break;
        }
      }

      // 3. Fallback: semantic-category match (same category table the background
      //    uses to validate AI mappings, so matching and validation agree).
      if (!matchedKey) {
        matchedKey = this._matchByIntent(field, profileKeys, profileFields);
      }

      if (matchedKey) {
        localMappings.push({
          index: field.index,
          profileKey: matchedKey,
          value: profileFields[matchedKey]
        });
      } else {
        remainingFields.push(field);
      }
    });

    return { localMappings, remainingFields };
  },

  /**
   * Semantic-category fallback: classify the field's intent and match it to a
   * profile key of the same category (that actually has a value). Uses the
   * shared semantics table, so a field matched here will also pass the
   * background's intent validation — no "matched locally, rejected later".
   * @param {Object} field
   * @param {Array<{original:string, normalized:string}>} profileKeys
   * @param {Object} profileFields
   * @returns {string|null} the matching profile key, or null
   */
  _matchByIntent(field, profileKeys, profileFields) {
    const fieldIntent = inferFieldIntent(field);
    if (!fieldIntent) return null;

    const match = profileKeys.find(
      (key) => profileFields[key.original] && inferProfileKeyIntent(key.original) === fieldIntent
    );
    return match ? match.original : null;
  }
};

export default LocalMatcher;
