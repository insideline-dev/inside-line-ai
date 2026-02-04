/**
 * URL validation utilities for security
 */

const PRIVATE_IP_RANGES = [
  /^127\./, // 127.0.0.0/8 - Loopback
  /^10\./, // 10.0.0.0/8 - Private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 - Private
  /^192\.168\./, // 192.168.0.0/16 - Private
  /^169\.254\./, // 169.254.0.0/16 - Link-local
];

const BLOCKED_DOMAINS = ['localhost', '.local'];

/**
 * Validates that a URL is safe to fetch (SSRF protection)
 * @throws Error if URL is invalid or points to internal/private resources
 */
export function validateExternalUrl(url: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  // Only allow https protocol
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed');
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Check for blocked domains
  for (const blocked of BLOCKED_DOMAINS) {
    if (hostname === blocked || hostname.endsWith(blocked)) {
      throw new Error('URL points to blocked domain');
    }
  }

  // Check for private IP ranges
  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(hostname)) {
      throw new Error('URL points to private IP range');
    }
  }
}

/**
 * Validates Fal request ID format (UUID)
 */
export function validateFalRequestId(requestId: string): boolean {
  return /^[a-f0-9-]{36}$/i.test(requestId);
}

/**
 * Validates Kie task ID format (alphanumeric with dashes/underscores)
 */
export function validateKieTaskId(taskId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(taskId);
}
