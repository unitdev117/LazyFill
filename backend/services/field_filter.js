/**
 * ============================================================
 *  FIELD FILTER — Pre-processing Optimization
 * ============================================================
 *  Removes fields from the scan results that already have a
 *  value (either pre-filled or user-entered).
 * ============================================================
 */

const FieldFilter = {
  /**
   * Filters out already-filled fields from the scanned list.
   * @param {Array} fields — [ { currentValue, ... } ]
   * @returns {Array} — Only the empty fields
   */
  clean(fields) {
    if (!fields || !Array.isArray(fields)) return [];

    return fields.filter((field) => {
      // Exclude fields that already have non-whitespace content
      const value = (field.currentValue || '').toString().trim();
      return value.length === 0;
    });
  }
};

export default FieldFilter;
