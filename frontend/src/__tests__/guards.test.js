import { describe, it, expect } from 'vitest';
import {
  normalizeHost,
  hostCoveredBy,
  isSensitiveSite,
  isSensitiveField,
  isSiteDisabled,
  getBlockReason,
} from '../content/shared/guards.js';

const loc = (hostname) => ({ hostname });

describe('normalizeHost', () => {
  it('lowercases, strips www. and trailing dot', () => {
    expect(normalizeHost('WWW.Example.com.')).toBe('example.com');
    expect(normalizeHost('Sub.Example.COM')).toBe('sub.example.com');
    expect(normalizeHost('')).toBe('');
    expect(normalizeHost(null)).toBe('');
  });
});

describe('hostCoveredBy (whole-domain matching)', () => {
  it('covers the same host and any subdomain, but respects label boundaries', () => {
    expect(hostCoveredBy('example.com', 'example.com')).toBe(true);
    expect(hostCoveredBy('www.example.com', 'example.com')).toBe(true);
    expect(hostCoveredBy('jobs.example.com', 'example.com')).toBe(true);
    expect(hostCoveredBy('a.b.example.com', 'example.com')).toBe(true);
    // apex is NOT covered by a subdomain entry (predictable, narrower)
    expect(hostCoveredBy('example.com', 'jobs.example.com')).toBe(false);
    // no fake-subdomain bypass
    expect(hostCoveredBy('notexample.com', 'example.com')).toBe(false);
    expect(hostCoveredBy('evil-example.com', 'example.com')).toBe(false);
    expect(hostCoveredBy('example.com', '')).toBe(false);
  });
});

describe('isSensitiveSite', () => {
  it('blocks banking / payment / brokerage / crypto brands', () => {
    for (const h of ['www.chase.com', 'secure.bankofamerica.com', 'paypal.com',
      'onlinebanking.hsbc.co.uk', 'coinbase.com', 'netbanking.icicibank.com']) {
      expect(isSensitiveSite(loc(h)), h).toBe(true);
    }
  });

  it('blocks government / dedicated-secure suffixes', () => {
    for (const h of ['irs.gov', 'india.gov.in', 'example.bank', 'service.mil']) {
      expect(isSensitiveSite(loc(h)), h).toBe(true);
    }
  });

  it('allows ordinary sites', () => {
    for (const h of ['github.com', 'mail.google.com', 'jobs.lever.co',
      'myaccount.example.com', 'news.ycombinator.com']) {
      expect(isSensitiveSite(loc(h)), h).toBe(false);
    }
  });
});

describe('isSensitiveField', () => {
  it('flags credential / payment / identity fields', () => {
    const cases = [
      { type: 'password' },
      { name: 'cardNumber', label: 'Card Number' },
      { name: 'cvv' },
      { autocomplete: 'one-time-code' },
      { autocomplete: 'cc-number' },
      { name: 'ssn', label: 'Social Security Number' },
      { name: 'accountNumber', label: 'Bank Account Number' },
      { label: 'Routing Number' },
      { name: 'otp_input', label: 'Enter OTP' },
    ];
    for (const f of cases) expect(isSensitiveField(f), JSON.stringify(f)).toBe(true);
  });

  it('allows ordinary profile fields', () => {
    const cases = [
      { name: 'email', label: 'Email' },
      { name: 'firstName', label: 'First Name' },
      { name: 'shippingAddress', label: 'Shipping Address' }, // "pin" inside "shipping" must NOT trip
      { name: 'username', label: 'Username' },
      { name: 'city', label: 'City' },
    ];
    for (const f of cases) expect(isSensitiveField(f), JSON.stringify(f)).toBe(false);
  });

  it('handles empty / nullish input', () => {
    expect(isSensitiveField(null)).toBe(false);
    expect(isSensitiveField({})).toBe(false);
  });
});

describe('isSiteDisabled (injected list)', () => {
  it('matches whole domains and subdomains from the user list', () => {
    const hosts = ['example.com', 'jobs.acme.io'];
    expect(isSiteDisabled(loc('example.com'), hosts)).toBe(true);
    expect(isSiteDisabled(loc('careers.example.com'), hosts)).toBe(true);
    expect(isSiteDisabled(loc('acme.io'), hosts)).toBe(false); // apex not covered by subdomain entry
    expect(isSiteDisabled(loc('jobs.acme.io'), hosts)).toBe(true);
    expect(isSiteDisabled(loc('other.com'), hosts)).toBe(false);
    expect(isSiteDisabled(loc('example.com'), [])).toBe(false);
  });
});

describe('getBlockReason', () => {
  it('returns secure reason for sensitive sites', () => {
    expect(getBlockReason(loc('chase.com'))).toMatchObject({ code: 'secure' });
  });
  it('returns null for ordinary sites with no disabled entries', () => {
    expect(getBlockReason(loc('github.com'))).toBeNull();
  });
});
