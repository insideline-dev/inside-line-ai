import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EMAIL_CONFIG, EmailTemplate } from './email.config';

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type TemplateEmailOptions = {
  to: string;
  template: EmailTemplate;
  data: Record<string, string>;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly frontendUrl: string;
  private readonly isDev: boolean;
  private readonly appName: string;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
    this.fromEmail =
      this.config.get<string>('EMAIL_FROM') || EMAIL_CONFIG.FROM_EMAIL;
    this.frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    this.isDev = this.config.get<string>('NODE_ENV') !== 'production';
    this.appName = this.config.get<string>('APP_NAME') || 'App';
  }

  /**
   * Send a raw email with custom HTML content.
   */
  async send(options: SendEmailOptions): Promise<{ id: string } | null> {
    try {
      // In dev mode, log instead of sending if no API key
      if (this.isDev && !this.config.get<string>('RESEND_API_KEY')) {
        this.logger.debug(`[DEV] Email to ${options.to}: ${options.subject}`);
        this.logger.debug(`[DEV] Content: ${options.html}`);
        return { id: 'dev-mock-id' };
      }

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      if (result.error) {
        this.logger.error(`Failed to send email: ${result.error.message}`);
        return null;
      }

      this.logger.log(`Email sent to ${options.to}: ${result.data?.id}`);
      return { id: result.data?.id || '' };
    } catch (error) {
      this.logger.error('Email send error', error);
      return null;
    }
  }

  /**
   * Send email verification link.
   */
  async sendVerificationEmail(
    to: string,
    token: string,
    name?: string,
  ): Promise<boolean> {
    const verifyUrl = `${this.frontendUrl}/auth/verify-email?token=${token}`;
    const userName = name || to.split('@')[0];

    const html = this.getVerificationTemplate(userName, verifyUrl);

    const result = await this.send({
      to,
      subject: 'Verify your email address',
      html,
      text: `Hi ${userName}, please verify your email by clicking: ${verifyUrl}`,
    });

    return result !== null;
  }

  /**
   * Send magic link for passwordless login.
   */
  async sendMagicLinkEmail(to: string, token: string): Promise<boolean> {
    const magicUrl = `${this.frontendUrl}/auth/magic-link?token=${token}`;

    const html = this.getMagicLinkTemplate(magicUrl);

    const result = await this.send({
      to,
      subject: 'Your login link',
      html,
      text: `Click here to log in: ${magicUrl}. This link expires in 15 minutes.`,
    });

    return result !== null;
  }

  /**
   * Send welcome email after successful registration.
   */
  async sendWelcomeEmail(to: string, name: string): Promise<boolean> {
    const html = this.getWelcomeTemplate(name);

    const result = await this.send({
      to,
      subject: `Welcome to ${this.appName}!`,
      html,
      text: `Welcome to ${this.appName}, ${name}! We're excited to have you on board.`,
    });

    return result !== null;
  }

  // ============ EMAIL TEMPLATES ============

  private getVerificationTemplate(name: string, verifyUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 20px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b;">Verify your email</h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #52525b;">
                Hi ${name},<br><br>
                Thanks for signing up! Please verify your email address by clicking the button below.
              </p>
              <a href="${verifyUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #18181b; text-decoration: none; border-radius: 8px;">
                Verify Email
              </a>
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                If the button doesn't work, copy and paste this link:<br>
                <a href="${verifyUrl}" style="color: #3b82f6; word-break: break-all;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private getMagicLinkTemplate(magicUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Login Link</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 20px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b;">Your login link</h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #52525b;">
                Click the button below to log in to your account. This link is valid for 15 minutes.
              </p>
              <a href="${magicUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #18181b; text-decoration: none; border-radius: 8px;">
                Log In
              </a>
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                If you didn't request this link, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                If the button doesn't work, copy and paste this link:<br>
                <a href="${magicUrl}" style="color: #3b82f6; word-break: break-all;">${magicUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private getWelcomeTemplate(name: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${this.appName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: #18181b;">Welcome to ${this.appName}! 🎉</h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #52525b;">
                Hi ${name},<br><br>
                We're thrilled to have you on board! Your account is now set up and ready to go.
              </p>
              <a href="${this.frontendUrl}/dashboard" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #18181b; text-decoration: none; border-radius: 8px;">
                Go to Dashboard
              </a>
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                If you have any questions, feel free to reach out to our support team.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
