import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";

import { UserRole } from "../../../auth/entities/auth.schema";
import { PdfService } from "../../startup/pdf.service";
import { MemoController } from "../memo.controller";
import {
  MemoSectionRegenerationService,
  type RegenerateMemoSectionResult,
} from "../services/memo-section-regeneration.service";

const STARTUP_ID = "11111111-1111-4111-8111-111111111111";

function buildRegenerationResult(): RegenerateMemoSectionResult {
  return {
    startupId: STARTUP_ID,
    sectionKey: "team",
    regeneratedAt: "2026-05-11T12:00:00.000Z",
    usedFallback: false,
    overwroteOperatorEdits: false,
    section: {
      title: "Team",
      content: "Refreshed team narrative.",
      highlights: ["Founder-market fit"],
      concerns: ["Limited depth"],
      sources: [{ label: "deck", url: "deck://" }],
      sectionKey: "team",
      regeneratedAt: "2026-05-11T12:00:00.000Z",
    },
  };
}

async function buildController(
  regenerate: jest.Mock,
): Promise<{
  controller: MemoController;
  verifyAccess: jest.Mock;
}> {
  const verifyAccess = jest.fn().mockResolvedValue(undefined);
  const moduleRef = await Test.createTestingModule({
    controllers: [MemoController],
    providers: [
      {
        provide: MemoSectionRegenerationService,
        useValue: { regenerate },
      },
      {
        provide: PdfService,
        useValue: { verifyAccess },
      },
    ],
  }).compile();
  return {
    controller: moduleRef.get(MemoController),
    verifyAccess,
  };
}

describe("MemoController", () => {
  it("regenerates a section and returns the dto payload", async () => {
    const regenerate = jest.fn().mockResolvedValue(buildRegenerationResult());
    const { controller, verifyAccess } = await buildController(regenerate);

    const out = await controller.regenerateSection(
      { id: "user-1", role: UserRole.INVESTOR },
      STARTUP_ID,
      "team",
    );

    expect(verifyAccess).toHaveBeenCalledWith(STARTUP_ID, "user-1");
    expect(regenerate).toHaveBeenCalledWith(STARTUP_ID, "team");
    expect(out.sectionKey).toBe("team");
    expect(out.section.content).toBe("Refreshed team narrative.");
    expect(out.section.sources).toEqual([{ label: "deck", url: "deck://" }]);
    expect(out.regeneratedAt).toBe("2026-05-11T12:00:00.000Z");
  });

  it("rejects an invalid section key with 404", async () => {
    const regenerate = jest.fn();
    const { controller } = await buildController(regenerate);

    await expect(
      controller.regenerateSection(
        { id: "user-1", role: UserRole.INVESTOR },
        STARTUP_ID,
        "not-a-section",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("propagates errors from the regeneration service", async () => {
    const regenerate = jest
      .fn()
      .mockRejectedValue(new NotFoundException("missing prerequisites"));
    const { controller } = await buildController(regenerate);

    await expect(
      controller.regenerateSection(
        { id: "user-1", role: UserRole.ADMIN },
        STARTUP_ID,
        "market",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
