import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { eq, and, lt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { DrizzleService } from "../database";
import { account, refreshToken as refreshTokenTable } from "../database/schema";
import { UserAuthService, DbUser } from "./user-auth.service";
import { EarlyAccessService } from "../modules/early-access";

export type JwtPayload = {
  sub: string;
  email: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type RefreshResult = TokenPair & {
  user: DbUser;
};

// OAuth profile input with clear naming
export type OAuthProfile = {
  providerType: string; // e.g., 'google', 'github'
  providerAccountId: string; // The user's ID from the OAuth provider
  email: string;
  name: string;
  image?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private drizzle: DrizzleService,
    private jwt: JwtService,
    private config: ConfigService,
    private userAuth: UserAuthService,
    private earlyAccess: EarlyAccessService,
  ) {}

  // ============ OAUTH ============

  async findOrCreateOAuthUser(profile: OAuthProfile): Promise<DbUser> {
    try {
      // Check if OAuth account already exists
      const [existingAccount] = await this.drizzle.db
        .select()
        .from(account)
        .where(
          and(
            eq(account.providerId, profile.providerType),
            eq(account.accountId, profile.providerAccountId),
          ),
        )
        .limit(1);

      if (existingAccount) {
        // Update tokens if provided (for token refresh)
        if (profile.accessToken || profile.refreshToken) {
          await this.drizzle.db
            .update(account)
            .set({
              accessToken: profile.accessToken,
              refreshToken: profile.refreshToken,
              accessTokenExpiresAt: profile.expiresAt,
            })
            .where(eq(account.id, existingAccount.id));
        }

        const user = await this.userAuth.findUserById(existingAccount.userId);
        if (!user) {
          throw new InternalServerErrorException(
            "User not found for existing account",
          );
        }
        return user;
      }

      // Check if user exists by email
      let foundUser = await this.userAuth.findUserByEmail(profile.email);

      if (!foundUser) {
        const isAllowed = await this.earlyAccess.isEmailAllowed(profile.email);
        if (!isAllowed) {
          throw new ForbiddenException(
            "Access is restricted. You have been added to the waitlist as Founder.",
          );
        }

        foundUser = await this.userAuth.createUser({
          email: profile.email,
          name: profile.name,
          image: profile.image,
          emailVerified: true,
        });
      }

      // Link OAuth account with tokens
      await this.drizzle.db.insert(account).values({
        userId: foundUser.id,
        providerId: profile.providerType,
        accountId: profile.providerAccountId,
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        accessTokenExpiresAt: profile.expiresAt,
      });

      return foundUser;
    } catch (error) {
      // Handle unique constraint violation (duplicate account)
      if (
        error instanceof Error &&
        error.message.includes("unique constraint")
      ) {
        this.logger.warn(
          `Duplicate OAuth account attempted: ${profile.providerType}/${profile.providerAccountId}`,
        );
        throw new ConflictException("OAuth account already linked");
      }

      this.logger.error("Failed to create/find OAuth user", error);
      throw error;
    }
  }

  // ============ JWT TOKENS ============

  /**
   * Generate access token (short-lived JWT).
   */
  generateAccessToken(foundUser: DbUser): string {
    const payload: JwtPayload = { sub: foundUser.id, email: foundUser.email };
    const accessExpiresIn = this.config.get("JWT_ACCESS_EXPIRES", "15m");
    return this.jwt.sign(payload, { expiresIn: accessExpiresIn });
  }

  /**
   * Generate tokens with refresh token rotation.
   * Creates a new refresh token family for fresh logins.
   */
  async generateTokens(foundUser: DbUser): Promise<TokenPair> {
    const accessToken = this.generateAccessToken(foundUser);

    // Generate opaque refresh token (not JWT)
    const refreshTokenValue = randomBytes(32).toString("hex");
    const family = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + this.getRefreshTokenTtlMs());

    // Store refresh token in database
    await this.drizzle.db.insert(refreshTokenTable).values({
      token: refreshTokenValue,
      userId: foundUser.id,
      family,
      expiresAt,
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }

  async validateJwt(payload: JwtPayload): Promise<DbUser | undefined> {
    return this.userAuth.findUserById(payload.sub);
  }

  /**
   * Refresh tokens with rotation.
   * - Validates the refresh token
   * - Marks old token as used
   * - Issues new token in same family
   * - Detects token reuse and invalidates entire family
   */
  async refreshTokens(tokenValue: string): Promise<RefreshResult> {
    // Find the refresh token
    const [storedToken] = await this.drizzle.db
      .select()
      .from(refreshTokenTable)
      .where(eq(refreshTokenTable.token, tokenValue))
      .limit(1);

    if (!storedToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      // Clean up expired token
      await this.drizzle.db
        .delete(refreshTokenTable)
        .where(eq(refreshTokenTable.id, storedToken.id));
      throw new UnauthorizedException("Refresh token expired");
    }

    // SECURITY: Detect token reuse attack
    if (storedToken.used) {
      this.logger.warn(
        `Token reuse detected for family ${storedToken.family}, invalidating all tokens`,
      );
      // Invalidate entire token family (potential attack)
      await this.drizzle.db
        .delete(refreshTokenTable)
        .where(eq(refreshTokenTable.family, storedToken.family));
      throw new UnauthorizedException("Token reuse detected");
    }

    // Get user
    const foundUser = await this.userAuth.findUserById(storedToken.userId);
    if (!foundUser) {
      throw new UnauthorizedException("User not found");
    }

    // Mark current token as used
    await this.drizzle.db
      .update(refreshTokenTable)
      .set({ used: true })
      .where(eq(refreshTokenTable.id, storedToken.id));

    // Generate new tokens in same family
    const accessToken = this.generateAccessToken(foundUser);
    const newRefreshTokenValue = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + this.getRefreshTokenTtlMs());

    // Store new refresh token in same family
    await this.drizzle.db.insert(refreshTokenTable).values({
      token: newRefreshTokenValue,
      userId: foundUser.id,
      family: storedToken.family, // Same family for rotation tracking
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: newRefreshTokenValue,
      user: foundUser,
    };
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices).
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.drizzle.db
      .delete(refreshTokenTable)
      .where(eq(refreshTokenTable.userId, userId));
  }

  /**
   * Clean up expired refresh tokens (call periodically).
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.drizzle.db
      .delete(refreshTokenTable)
      .where(lt(refreshTokenTable.expiresAt, new Date()))
      .returning({ id: refreshTokenTable.id });
    return result.length;
  }

  getRefreshTokenTtlMs(): number {
    const raw = this.config.get<string>("JWT_REFRESH_EXPIRES", "30d");
    return parseDurationToMs(raw, 30 * 24 * 60 * 60 * 1000);
  }

  // Delegate methods for backward compatibility with AuthController
  async registerWithPassword(email: string, pass: string, name: string) {
    return this.userAuth.registerWithPassword(email, pass, name);
  }

  async validatePassword(email: string, pass: string) {
    return this.userAuth.validatePassword(email, pass);
  }

  async createMagicLink(email: string) {
    return this.userAuth.createMagicLink(email);
  }

  async validateMagicLink(token: string) {
    return this.userAuth.validateMagicLink(token);
  }

  async findUserById(id: string) {
    return this.userAuth.findUserById(id);
  }
}

function parseDurationToMs(raw: string, fallback: number): number {
  const value = raw.trim().toLowerCase();
  const match = value.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) {
    return fallback;
  }

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
}
