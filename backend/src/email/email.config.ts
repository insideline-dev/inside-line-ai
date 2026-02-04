// Email configuration constants
export const EMAIL_CONFIG = {
  // Default sender (override with EMAIL_FROM env var)
  FROM_EMAIL: 'noreply@yourapp.com',
  FROM_NAME: 'YourApp',

  // Token expiration times (in milliseconds)
  VERIFICATION_TOKEN_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  MAGIC_LINK_EXPIRY: 15 * 60 * 1000, // 15 minutes
  PASSWORD_RESET_EXPIRY: 60 * 60 * 1000, // 1 hour

  // Rate limits
  MAX_EMAILS_PER_HOUR: 10,
} as const;

// Email template types
export type EmailTemplate =
  | 'verification'
  | 'magic-link'
  | 'password-reset'
  | 'welcome';
