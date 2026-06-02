import { describe, it, expect } from 'vitest';
import { isFillableFieldMeta } from '../shared/field-classification.js';

const meta = (over = {}) => ({ tagName: 'input', type: 'text', role: '', placeholder: '', domPath: '', hasListAttribute: false, ...over });

describe('isFillableFieldMeta', () => {
  it('accepts plain text inputs, textareas, contenteditable', () => {
    expect(isFillableFieldMeta(meta({ type: 'text' }))).toBe(true);
    expect(isFillableFieldMeta(meta({ type: 'email' }))).toBe(true);
    expect(isFillableFieldMeta(meta({ type: 'tel' }))).toBe(true);
    expect(isFillableFieldMeta(meta({ type: '' }))).toBe(true);
    expect(isFillableFieldMeta(meta({ tagName: 'textarea', type: 'textarea' }))).toBe(true);
    expect(isFillableFieldMeta(meta({ tagName: 'contenteditable', type: 'contenteditable' }))).toBe(true);
  });

  it('rejects credential, choice-widget, and non-text fields', () => {
    expect(isFillableFieldMeta(meta({ type: 'password' }))).toBe(false);
    expect(isFillableFieldMeta(meta({ type: 'number' }))).toBe(false);
    expect(isFillableFieldMeta(meta({ tagName: 'select' }))).toBe(false);
    expect(isFillableFieldMeta(meta({ role: 'combobox' }))).toBe(false);
    expect(isFillableFieldMeta(meta({ hasListAttribute: true }))).toBe(false);
    expect(isFillableFieldMeta(meta({ placeholder: 'Select a country' }))).toBe(false);
    expect(isFillableFieldMeta(meta({ placeholder: 'Choose one' }))).toBe(false);
    expect(isFillableFieldMeta(meta({ domPath: 'div.form > div.dropdown > input' }))).toBe(false);
  });

  it('is defensive against bad input', () => {
    expect(isFillableFieldMeta(null)).toBe(false);
    expect(isFillableFieldMeta(undefined)).toBe(false);
    expect(isFillableFieldMeta('nope')).toBe(false);
    expect(isFillableFieldMeta(meta({ tagName: 'div', role: '' }))).toBe(false);
  });
});
