import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";

import { UserRole } from "../../../auth/entities/auth.schema";
import { PdfService } from "../../startup/pdf.service";
import { MemoController } from "../memo.controller";
import {
  MemoSectionRegenerationService,
  type ApplyOperatorRewriteResult,
  type RegenerateMemoSectionResult,
} from "../services/memo-section-regeneration.service";
import {
  MemoClaimRewriteService,
  type RewriteClaimResult,
} from "../services/memo-claim-rewrite.service";

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

function buildApplyRewriteResult(): ApplyOperatorRewriteResult {
  return {
    startupId: STARTUP_ID,
    sectionKey: "team",
    regeneratedAt: "2026-05-11T13:00:00.000Z",
    overwroteOperatorEdits: false,
    section: {
      title: "Team",
      content: "Operator-edited team narrative.",
      highlights: ["Founder-market fit"],
      concerns: [],
      sources: [{ label: "deck", url: "deck://" }],
      sectionKey: "team",
      regeneratedAt: "2026-05-11T13:00:00.000Z",
    },
  };
}

interface BuildControllerOpts {
  regenerate?: jest.Mock;
  applyOperatorRewrite?: jest.Mock;
  rewriteClaim?: jest.Mock;
}

async function buildController(
  opts: BuildControllerOpts = {},
): Promise<{
  controller: MemoController;
  verifyAccess: jest.Mock;
  regenerate: jest.Mock;
  applyOperatorRewrite: jest.Mock;
  rewriteClaim: jest.Mock;
}> {
  const verifyAccess = jest.fn().mockResolvedValue(undefined);
  const regenerate = opts.regenerate ?? jest.fn();
  const applyOperatorRewrite = opts.applyOperatorRewrite ?? jest.fn();
  const rewriteClaim = opts.rewriteClaim ?? jest.fn();
  const moduleRef = await Test.createTestingModule({
    controllers: [MemoController],
    providers: [
      {
        provide: MemoSectionRegenerationService,
        useValue: { regenerate, applyOperatorRewrite },
      },
      {
        provide: MemoClaimRewriteService,
        useValue: { rewriteClaim },
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
    regenerate,
    applyOperatorRewrite,
    rewriteClaim,
  };
}

describe("MemoController", () => {
  it("regenerates a section and returns the dto payload", async () => {
    const regenerate = jest.fn().mockResolvedValue(buildRegenerationResult());
    const { controller, verifyAccess } = await buildController({ regenerate });

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
    const { controller, regenerate } = await buildController();

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
    const { controller } = await buildController({ regenerate });

    await expect(
      controller.regenerateSection(
        { id: "user-1", role: UserRole.ADMIN },
        STARTUP_ID,
        "market",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("suggestClaimRewrite", () => {
    it("returns rewrite candidates for a valid request", async () => {
      const rewriteResult: RewriteClaimResult = {
        startupId: STARTUP_ID,
        sectionKey: "team",
        originalText: "Two pilots since 2024.",
        rewrites: [
          { text: "Two pilots shipped since 2024.", diff: "edit" },
          { text: "Since 2024, two pilots shipped.", diff: "edit" },
        ],
        candidateCountBeforeFilter: 2,
        usedFallback: false,
      };
      const rewriteClaim = jest.fn().mockResolvedValue(rewriteResult);
      const { controller, verifyAccess } = await buildController({
        rewriteClaim,
      });

      const out = await controller.suggestClaimRewrite(
        { id: "user-1", role: UserRole.INVESTOR },
        STARTUP_ID,
        {
          sectionKey: "team",
          originalText: "Two pilots since 2024.",
          instruction: "shorter",
          sourceIds: ["deck://"],
        },
      );

      expect(verifyAccess).toHaveBeenCalledWith(STARTUP_ID, "user-1");
      expect(rewriteClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          startupId: STARTUP_ID,
          sectionKey: "team",
          sectionTitle: "Team",
          originalText: "Two pilots since 2024.",
          instruction: "shorter",
          sourceIds: ["deck://"],
        }),
      );
      expect(out.rewrites).toHaveLength(2);
      expect(out.candidateCountBeforeFilter).toBe(2);
    });

    it("rejects an unknown sectionKey in the body with 404", async () => {
      const rewriteClaim = jest.fn();
      const { controller } = await buildController({ rewriteClaim });

      await expect(
        controller.suggestClaimRewrite(
          { id: "user-1", role: UserRole.INVESTOR },
          STARTUP_ID,
          {
            sectionKey: "not-a-section",
            originalText: "Hello world.",
          },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(rewriteClaim).not.toHaveBeenCalled();
    });
  });

  describe("applyRewrite", () => {
    it("persists the operator-edited content via the regeneration service", async () => {
      const applyOperatorRewrite = jest
        .fn()
        .mockResolvedValue(buildApplyRewriteResult());
      const { controller, verifyAccess } = await buildController({
        applyOperatorRewrite,
      });

      const out = await controller.applyRewrite(
        { id: "user-1", role: UserRole.INVESTOR },
        STARTUP_ID,
        "team",
        { newContent: "Operator-edited team narrative." },
      );

      expect(verifyAccess).toHaveBeenCalledWith(STARTUP_ID, "user-1");
      expect(applyOperatorRewrite).toHaveBeenCalledWith(
        STARTUP_ID,
        "team",
        expect.objectContaining({
          newContent: "Operator-edited team narrative.",
        }),
      );
      expect(out.section.content).toBe("Operator-edited team narrative.");
      expect(out.section.sources).toEqual([{ label: "deck", url: "deck://" }]);
      expect(out.regeneratedAt).toBe("2026-05-11T13:00:00.000Z");
    });

    it("rejects an unknown section key with 404", async () => {
      const applyOperatorRewrite = jest.fn();
      const { controller } = await buildController({ applyOperatorRewrite });

      await expect(
        controller.applyRewrite(
          { id: "user-1", role: UserRole.INVESTOR },
          STARTUP_ID,
          "not-a-section",
          { newContent: "anything" },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(applyOperatorRewrite).not.toHaveBeenCalled();
    });
  });
});
