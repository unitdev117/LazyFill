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
   * Generates a stable fingerprint for a form structure.
   * Uses sorted IDs and names to ensure stability across shifts.
   */
  generateFingerprint(fields) {
    if (!fields || fields.length === 0) return null;

    // Use field IDs and Names as the structural fingerprint
    const structuralKeys = fields
      .map((f) => `${f.id || ''}:${f.name || ''}:${f.tagName}`)
      .sort()
      .join('|');

    // Basic hash representation
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
