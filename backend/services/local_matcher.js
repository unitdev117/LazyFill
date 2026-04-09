/**
 * ============================================================
 *  LOCAL MATCHER — Deterministic Skip-AI Optimization
 * ============================================================
 *  Matches "obvious" fields against the user profile using
 *  standard attribute patterns (id, name, autocomplete).
 *  Reduces AI token usage and significantly improves speed.
 * ============================================================
 */

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
    if (!field || typeof field !== 'object') return false;

    const tagName = (field.tagName || '').toLowerCase();
    const type = (field.type || '').toLowerCase();
    const role = (field.role || '').toLowerCase();
    const placeholder = (field.placeholder || '').trim().toLowerCase();
    const domPath = (field.domPath || '').toLowerCase();

    const allowedInputTypes = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password']);
    const disallowedTags = new Set(['select', 'option', 'optgroup', 'datalist']);
    const disallowedRoles = new Set([
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

    if (disallowedTags.has(tagName) || disallowedRoles.has(role)) {
      return false;
    }

    if (field.hasListAttribute) {
      return false;
    }

    if (/^(select|choose)\b/.test(placeholder)) {
      return false;
    }

    if (/\b(dropdown|picker|autocomplete|combo-?box|select-?input|select-?module)\b/.test(domPath)) {
      return false;
    }

    if (tagName === 'textarea' || tagName === 'contenteditable') {
      return true;
    }

    if (tagName === 'input') {
      return allowedInputTypes.has(type);
    }

    return false;
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

      // 3. Fallback: Common industrial aliases if the dynamic label is a standard one
      if (!matchedKey) {
        matchedKey = this._checkStandardAliases(attributes, profileFields);
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
   * Hardcoded fallbacks for very common web shorthand (e.g. 'fname' -> 'First Name')
   * only triggered if the profile has that standard key.
   */
  _checkStandardAliases(attributes, profileFields) {
    const aliasRules = [
      { key: 'First Name', aliases: ['fname', 'givenname'] },
      { key: 'Last Name', aliases: ['lname', 'surname', 'familyname'] },
      { key: 'Phone', aliases: ['tel', 'mobile', 'cell', 'contact'] },
      { key: 'Zip Code', aliases: ['zip', 'postal', 'pincode'] }
    ];

    for (const rule of aliasRules) {
      if (profileFields[rule.key]) {
        if (rule.aliases.some(alias => attributes.some(attr => attr.includes(alias)))) {
          return rule.key;
        }
      }
    }
    return null;
  }
};

export default LocalMatcher;
