import { describe, expect, it, mock } from "bun:test";
import { EvolutionLinkingService } from "../evolution-linking.service";

const createChain = <T>(result: T) => {
  const chain = {
    values: mock(() => chain),
    set: mock(() => chain),
    from: mock(() => chain),
    leftJoin: mock(() => chain),
    where: mock(() => chain),
    limit: mock(async () => result),
    returning: mock(async () => result),
    onConflictDoUpdate: mock(async () => result),
  };
  return chain;
};

const platformUser = {
  id: "user-1",
  email: "founder@example.com",
  name: "Founder",
  role: "founder",
};

describe("EvolutionLinkingService", () => {
  it("asks unknown WhatsApp users for their Inside Line email", async () => {
    const sendText = mock(async () => ({ status: "ok" }));
    const service = new EvolutionLinkingService(
      { db: {} } as never,
      { send: mock(async () => ({ id: "email-1" })) } as never,
      { sendText } as never,
    );

    const result = await service.handleUnknownContact({ phone: "+212682860421", text: "Hi" });

    expect(result).toEqual({ processed: true, reason: "link_email_requested" });
    expect(sendText).toHaveBeenCalledWith({
      to: "+212682860421",
      text: "Hi, this WhatsApp number is not linked yet. Please reply with the email you use on Inside Line.",
    });
  });

  it("does not send a code for unknown platform emails", async () => {
    const db = {
      delete: mock(() => createChain([])),
      select: mock(() => createChain([])),
    };
    const send = mock(async () => ({ id: "email-1" }));
    const sendText = mock(async () => ({ status: "ok" }));
    const service = new EvolutionLinkingService(
      { db } as never,
      { send } as never,
      { sendText } as never,
    );

    const result = await service.handleUnknownContact({ phone: "+212682860421", text: "missing@example.com" });

    expect(result).toEqual({ processed: true, reason: "link_code_sent" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a code to an existing platform user email", async () => {
    const db = {
      delete: mock(() => createChain([])),
      insert: mock(() => createChain([])),
      select: mock()
        .mockImplementationOnce(() => createChain([platformUser]))
        .mockImplementationOnce(() => createChain([{ email: "founder@example.com", name: "Founder", startupId: "startup-1", startupUserId: "user-1" }])),
    };
    const send = mock(async () => ({ id: "email-1" }));
    const sendText = mock(async () => ({ status: "ok" }));
    const service = new EvolutionLinkingService(
      { db } as never,
      { send } as never,
      { sendText } as never,
    );

    const result = await service.handleUnknownContact({ phone: "+212682860421", text: "founder@example.com" });

    expect(result).toEqual({ processed: true, reason: "link_code_sent" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "founder@example.com" }));
    expect(sendText).toHaveBeenCalledWith({
      to: "+212682860421",
      text: "If that email exists on Inside Line, I sent it a 6-digit verification code. Reply here with only the code.",
    });
  });

  it("still sends a code when one user email matches multiple startups", async () => {
    const db = {
      delete: mock(() => createChain([])),
      insert: mock(() => createChain([])),
      select: mock()
        .mockImplementationOnce(() => createChain([platformUser]))
        .mockImplementationOnce(() => createChain([
          { email: "founder@example.com", startupId: "startup-1" },
          { email: "founder@example.com", startupId: "startup-2" },
        ])),
    };
    const send = mock(async () => ({ id: "email-1" }));
    const sendText = mock(async () => ({ status: "ok" }));
    const service = new EvolutionLinkingService(
      { db } as never,
      { send } as never,
      { sendText } as never,
    );

    const result = await service.handleUnknownContact({ phone: "+212682860421", text: "founder@example.com" });

    expect(result).toEqual({ processed: true, reason: "link_code_sent" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "founder@example.com" }));
  });
});
