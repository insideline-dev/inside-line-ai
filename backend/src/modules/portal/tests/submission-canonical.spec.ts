import {
  hashFounderEmail,
  normalizeCompanyNameForMatch,
  extractClientIp,
} from '../utils/submission-canonical';

describe('submission-canonical utils', () => {
  describe('normalizeCompanyNameForMatch', () => {
    it('collapses fuzzy variants of the same company', () => {
      expect(normalizeCompanyNameForMatch('Acme AI')).toBe('acme ai');
      expect(normalizeCompanyNameForMatch('acme.ai')).toBe('acme ai');
      expect(normalizeCompanyNameForMatch('  Acme A.I.  ')).toBe('acme a i');
      expect(normalizeCompanyNameForMatch('Acme & Co.')).toBe('acme and');
      expect(normalizeCompanyNameForMatch('Acme, Inc.')).toBe('acme');
      expect(normalizeCompanyNameForMatch('Acme Corporation')).toBe('acme');
      expect(normalizeCompanyNameForMatch('Acme GmbH')).toBe('acme');
    });

    it('returns null for empty / placeholder names', () => {
      expect(normalizeCompanyNameForMatch('')).toBeNull();
      expect(normalizeCompanyNameForMatch('   ')).toBeNull();
      expect(normalizeCompanyNameForMatch('Unknown')).toBeNull();
      expect(normalizeCompanyNameForMatch('Untitled Startup')).toBeNull();
      expect(normalizeCompanyNameForMatch(null)).toBeNull();
      expect(normalizeCompanyNameForMatch(undefined)).toBeNull();
    });
  });

  describe('hashFounderEmail', () => {
    it('produces a stable SHA-256 hex digest for the lowercased+trimmed email', () => {
      const a = hashFounderEmail('Y@x.com');
      const b = hashFounderEmail('y@x.com ');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different hashes for different emails', () => {
      expect(hashFounderEmail('a@x.com')).not.toBe(
        hashFounderEmail('b@x.com'),
      );
    });
  });

  describe('extractClientIp', () => {
    it('prefers the first hop in X-Forwarded-For', () => {
      expect(
        extractClientIp({
          ip: '10.0.0.1',
          forwardedFor: '203.0.113.5, 10.0.0.1',
        }),
      ).toBe('203.0.113.5');
    });

    it('supports the array form of forwardedFor', () => {
      expect(
        extractClientIp({
          ip: '10.0.0.1',
          forwardedFor: ['203.0.113.5', '10.0.0.1'],
        }),
      ).toBe('203.0.113.5');
    });

    it('falls back to req.ip if no XFF header', () => {
      expect(extractClientIp({ ip: '10.0.0.1', forwardedFor: null })).toBe(
        '10.0.0.1',
      );
    });

    it('returns null when nothing is available', () => {
      expect(extractClientIp({ ip: null, forwardedFor: null })).toBeNull();
      expect(extractClientIp({ ip: '', forwardedFor: '' })).toBeNull();
    });
  });
});
