import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, gt } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { DrizzleService } from '../database';
import { user, account, verification, UserRole } from '../database/schema';
import { EMAIL_CONFIG } from '../email';

// Use drizzle's inferred type for internal operations
export type DbUser = typeof user.$inferSelect;

// Verification types
export type VerificationType = 'email' | 'magic_link';

// Password validation rules
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export type PasswordValidationResult = {
  valid: boolean;
  errors: string[];
};

@Injectable()
export class UserAuthService {
  constructor(private drizzle: DrizzleService) {}

  /**
   * Validates password strength with essential criteria.
   * Simplified for better UX while maintaining security.
   */
  validatePasswordStrength(password: string): PasswordValidationResult {
    const errors: string[] = [];

    // Length check
    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.push(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      );
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      errors.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
    }

    // Must have at least one letter and one number (simple but effective)
    if (!/[a-zA-Z]/.test(password)) {
      errors.push('Password must contain at least one letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    return { valid: errors.length === 0, errors };
  }

  async findUserById(id: string): Promise<DbUser | undefined> {
    const [found] = await this.drizzle.db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return found;
  }

  async findUserByEmail(email: string): Promise<DbUser | undefined> {
    const [found] = await this.drizzle.db
      .select()
      .from(user)
      .where(eq(user.email, email.toLowerCase().trim()))
      .limit(1);
    return found;
  }

  async createUser(data: {
    email: string;
    name: string;
    image?: string;
    emailVerified?: boolean;
  }): Promise<DbUser> {
    const [created] = await this.drizzle.db
      .insert(user)
      .values({
        email: data.email.toLowerCase().trim(),
        name: data.name.trim(),
        image: data.image ?? null,
        emailVerified: data.emailVerified ?? false,
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create user');
    }
    return created;
  }

  async registerWithPassword(
    email: string,
    password: string,
    name: string,
  ): Promise<DbUser> {
    // Validate password strength
    const validation = this.validatePasswordStrength(password);
    if (!validation.valid) {
      throw new BadRequestException(validation.errors);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.findUserByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await this.createUser({ email: normalizedEmail, name });

    await this.drizzle.db.insert(account).values({
      userId: newUser.id,
      providerId: 'credential',
      accountId: newUser.id,
      password: hashedPassword,
    });

    return newUser;
  }

  async validatePassword(
    email: string,
    password: string,
  ): Promise<DbUser | null> {
    const foundUser = await this.findUserByEmail(email);
    if (!foundUser) return null;

    const [acc] = await this.drizzle.db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, foundUser.id),
          eq(account.providerId, 'credential'),
        ),
      )
      .limit(1);

    if (!acc?.password) return null;

    const isValid = await bcrypt.compare(password, acc.password);
    return isValid ? foundUser : null;
  }

  // ============ EMAIL VERIFICATION ============

  /**
   * Create email verification token for new password signups.
   */
  async createEmailVerificationToken(email: string): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(
      Date.now() + EMAIL_CONFIG.VERIFICATION_TOKEN_EXPIRY,
    );

    // Delete any existing verification tokens for this email
    await this.drizzle.db
      .delete(verification)
      .where(
        and(
          eq(verification.identifier, normalizedEmail),
          eq(verification.type, 'email'),
        ),
      );

    await this.drizzle.db.insert(verification).values({
      identifier: normalizedEmail,
      value: token,
      type: 'email',
      expiresAt,
    });

    return token;
  }

  /**
   * Verify email address using token.
   */
  async verifyEmail(token: string): Promise<DbUser | null> {
    const [record] = await this.drizzle.db
      .select()
      .from(verification)
      .where(
        and(
          eq(verification.value, token),
          eq(verification.type, 'email'),
          gt(verification.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!record) return null;

    // Delete the used token
    await this.drizzle.db
      .delete(verification)
      .where(eq(verification.id, record.id));

    // Mark email as verified
    const [foundUser] = await this.drizzle.db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, record.identifier))
      .returning();

    return foundUser ?? null;
  }

  /**
   * Resend email verification token.
   */
  async resendVerificationEmail(email: string): Promise<string | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const foundUser = await this.findUserByEmail(normalizedEmail);

    if (!foundUser) return null;
    if (foundUser.emailVerified) return null; // Already verified

    return this.createEmailVerificationToken(normalizedEmail);
  }

  // ============ MAGIC LINK ============

  async createMagicLink(email: string): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    let foundUser = await this.findUserByEmail(normalizedEmail);

    if (!foundUser) {
      foundUser = await this.createUser({
        email: normalizedEmail,
        name: normalizedEmail.split('@')[0],
      });
    }

    // Delete any existing magic links for this email
    await this.drizzle.db
      .delete(verification)
      .where(
        and(
          eq(verification.identifier, normalizedEmail),
          eq(verification.type, 'magic_link'),
        ),
      );

    // Generate a shorter, URL-safe token (32 chars hex = 128 bits entropy)
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + EMAIL_CONFIG.MAGIC_LINK_EXPIRY);

    await this.drizzle.db.insert(verification).values({
      identifier: normalizedEmail,
      value: token,
      type: 'magic_link',
      expiresAt,
    });

    return token;
  }

  async updateUserRole(userId: string, role: UserRole): Promise<DbUser> {
    const [updated] = await this.drizzle.db
      .update(user)
      .set({ role, onboardingCompleted: true })
      .where(eq(user.id, userId))
      .returning();
    return updated;
  }

  async validateMagicLink(token: string): Promise<DbUser | null> {
    const [record] = await this.drizzle.db
      .select()
      .from(verification)
      .where(
        and(
          eq(verification.value, token),
          eq(verification.type, 'magic_link'),
          gt(verification.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!record) return null;

    await this.drizzle.db
      .delete(verification)
      .where(eq(verification.id, record.id));

    const [foundUser] = await this.drizzle.db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, record.identifier))
      .returning();

    return foundUser ?? null;
  }
}
