import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uuid,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

/**
 * User Role Enum
 * Defines the available roles in the system
 */
export enum UserRole {
  FOUNDER = "founder",
  INVESTOR = "investor",
  ADMIN = "admin",
  SCOUT = "scout",
}

/**
 * PostgreSQL enum type for user roles
 */
export const userRoleEnum = pgEnum("user_role", [
  UserRole.FOUNDER,
  UserRole.INVESTOR,
  UserRole.ADMIN,
  UserRole.SCOUT,
]);

/**
 * SECURITY: Role Management Model
 *
 * This schema implements a hierarchical role system:
 * - 'founder': Startup founder (default role)
 * - 'investor': Investor with access to startup data
 * - 'scout': Startup scout with submission capabilities
 * - 'admin': Administrator with full system access
 *
 * CRITICAL SECURITY RULES:
 * 1. Roles MUST ONLY be changed via admin module endpoints
 * 2. No API endpoint can accept 'role' in user input DTOs
 * 3. RLS policies grant admins full access: isOwnerOrAdmin checks apply
 *
 * Column-Level RLS:
 * PostgreSQL doesn't support column-level RLS natively, so we enforce
 * column-level protection at the application layer:
 * - UpdateProfileSchema intentionally excludes 'role' field
 *
 * If you add new endpoints that modify user data:
 * - NEVER accept 'role' in the request body
 * - ALWAYS validate at the service layer
 * - NEVER allow users to update their own role
 */

export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    role: userRoleEnum("role").default(UserRole.FOUNDER).notNull(),
    onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [],
);

// NOTE: Session table removed - using stateless JWT tokens instead

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // CRITICAL: Prevents duplicate OAuth accounts (same provider + account combo)
    uniqueIndex("account_provider_accountId_idx").on(
      table.providerId,
      table.accountId,
    ),
    index("account_userId_idx").on(table.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    // Type: 'email' for email verification, 'magic_link' for passwordless login
    type: text("type", { enum: ["email", "magic_link"] })
      .default("magic_link")
      .notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// Refresh token storage for token rotation
export const refreshToken = pgTable(
  "refresh_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    // Family ID for detecting token reuse attacks
    family: text("family").notNull(),
    // Whether this token has been used (rotated)
    used: boolean("used").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("refresh_token_userId_idx").on(table.userId),
    index("refresh_token_family_idx").on(table.family),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  refreshTokens: many(refreshToken),
}));

export const refreshTokenRelations = relations(refreshToken, ({ one }) => ({
  user: one(user, {
    fields: [refreshToken.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

