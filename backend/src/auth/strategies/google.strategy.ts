import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private authService: AuthService,
    config: ConfigService,
  ) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');

    super({
      clientID: clientID || 'placeholder',
      clientSecret: clientSecret || 'placeholder',
      callbackURL: `${config.get<string>('APP_URL')}/auth/google/callback`,
      scope: ['email', 'profile'],
    } as any);

    if (!clientID) {
      this.logger.warn('Google OAuth not configured - GOOGLE_CLIENT_ID is missing');
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    try {
      const { id, emails, displayName, photos } = profile;
      const email = emails?.[0]?.value;

      if (!email) {
        this.logger.warn(`Google OAuth: No email provided for profile ${id}`);
        return done(new Error('Email is required for authentication'), false);
      }

      // Store OAuth tokens for future API calls (e.g., Google Calendar, Drive)
      const user = await this.authService.findOrCreateOAuthUser({
        providerType: 'google',
        providerAccountId: id,
        email,
        name: displayName || email.split('@')[0],
        image: photos?.[0]?.value,
        accessToken,
        refreshToken,
        // Google access tokens typically expire in 1 hour
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      done(null, user);
    } catch (error) {
      this.logger.error('Google OAuth validation failed', error);
      done(error as Error, false);
    }
  }
}
