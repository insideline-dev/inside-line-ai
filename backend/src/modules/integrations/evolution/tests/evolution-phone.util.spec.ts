import { describe, expect, it } from "bun:test";
import { normalizeWhatsAppPhone, toEvolutionNumber } from "../evolution-phone.util";

describe("evolution phone utilities", () => {
  it("normalizes WhatsApp protocol and JID phone values", () => {
    expect(normalizeWhatsAppPhone("whatsapp:+15551234567")).toBe("+15551234567");
    expect(normalizeWhatsAppPhone("15551234567@s.whatsapp.net")).toBe("+15551234567");
    expect(normalizeWhatsAppPhone("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("returns null for invalid values", () => {
    expect(normalizeWhatsAppPhone(null)).toBeNull();
    expect(normalizeWhatsAppPhone("abc")).toBeNull();
    expect(normalizeWhatsAppPhone("123")).toBeNull();
  });

  it("converts E.164 phone numbers to Evolution API numbers", () => {
    expect(toEvolutionNumber("+15551234567")).toBe("15551234567");
  });
});
