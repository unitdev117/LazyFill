import { describe, it, expect } from 'vitest';
import LocalMatcher from '../../../backend/services/local_matcher.js';

const field = (over = {}) => ({
  index: 0, tagName: 'input', type: 'text', role: '', placeholder: '',
  domPath: '', label: '', name: '', id: '', ariaLabel: '', autocomplete: '',
  hasListAttribute: false, ...over,
});

describe('calculateSimilarity (Sørensen–Dice)', () => {
  it('is 1 for identical normalized strings and 0 for disjoint', () => {
    expect(LocalMatcher.calculateSimilarity('First Name', 'firstname')).toBe(1);
    expect(LocalMatcher.calculateSimilarity('email', 'xyzqr')).toBeLessThan(0.2);
  });
  it('handles tiny / empty strings without throwing (identical inputs => 1)', () => {
    expect(LocalMatcher.calculateSimilarity('', '')).toBe(1);
    expect(LocalMatcher.calculateSimilarity('a', 'a')).toBe(1);
    expect(LocalMatcher.calculateSimilarity('a', 'b')).toBe(0);
  });
});

describe('_isPureTextField', () => {
  it('accepts text inputs and textareas', () => {
    expect(LocalMatcher._isPureTextField(field({ type: 'text' }))).toBe(true);
    expect(LocalMatcher._isPureTextField(field({ tagName: 'textarea', type: 'textarea' }))).toBe(true);
  });
  it('rejects password, selects, list/combobox widgets', () => {
    expect(LocalMatcher._isPureTextField(field({ type: 'password' }))).toBe(false);
    expect(LocalMatcher._isPureTextField(field({ tagName: 'select' }))).toBe(false);
    expect(LocalMatcher._isPureTextField(field({ role: 'combobox' }))).toBe(false);
    expect(LocalMatcher._isPureTextField(field({ hasListAttribute: true }))).toBe(false);
    expect(LocalMatcher._isPureTextField(field({ placeholder: 'Select a country' }))).toBe(false);
  });
});

describe('findMatches', () => {
  it('matches by exact normalized label against profile keys', () => {
    const fields = [field({ index: 0, label: 'Email', name: 'email' })];
    const { localMappings, remainingFields } = LocalMatcher.findMatches(fields, { Email: 'a@b.com' });
    expect(localMappings).toEqual([{ index: 0, profileKey: 'Email', value: 'a@b.com' }]);
    expect(remainingFields).toHaveLength(0);
  });

  it('matches common shorthand via the shared semantics fallback', () => {
    const fields = [field({ index: 0, name: 'fname' })];
    const { localMappings } = LocalMatcher.findMatches(fields, { 'First Name': 'John' });
    expect(localMappings).toEqual([{ index: 0, profileKey: 'First Name', value: 'John' }]);
  });

  it('matches by semantic category beyond the old alias set (Town -> City)', () => {
    const fields = [field({ index: 0, label: 'Town', name: 'town' })];
    const { localMappings } = LocalMatcher.findMatches(fields, { City: 'Berlin' });
    expect(localMappings).toEqual([{ index: 0, profileKey: 'City', value: 'Berlin' }]);
  });

  it('semantic fallback requires the profile key to actually have a value', () => {
    const fields = [field({ index: 0, label: 'Town', name: 'town' })];
    const { localMappings, remainingFields } = LocalMatcher.findMatches(fields, { City: '' });
    expect(localMappings).toHaveLength(0);
    expect(remainingFields).toHaveLength(1);
  });

  it('leaves genuinely unknown fields for the AI (remainingFields)', () => {
    const fields = [field({ index: 0, label: 'Favourite colour', name: 'fav_colour' })];
    const { localMappings, remainingFields } = LocalMatcher.findMatches(fields, { Email: 'a@b.com' });
    expect(localMappings).toHaveLength(0);
    expect(remainingFields).toHaveLength(1);
  });

  it('drops non-text fields entirely (neither matched nor sent to AI)', () => {
    const fields = [field({ index: 0, tagName: 'select', label: 'Country' })];
    const { localMappings, remainingFields } = LocalMatcher.findMatches(fields, { Country: 'US' });
    expect(localMappings).toHaveLength(0);
    expect(remainingFields).toHaveLength(0);
  });
});
