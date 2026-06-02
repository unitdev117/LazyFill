import { describe, it, expect } from 'vitest';
import { detectIntent, inferFieldIntent, inferProfileKeyIntent } from '../shared/field-semantics.js';

describe('detectIntent', () => {
  it('classifies common field hints', () => {
    expect(detectIntent('Email Address')).toBe('email');
    expect(detectIntent('Mobile Number')).toBe('phone');
    expect(detectIntent('Town')).toBe('city');
    expect(detectIntent('Province')).toBe('state');
    expect(detectIntent('Postcode')).toBe('zip');
    expect(detectIntent('Nationality')).toBe('country');
    expect(detectIntent('Street Address')).toBe('address');
    expect(detectIntent('Given Name')).toBe('first_name');
    expect(detectIntent('Surname')).toBe('last_name');
    expect(detectIntent('Full Name')).toBe('full_name');
  });

  it('returns null for unknown / empty hints', () => {
    expect(detectIntent('Favourite Colour')).toBeNull();
    expect(detectIntent('')).toBeNull();
    expect(detectIntent(null)).toBeNull();
  });
});

describe('inferFieldIntent / inferProfileKeyIntent agree', () => {
  it('a field and the matching profile key resolve to the same category', () => {
    const field = { label: 'Town', name: 'city_field' };
    expect(inferFieldIntent(field)).toBe('city');
    expect(inferProfileKeyIntent('City')).toBe('city');
    expect(inferFieldIntent(field)).toBe(inferProfileKeyIntent('City'));
  });

  it('inferFieldIntent reads across all hint attributes', () => {
    expect(inferFieldIntent({ id: 'fname' })).toBe('first_name');
    expect(inferFieldIntent({ placeholder: 'you@example.com email' })).toBe('email');
    expect(inferFieldIntent({})).toBeNull();
    expect(inferFieldIntent(null)).toBeNull();
  });
});
