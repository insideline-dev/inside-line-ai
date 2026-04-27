import { Injectable } from "@nestjs/common";
import { eq, or } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { user } from "../../../auth/entities/auth.schema";
import { startup } from "../../startup/entities/startup.schema";
import { evolutionWhatsappLink } from "./entities/evolution-whatsapp-link.schema";
import { normalizeWhatsAppPhone } from "./evolution-phone.util";

export interface EvolutionKnownContact {
  phone: string;
  email: string;
  name: string | null;
  userId: string | null;
  role: string | null;
  startupId: string | null;
}

@Injectable()
export class EvolutionContactResolverService {
  constructor(private readonly drizzle: DrizzleService) {}

  async resolveByPhone(phone: string): Promise<EvolutionKnownContact | null> {
    const normalized = normalizeWhatsAppPhone(phone);
    if (!normalized) return null;

    const [startupContact] = await this.drizzle.db
      .select({
        startupId: startup.id,
        userId: startup.userId,
        email: startup.contactEmail,
        name: startup.contactName,
        contactPhone: startup.contactPhone,
        contactPhoneCountryCode: startup.contactPhoneCountryCode,
      })
      .from(startup)
      .where(
        or(
          eq(startup.contactPhone, normalized),
          eq(startup.contactPhone, normalized.slice(1)),
        ),
      )
      .limit(1);

    if (startupContact?.email) {
      const [linkedUser] = await this.drizzle.db
        .select({ id: user.id, role: user.role, name: user.name })
        .from(user)
        .where(eq(user.email, startupContact.email))
        .limit(1);

      return {
        phone: normalized,
        email: startupContact.email,
        name: startupContact.name ?? linkedUser?.name ?? null,
        userId: linkedUser?.id ?? startupContact.userId ?? null,
        role: linkedUser?.role ?? null,
        startupId: startupContact.startupId,
      };
    }

    const [linkedContact] = await this.drizzle.db
      .select({
        email: evolutionWhatsappLink.email,
        userId: evolutionWhatsappLink.userId,
        startupId: evolutionWhatsappLink.startupId,
        userName: user.name,
        userRole: user.role,
      })
      .from(evolutionWhatsappLink)
      .leftJoin(user, eq(user.id, evolutionWhatsappLink.userId))
      .where(eq(evolutionWhatsappLink.phone, normalized))
      .limit(1);

    if (!linkedContact) return null;

    return {
      phone: normalized,
      email: linkedContact.email,
      name: linkedContact.userName ?? null,
      userId: linkedContact.userId,
      role: linkedContact.userRole,
      startupId: linkedContact.startupId,
    };
  }
}
