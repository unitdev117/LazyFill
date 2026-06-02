import { describe, it, expect } from 'vitest';
import { isSensitiveHost, isSensitiveField } from '../shared/sensitive-data.js';

describe('isSensitiveHost', () => {
  it('blocks banking / payment / brokerage / crypto / gov hosts', () => {
    for (const h of ['www.chase.com', 'secure.bankofamerica.com', 'paypal.com',
      'onlinebanking.hsbc.co.uk', 'coinbase.com', 'netbanking.icicibank.com',
      'irs.gov', 'india.gov.in', 'example.bank', 'service.mil']) {
      expect(isSensitiveHost(h), h).toBe(true);
    }
  });
  it('allows ordinary hosts', () => {
    for (const h of ['github.com', 'mail.google.com', 'jobs.lever.co',
      'myaccount.example.com', '']) {
      expect(isSensitiveHost(h), h).toBe(false);
    }
  });
});

describe('isSensitiveField', () => {
  it('flags credential / payment / identity fields', () => {
    for (const f of [{ type: 'password' }, { name: 'cardNumber' }, { name: 'cvv' },
      { autocomplete: 'one-time-code' }, { autocomplete: 'cc-number' },
      { label: 'Social Security Number', name: 'ssn' }, { label: 'Routing Number' }]) {
      expect(isSensitiveField(f), JSON.stringify(f)).toBe(true);
    }
  });
  it('allows ordinary profile fields ("pin" inside "shipping" must not trip)', () => {
    for (const f of [{ name: 'email', label: 'Email' }, { name: 'firstName' },
      { name: 'shippingAddress', label: 'Shipping Address' }, { name: 'username' }]) {
      expect(isSensitiveField(f), JSON.stringify(f)).toBe(false);
    }
    expect(isSensitiveField(null)).toBe(false);
  });
});
