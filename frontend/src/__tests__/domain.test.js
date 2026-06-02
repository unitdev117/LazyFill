import { describe, it, expect } from 'vitest';
import { normalizeHost, hostCoveredBy, parseDomainInput } from '../shared/domain.js';

describe('normalizeHost', () => {
  it('lowercases, strips www. and trailing dot', () => {
    expect(normalizeHost('WWW.Example.com.')).toBe('example.com');
    expect(normalizeHost(null)).toBe('');
  });
});

describe('hostCoveredBy', () => {
  it('covers host + subdomains, respects boundaries', () => {
    expect(hostCoveredBy('jobs.example.com', 'example.com')).toBe(true);
    expect(hostCoveredBy('example.com', 'example.com')).toBe(true);
    expect(hostCoveredBy('evil-example.com', 'example.com')).toBe(false);
    expect(hostCoveredBy('example.com', 'jobs.example.com')).toBe(false);
  });
});

describe('parseDomainInput', () => {
  it('extracts host from a pasted URL (scheme, path, query, port)', () => {
    expect(parseDomainInput('https://Jobs.Example.com/apply?x=1')).toBe('jobs.example.com');
    expect(parseDomainInput('http://example.com:8080/path')).toBe('example.com');
  });

  it('normalizes plain host input', () => {
    expect(parseDomainInput('  WWW.Example.COM  ')).toBe('example.com');
    expect(parseDomainInput('example.co.uk')).toBe('example.co.uk');
    expect(parseDomainInput('sub.domain.example.org')).toBe('sub.domain.example.org');
  });

  it('strips an accidentally-typed path', () => {
    expect(parseDomainInput('example.com/careers/123')).toBe('example.com');
  });

  it('rejects non-domains', () => {
    for (const bad of ['', '   ', 'localhost', 'not a domain', 'example', 'example.', '.com',
      'foo..bar.com', 'example.c', '-bad.com', 'bad-.com', null, undefined]) {
      expect(parseDomainInput(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
