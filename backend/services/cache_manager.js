/**
 * ============================================================
 *  CACHE MANAGER — Session Caching Optimization
 * ============================================================
 *  Fingerprints form structures and caches AI mappings locally
 *  to avoid redundant API requests for the same form.
 * ============================================================
 */

const CACHE_VERSION = 'v1';

const CacheManager = {
  _normalizeToken(value) {
    return (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  },

  getFieldCacheKey(field) {
    if (!field || typeof field !== 'object') return '';

    return [
      field.tagName || '',
      field.type || '',
      field.id || '',
      field.name || '',
      field.label || '',
      field.placeholder || '',
      field.ariaLabel || '',
      field.autocomplete || '',
      field.frameSelector || '',
    ]
      .map((part) => this._normalizeToken(part))
      .join(':');
  },

  attachFieldKeys(mappings, fields) {
    if (!Array.isArray(mappings)) return [];

    return mappings.map((mapping) => {
      if (!mapping || typeof mapping !== 'object') return mapping;

      const field = Array.isArray(fields) ? fields[mapping.index] : null;
      const fieldKey = this.getFieldCacheKey(field);
      return fieldKey ? { ...mapping, fieldKey } : { ...mapping };
    });
  },

  reconcileMappings(mappings, fields) {
    if (!Array.isArray(mappings) || !Array.isArray(fields)) return [];

    const keyToIndex = new Map();
    fields.forEach((field, index) => {
      const fieldKey = this.getFieldCacheKey(field);
      if (fieldKey && !keyToIndex.has(fieldKey)) {
        keyToIndex.set(fieldKey, index);
      }
    });

    return mappings
      .map((mapping) => {
        if (!mapping || typeof mapping !== 'object') return null;

        const fieldAtIndex = fields[mapping.index];
        const liveKeyAtIndex = this.getFieldCacheKey(fieldAtIndex);
        if (mapping.fieldKey && liveKeyAtIndex === mapping.fieldKey) {
          return mapping;
        }

        if (mapping.fieldKey && keyToIndex.has(mapping.fieldKey)) {
          return {
            ...mapping,
            index: keyToIndex.get(mapping.fieldKey),
          };
        }

        return null;
      })
      .filter(Boolean);
  },

  /**
   * Generates a unique hash for a form based on its structural structure.
   * This MUST be stable across page refreshes, even if fields are partially filled.
   * @param {Array} fields — The raw scanned fields (should include ALL fields)
   * @returns {string} — Fingerprint string
   */
  generateFingerprint(fields) {
    if (!fields || fields.length === 0) return null;

    // Use stable structural attributes only. 
    // We EXCLUDE "currentValue" so the fingerprint doesn't change when a user types.
    const structuralKeys = fields
      .map((f) => `${f.id || ''}:${f.name || ''}:${f.tagName}`)
      .sort()
      .join('|');

    // Simple robust hash for storage optimization
    return btoa(structuralKeys).substring(0, 32);
  },

  /**
   * Attempts to retrieve a cached mapping for a fingerprint.
   */
  async get(fingerprint) {
    if (!fingerprint) return null;

    const key = `cache_${CACHE_VERSION}_fprint_${fingerprint}`;
    const result = await chrome.storage.local.get([key]);
    
    if (result[key]) {
      const { data, timestamp } = result[key];
      // 1-hour cache TTL (Time to Live)
      if (Date.now() - timestamp < 3600000) {
        return data;
      } else {
        // Cache expired
        chrome.storage.local.remove([key]);
      }
    }
    return null;
  },

  /**
   * Saves an AI result to the local cache.
   */
  async save(fingerprint, mappings, fields) {
    if (!fingerprint || !mappings) return;

    const key = `cache_${CACHE_VERSION}_fprint_${fingerprint}`;
    const normalizedMappings = this.attachFieldKeys(mappings, fields);
    await chrome.storage.local.set({
      [key]: {
        data: normalizedMappings,
        timestamp: Date.now()
      }
    });
  }
};

export default CacheManager;
