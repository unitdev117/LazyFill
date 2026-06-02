import { describe, it, expect } from 'vitest';
import CacheManager from '../../../backend/services/cache_manager.js';

const field = (over = {}) => ({
  tagName: 'input', type: 'text', id: '', name: '', label: '',
  placeholder: '', ariaLabel: '', autocomplete: '', frameSelector: '',
  currentValue: '', ...over,
});

describe('generateFingerprint', () => {
  it('is stable regardless of currentValue (user typing must not bust cache)', () => {
    const empty = [field({ id: 'a', name: 'first' }), field({ id: 'b', name: 'last' })];
    const filled = [field({ id: 'a', name: 'first', currentValue: 'John' }),
                    field({ id: 'b', name: 'last', currentValue: 'Doe' })];
    expect(CacheManager.generateFingerprint(empty)).toBe(CacheManager.generateFingerprint(filled));
  });
  it('is order-independent and null for empty input', () => {
    const a = [field({ id: 'a' }), field({ id: 'b' })];
    const b = [field({ id: 'b' }), field({ id: 'a' })];
    expect(CacheManager.generateFingerprint(a)).toBe(CacheManager.generateFingerprint(b));
    expect(CacheManager.generateFingerprint([])).toBeNull();
  });
});

describe('getFieldCacheKey', () => {
  it('builds a stable normalized key and ignores cosmetic differences', () => {
    const k1 = CacheManager.getFieldCacheKey(field({ id: 'Email', label: 'E-Mail' }));
    const k2 = CacheManager.getFieldCacheKey(field({ id: 'email', label: 'email' }));
    expect(k1).toBe(k2);
    expect(CacheManager.getFieldCacheKey(null)).toBe('');
  });
});

describe('reconcileMappings', () => {
  it('re-indexes a cached mapping to the field that still carries its fieldKey', () => {
    const fieldA = field({ id: 'a', name: 'first' });
    const fieldB = field({ id: 'b', name: 'last' });
    const keyB = CacheManager.getFieldCacheKey(fieldB);
    // Live DOM order flipped: B is now at index 0, A at index 1.
    const liveFields = [fieldB, fieldA];
    const cached = [{ index: 1, value: 'Doe', fieldKey: keyB }];
    const reconciled = CacheManager.reconcileMappings(cached, liveFields);
    expect(reconciled).toEqual([{ index: 0, value: 'Doe', fieldKey: keyB }]);
  });

  it('drops mappings whose field no longer exists', () => {
    const gone = [{ index: 0, value: 'x', fieldKey: 'input:text:ghost::::::' }];
    expect(CacheManager.reconcileMappings(gone, [field({ id: 'real' })])).toEqual([]);
  });
});
