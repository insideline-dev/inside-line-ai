/**
 * Regex patterns for URL pathname matching in evaluation agents
 */
export const URL_PATH_PATTERNS = {
  PRODUCT: /\/(product|products|platform|solution|solutions|features|demo)/i,
  DEMO: /\/demo/i,
  MARKETING: /\/(customers|case-studies|blog|news|press|solutions|pricing|demo)/i,
} as const;

/**
 * Regex patterns for content matching
 */
export const CONTENT_PATTERNS = {
  FUNDING: /(fund|raise|series|seed|investment)/i,
  DEMO_LINK: /(demo|book)/i,
  DISTRIBUTION: /(partner|channel|inbound|outbound|sales)/i,
} as const;
