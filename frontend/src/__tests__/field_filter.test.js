import { describe, it, expect } from 'vitest';
import FieldFilter from '../../../backend/services/field_filter.js';

describe('FieldFilter.clean', () => {
  it('keeps only empty fields (whitespace counts as empty)', () => {
    const fields = [
      { index: 0, currentValue: '' },
      { index: 1, currentValue: '   ' },
      { index: 2, currentValue: 'already filled' },
      { index: 3 },
    ];
    expect(FieldFilter.clean(fields).map((f) => f.index)).toEqual([0, 1, 3]);
  });

  it('is defensive against non-array input', () => {
    expect(FieldFilter.clean(null)).toEqual([]);
    expect(FieldFilter.clean(undefined)).toEqual([]);
  });
});
