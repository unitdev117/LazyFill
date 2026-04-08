/**
 * ============================================================
 *  CACHE MANAGER — Session Caching Optimization
 * ============================================================
 *  Fingerprints form structures and caches AI mappings locally
 *  to avoid redundant API requests for the same form.
 * ============================================================
 */

const CacheManager = {
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

    const key = `cache_fprint_${fingerprint}`;
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
  async save(fingerprint, mappings) {
    if (!fingerprint || !mappings) return;

    const key = `cache_fprint_${fingerprint}`;
    await chrome.storage.local.set({
      [key]: {
        data: mappings,
        timestamp: Date.now()
      }
    });
  }
};

export default CacheManager;
