import { Injectable, Logger } from "@nestjs/common";
import { randomInt, createHash } from "crypto";
import { and, eq, gt, or } from "drizzle-orm";
import { user, verification } from "../../../auth/entities/auth.schema";
import { DrizzleService } from "../../../database";
import { EmailService } from "../../../email/email.service";
import { startup } from "../../startup/entities/startup.schema";
import { evolutionWhatsappLink } from "./entities/evolution-whatsapp-link.schema";
import { EvolutionApiClientService } from "./evolution-api-client.service";
import type { EvolutionKnownContact } from "./evolution-contact-resolver.service";

const CODE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class EvolutionLinkingService {
  private readonly logger = new Logger(EvolutionLinkingService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly email: EmailService,
    private readonly apiClient: EvolutionApiClientService,
  ) {}

  async resolveLinkedContact(phone: string): Promise<EvolutionKnownContact | null> {
    const [link] = await this.drizzle.db
      .select({
        phone: evolutionWhatsappLink.phone,
        email: evolutionWhatsappLink.email,
        userId: evolutionWhatsappLink.userId,
        startupId: evolutionWhatsappLink.startupId,
        userName: user.name,
        userRole: user.role,
        startupName: startup.contactName,
      })
      .from(evolutionWhatsappLink)
      .leftJoin(user, eq(user.id, evolutionWhatsappLink.userId))
      .leftJoin(startup, eq(startup.id, evolutionWhatsappLink.startupId))
      .where(eq(evolutionWhatsappLink.phone, phone))
      .limit(1);

    if (!link) return null;

    return {
      phone: link.phone,
      email: link.email,
      name: link.startupName ?? link.userName ?? null,
      userId: link.userId,
      role: link.userRole,
      startupId: link.startupId,
    };
  }

  async handleUnknownContact(params: {
    phone: string;
    text: string | null;
  }): Promise<{ processed: boolean; reason: string; contact?: EvolutionKnownContact }> {
    const text = params.text?.trim() ?? "";

    if (/^\d{6}$/.test(text)) {
      const contact = await this.verifyCode(params.phone, text);
      if (!contact) {
        await this.sendWhatsApp(params.phone, "That code is invalid or expired. Please send your Inside Line email again to get a new code.");
        return { processed: true, reason: "invalid_link_code" };
      }

      return { processed: true, reason: "linked_contact" };
    }

    if (this.isEmail(text)) {
      await this.startEmailVerification(params.phone, text);
      await this.sendWhatsApp(params.phone, "If that email exists on Inside Line, I sent it a 6-digit verification code. Reply here with only the code.");
      return { processed: true, reason: "link_code_sent" };
    }

    await this.sendWhatsApp(params.phone, "Hi, this WhatsApp number is not linked yet. Please reply with the email you use on Inside Line.");
    return { processed: true, reason: "link_email_requested" };
  }

  private async startEmailVerification(phone: string, rawEmail: string): Promise<void> {
    const email = rawEmail.toLowerCase().trim();
    const target = await this.findLinkTarget(email);
    await this.drizzle.db
      .delete(verification)
      .where(and(eq(verification.identifier, this.identifier(phone)), eq(verification.type, "whatsapp_link")));

    if (!target) {
      this.logger.warn(`WhatsApp link requested for unknown platform email ${email} from ${phone}`);
      return;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await this.drizzle.db.insert(verification).values({
      identifier: this.identifier(phone),
      value: this.hashCode(phone, email, code),
      type: "whatsapp_link",
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

    this.logger.log(`Sending WhatsApp link verification code to ${email} for ${phone}`);
    const result = await this.email.send({
      to: email,
      subject: "Your Clara WhatsApp verification code",
      html: `<p>Your Clara WhatsApp verification code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      text: `Your Clara WhatsApp verification code is ${code}. This code expires in 10 minutes.`,
    });

    if (result) {
      this.logger.log(`WhatsApp link verification email sent to ${email}: ${result.id}`);
    } else {
      this.logger.error(`Failed to send WhatsApp link verification email to ${email}`);
    }
  }

  private async verifyCode(phone: string, code: string): Promise<EvolutionKnownContact | null> {
    const [record] = await this.drizzle.db
      .select()
      .from(verification)
      .where(and(eq(verification.identifier, this.identifier(phone)), eq(verification.type, "whatsapp_link"), gt(verification.expiresAt, new Date())))
      .limit(1);

    if (!record) return null;

    const [, email] = record.value.split(":", 2);
    if (!email || record.value !== this.hashCode(phone, email, code)) return null;

    const target = await this.findLinkTarget(email);
    if (!target) return null;

    await this.drizzle.db.delete(verification).where(eq(verification.id, record.id));
    await this.drizzle.db.transaction(async (tx) => {
      await tx
        .insert(evolutionWhatsappLink)
        .values({
          phone,
          email,
          userId: target.userId,
          startupId: target.startupId,
        })
        .onConflictDoUpdate({
          target: evolutionWhatsappLink.phone,
          set: {
            email,
            userId: target.userId,
            startupId: target.startupId,
            updatedAt: new Date(),
          },
        });

      if (target.startupId) {
        await tx
          .update(startup)
          .set({ contactPhone: phone })
          .where(eq(startup.id, target.startupId));
      }
    });

    return {
      phone,
      email,
      name: target.name,
      userId: target.userId,
      role: target.role,
      startupId: target.startupId,
    };
  }

  private async findLinkTarget(email: string): Promise<{
    email: string;
    name: string | null;
    userId: string | null;
    role: string | null;
    startupId: string | null;
  } | null> {
    const [platformUser] = await this.drizzle.db
      .select({ id: user.id, email: user.email, name: user.name, role: user.role })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (!platformUser) return null;

    const startups = await this.drizzle.db
      .select({
        email: startup.contactEmail,
        name: startup.contactName,
        startupId: startup.id,
        startupUserId: startup.userId,
      })
      .from(startup)
      .where(or(eq(startup.contactEmail, email), eq(startup.userId, platformUser.id)))
      .limit(2);

    if (startups.length > 1) {
      this.logger.warn(`WhatsApp link email ${email} matched multiple startups; refusing automatic startup phone update`);
      return {
        email: platformUser.email,
        name: platformUser.name,
        userId: platformUser.id,
        role: platformUser.role,
        startupId: null,
      };
    }

    const matchedStartup = startups[0];
    return {
      email: platformUser.email,
      name: matchedStartup?.name ?? platformUser.name,
      userId: platformUser.id,
      role: platformUser.role,
      startupId: matchedStartup?.startupId ?? null,
    };
  }

  private async sendWhatsApp(to: string, text: string): Promise<void> {
    try {
      await this.apiClient.sendText({ to, text });
    } catch (error) {
      this.logger.warn(`Failed to send WhatsApp linking message to ${to}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private hashCode(phone: string, email: string, code: string): string {
    const normalizedEmail = email.toLowerCase().trim();
    const digest = createHash("sha256").update(`${phone}:${normalizedEmail}:${code}`).digest("hex");
    return `${phone}:${normalizedEmail}:${digest}`;
  }

  private identifier(phone: string): string {
    return `whatsapp:${phone}`;
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}
