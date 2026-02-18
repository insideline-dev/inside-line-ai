import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { DrizzleService } from "../../database";
import { EmailService } from "../../email/email.service";
import { user, UserRole } from "../../auth/entities/auth.schema";
import {
  earlyAccessInvite,
  type EarlyAccessInvite,
  waitlistEntry,
} from "./entities";
import type {
  CreateEarlyAccessInvite,
  JoinWaitlist,
  EarlyAccessInviteResponse,
  WaitlistEntryResponse,
  RedeemInviteResponse,
} from "./dto";

const DEFAULT_INVITE_EXPIRY_DAYS = 7;

@Injectable()
export class EarlyAccessService {
  constructor(
    private drizzle: DrizzleService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  async assertEmailAllowed(email: string): Promise<void> {
    const allowed = await this.isEmailAllowed(email);
    if (!allowed) {
      throw new ForbiddenException(
        "You're not on the early-access list yet. Join the waitlist to request access.",
      );
    }
  }

  async isEmailAllowed(email: string): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);

    const [adminUser] = await this.drizzle.db
      .select({ id: user.id })
      .from(user)
      .where(
        and(eq(user.email, normalizedEmail), eq(user.role, UserRole.ADMIN)),
      )
      .limit(1);

    if (adminUser) {
      return true;
    }

    const [invite] = await this.drizzle.db
      .select({ id: earlyAccessInvite.id })
      .from(earlyAccessInvite)
      .where(
        and(
          eq(earlyAccessInvite.email, normalizedEmail),
          eq(earlyAccessInvite.status, "redeemed"),
        ),
      )
      .limit(1);

    return Boolean(invite);
  }

  async createInvite(
    adminUserId: string,
    dto: CreateEarlyAccessInvite,
  ): Promise<EarlyAccessInviteResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const expiryDays = dto.expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS;

    const [pendingInvite] = await this.drizzle.db
      .select()
      .from(earlyAccessInvite)
      .where(
        and(
          eq(earlyAccessInvite.email, normalizedEmail),
          eq(earlyAccessInvite.status, "pending"),
          gt(earlyAccessInvite.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (pendingInvite) {
      throw new BadRequestException(
        "A pending invite already exists for this email",
      );
    }

    const rawToken = randomBytes(24).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const [created] = await this.drizzle.db
      .insert(earlyAccessInvite)
      .values({
        email: normalizedEmail,
        tokenHash,
        role: dto.role ?? UserRole.FOUNDER,
        status: "pending",
        expiresAt,
        createdByUserId: adminUserId,
      })
      .returning();

    const mapped = this.mapInvite(created, rawToken);

    if (mapped.inviteUrl) {
      await this.sendInviteEmail(normalizedEmail, mapped.inviteUrl, expiryDays);
    }

    return mapped;
  }

  async listInvites(): Promise<EarlyAccessInviteResponse[]> {
    const invites = await this.drizzle.db
      .select()
      .from(earlyAccessInvite)
      .orderBy(desc(earlyAccessInvite.createdAt));

    return invites.map((invite) => this.mapInvite(invite));
  }

  async revokeInvite(id: string): Promise<void> {
    const [invite] = await this.drizzle.db
      .select()
      .from(earlyAccessInvite)
      .where(eq(earlyAccessInvite.id, id))
      .limit(1);

    if (!invite) {
      throw new NotFoundException("Invite not found");
    }

    if (invite.status !== "pending") {
      throw new BadRequestException("Only pending invites can be revoked");
    }

    await this.drizzle.db
      .update(earlyAccessInvite)
      .set({ status: "revoked" })
      .where(eq(earlyAccessInvite.id, id));
  }

  async redeemInviteToken(token: string): Promise<RedeemInviteResponse> {
    const tokenHash = this.hashToken(token);

    const [invite] = await this.drizzle.db
      .select()
      .from(earlyAccessInvite)
      .where(eq(earlyAccessInvite.tokenHash, tokenHash))
      .limit(1);

    if (!invite) {
      throw new UnauthorizedException("Invalid invitation link");
    }

    if (invite.status === "redeemed") {
      return {
        message: "Invitation already redeemed",
        email: invite.email,
      };
    }

    if (invite.status !== "pending") {
      throw new BadRequestException("Invitation is no longer active");
    }

    if (invite.expiresAt < new Date()) {
      await this.drizzle.db
        .update(earlyAccessInvite)
        .set({ status: "expired" })
        .where(eq(earlyAccessInvite.id, invite.id));

      throw new BadRequestException("Invitation link has expired");
    }

    await this.drizzle.db
      .update(earlyAccessInvite)
      .set({
        status: "redeemed",
        redeemedAt: new Date(),
      })
      .where(eq(earlyAccessInvite.id, invite.id));

    return {
      message: "Invitation redeemed successfully",
      email: invite.email,
    };
  }

  async joinWaitlist(data: JoinWaitlist): Promise<void> {
    const normalizedEmail = this.normalizeEmail(data.email);

    await this.drizzle.db
      .insert(waitlistEntry)
      .values({
        name: data.name.trim(),
        email: normalizedEmail,
        companyName: data.companyName.trim(),
        role: data.role.trim(),
        website: data.website.trim(),
        consentToShareInfo: data.consentToShareInfo,
        consentToEarlyAccess: data.consentToEarlyAccess,
      })
      .onConflictDoUpdate({
        target: waitlistEntry.email,
        set: {
          name: data.name.trim(),
          companyName: data.companyName.trim(),
          role: data.role.trim(),
          website: data.website.trim(),
          consentToShareInfo: data.consentToShareInfo,
          consentToEarlyAccess: data.consentToEarlyAccess,
          updatedAt: new Date(),
        },
      });
  }

  async addFounderFromGoogleAttempt(params: {
    name: string;
    email: string;
  }): Promise<void> {
    const normalizedEmail = this.normalizeEmail(params.email);
    const normalizedName = params.name.trim() || normalizedEmail.split("@")[0];

    await this.drizzle.db
      .insert(waitlistEntry)
      .values({
        name: normalizedName,
        email: normalizedEmail,
        companyName: "Not provided",
        role: "Founder",
        website: "",
        consentToShareInfo: false,
        consentToEarlyAccess: false,
      })
      .onConflictDoNothing({ target: waitlistEntry.email });
  }

  async approveWaitlistEntry(
    id: string,
    adminUserId: string,
  ): Promise<EarlyAccessInviteResponse> {
    const [entry] = await this.drizzle.db
      .select()
      .from(waitlistEntry)
      .where(eq(waitlistEntry.id, id))
      .limit(1);

    if (!entry) {
      throw new NotFoundException("Waitlist entry not found");
    }

    const roleMap: Record<string, UserRole.FOUNDER | UserRole.INVESTOR | UserRole.SCOUT> = {
      founder: UserRole.FOUNDER,
      investor: UserRole.INVESTOR,
      scout: UserRole.SCOUT,
    };
    const mappedRole =
      roleMap[entry.role.toLowerCase()] ?? UserRole.FOUNDER;

    const invite = await this.createInvite(adminUserId, {
      email: entry.email,
      role: mappedRole,
      expiresInDays: DEFAULT_INVITE_EXPIRY_DAYS,
    });

    await this.drizzle.db
      .delete(waitlistEntry)
      .where(eq(waitlistEntry.id, id));

    return invite;
  }

  async listWaitlist(): Promise<WaitlistEntryResponse[]> {
    const entries = await this.drizzle.db
      .select()
      .from(waitlistEntry)
      .orderBy(desc(waitlistEntry.createdAt));

    return entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      companyName: entry.companyName,
      role: entry.role,
      website: entry.website,
      consentToShareInfo: entry.consentToShareInfo,
      consentToEarlyAccess: entry.consentToEarlyAccess,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    }));
  }

  async bindRedeemedInviteToUser(userId: string, email: string): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);

    const [invite] = await this.drizzle.db
      .select({ id: earlyAccessInvite.id, role: earlyAccessInvite.role })
      .from(earlyAccessInvite)
      .where(
        and(
          eq(earlyAccessInvite.email, normalizedEmail),
          eq(earlyAccessInvite.status, "redeemed"),
          isNull(earlyAccessInvite.redeemedByUserId),
        ),
      )
      .orderBy(desc(earlyAccessInvite.createdAt))
      .limit(1);

    if (!invite) {
      return;
    }

    await this.drizzle.db.transaction(async (tx) => {
      await tx
        .update(earlyAccessInvite)
        .set({ redeemedByUserId: userId })
        .where(eq(earlyAccessInvite.id, invite.id));

      if (
        invite.role === UserRole.FOUNDER ||
        invite.role === UserRole.INVESTOR ||
        invite.role === UserRole.SCOUT
      ) {
        await tx
          .update(user)
          .set({
            role: invite.role,
            onboardingCompleted: true,
          })
          .where(and(eq(user.id, userId), eq(user.onboardingCompleted, false)));
      }
    });
  }

  private mapInvite(
    invite: EarlyAccessInvite,
    rawToken?: string,
  ): EarlyAccessInviteResponse {
    const frontendUrl = this.config.get<string>("FRONTEND_URL") || "http://localhost:3030";
    const inviteRole =
      invite.role === UserRole.INVESTOR
        ? UserRole.INVESTOR
        : invite.role === UserRole.SCOUT
          ? UserRole.SCOUT
          : UserRole.FOUNDER;

    return {
      id: invite.id,
      email: invite.email,
      role: inviteRole,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      redeemedAt: invite.redeemedAt ? invite.redeemedAt.toISOString() : null,
      createdAt: invite.createdAt.toISOString(),
      inviteUrl: rawToken
        ? `${frontendUrl}/login?invite=${encodeURIComponent(rawToken)}`
        : undefined,
    };
  }

  private async sendInviteEmail(
    to: string,
    inviteUrl: string,
    expiryDays: number,
  ): Promise<void> {
    const appName =
      this.config.get<string>("APP_NAME") || "Inside Line";

    await this.emailService.send({
      to,
      subject: `You've been invited to ${appName}`,
      html: this.getInviteTemplate(inviteUrl, expiryDays, appName),
      text: `You've been invited to join ${appName}! Click the link to get started: ${inviteUrl} — This link expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}.`,
    });
  }

  private getInviteTemplate(
    inviteUrl: string,
    expiryDays: number,
    appName: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 20px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b;">You're invited to ${appName}</h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #52525b;">
                You've been granted early access. Click below to create your account and get started.
              </p>
              <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #18181b; text-decoration: none; border-radius: 8px;">
                Accept Invitation
              </a>
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                This invitation expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}. If you weren't expecting this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                If the button doesn't work, copy and paste this link:<br>
                <a href="${inviteUrl}" style="color: #3b82f6; word-break: break-all;">${inviteUrl}</a>
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

  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
