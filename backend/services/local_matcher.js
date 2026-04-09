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

      // 1. Get a "search blob" of all field attributes
      const attributes = [
        field.id || '',
        field.name || '',
        field.label || '',
        field.placeholder || '',
        field.autocomplete || ''
      ].map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));

      // 2. Try to match any of the profile's keys against the field's attributes
      for (const key of profileKeys) {
        if (!key.normalized) continue;

        // Check for exact match or substring match in any attribute
        const isMatch = attributes.some(attr => {
          return attr === key.normalized || 
                 attr.includes(key.normalized) || 
                 key.normalized.includes(attr) && attr.length > 3;
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
