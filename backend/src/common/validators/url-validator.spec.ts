import { describe, it, expect } from 'bun:test';
import {
  validateExternalUrl,
  validateFalRequestId,
  validateKieTaskId,
} from './url-validator';

describe('URL Validator', () => {
  describe('validateExternalUrl', () => {
    it('should allow valid HTTPS URLs', () => {
      expect(() =>
        validateExternalUrl('https://example.com/image.png'),
      ).not.toThrow();
      expect(() =>
        validateExternalUrl('https://cdn.provider.com/path/to/file'),
      ).not.toThrow();
    });

    it('should reject HTTP URLs', () => {
      expect(() => validateExternalUrl('http://example.com/image.png')).toThrow(
        'Only HTTPS URLs are allowed',
      );
    });

    it('should reject localhost', () => {
      expect(() => validateExternalUrl('https://localhost/image.png')).toThrow(
        'URL points to blocked domain',
      );
    });

    it('should reject .local domains', () => {
      expect(() =>
        validateExternalUrl('https://server.local/image.png'),
      ).toThrow('URL points to blocked domain');
    });

    it('should reject 127.x.x.x loopback addresses', () => {
      expect(() => validateExternalUrl('https://127.0.0.1/image.png')).toThrow(
        'URL points to private IP range',
      );
      expect(() => validateExternalUrl('https://127.1.1.1/image.png')).toThrow(
        'URL points to private IP range',
      );
    });

    it('should reject 10.x.x.x private addresses', () => {
      expect(() => validateExternalUrl('https://10.0.0.1/image.png')).toThrow(
        'URL points to private IP range',
      );
      expect(() =>
        validateExternalUrl('https://10.255.255.255/image.png'),
      ).toThrow('URL points to private IP range');
    });

    it('should reject 172.16-31.x.x private addresses', () => {
      expect(() => validateExternalUrl('https://172.16.0.1/image.png')).toThrow(
        'URL points to private IP range',
      );
      expect(() =>
        validateExternalUrl('https://172.31.255.255/image.png'),
      ).toThrow('URL points to private IP range');
    });

    it('should reject 192.168.x.x private addresses', () => {
      expect(() =>
        validateExternalUrl('https://192.168.1.1/image.png'),
      ).toThrow('URL points to private IP range');
      expect(() =>
        validateExternalUrl('https://192.168.255.255/image.png'),
      ).toThrow('URL points to private IP range');
    });

    it('should reject 169.254.x.x link-local addresses', () => {
      expect(() =>
        validateExternalUrl('https://169.254.0.1/image.png'),
      ).toThrow('URL points to private IP range');
      expect(() =>
        validateExternalUrl('https://169.254.255.255/image.png'),
      ).toThrow('URL points to private IP range');
    });

    it('should reject invalid URL format', () => {
      expect(() => validateExternalUrl('not-a-url')).toThrow(
        'Invalid URL format',
      );
      expect(() => validateExternalUrl('')).toThrow('Invalid URL format');
    });
  });

  describe('validateFalRequestId', () => {
    it('should accept valid UUID format', () => {
      expect(validateFalRequestId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
        true,
      );
      expect(validateFalRequestId('12345678-1234-1234-1234-123456789012')).toBe(
        true,
      );
    });

    it('should reject invalid UUID format', () => {
      expect(validateFalRequestId('not-a-uuid')).toBe(false);
      expect(validateFalRequestId('123')).toBe(false);
      expect(validateFalRequestId('')).toBe(false);
      expect(
        validateFalRequestId('a1b2c3d4-e5f6-7890-abcd-ef1234567890-extra'),
      ).toBe(false);
    });
  });

  describe('validateKieTaskId', () => {
    it('should accept valid alphanumeric task IDs', () => {
      expect(validateKieTaskId('task123')).toBe(true);
      expect(validateKieTaskId('TASK_123')).toBe(true);
      expect(validateKieTaskId('task-123-abc')).toBe(true);
      expect(validateKieTaskId('a1b2c3d4e5f6')).toBe(true);
    });

    it('should reject task IDs with invalid characters', () => {
      expect(validateKieTaskId('task@123')).toBe(false);
      expect(validateKieTaskId('task 123')).toBe(false);
      expect(validateKieTaskId('task.123')).toBe(false);
    });

    it('should reject task IDs that are too long', () => {
      const longId = 'a'.repeat(129);
      expect(validateKieTaskId(longId)).toBe(false);
    });

    it('should reject empty task IDs', () => {
      expect(validateKieTaskId('')).toBe(false);
    });
  });
});
