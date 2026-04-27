export function normalizeWhatsAppPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutProtocol = value
    .replace(/^whatsapp:/i, "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@c\.us$/i, "");
  const digits = withoutProtocol.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function toEvolutionNumber(phone: string): string {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) {
    throw new Error(`Invalid WhatsApp phone number: ${phone}`);
  }
  return normalized.slice(1);
}
