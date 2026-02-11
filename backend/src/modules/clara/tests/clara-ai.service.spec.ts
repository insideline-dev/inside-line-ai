import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateTextMock = jest.fn();

mock.module("ai", () => ({
  generateText: generateTextMock,
  Output: { object: ({ schema }: { schema: unknown }) => schema },
}));

import { ClaraAiService } from "../clara-ai.service";
import { AiProviderService } from "../../ai/providers/ai-provider.service";
import { ModelPurpose } from "../../ai/interfaces/pipeline.interface";
import { AiPromptService } from "../../ai/services/ai-prompt.service";
import {
  ClaraIntent,
  ConversationStatus,
  MessageDirection,
  type MessageContext,
  type IntentClassification,
} from "../interfaces/clara.interface";

function createTestContext(
  overrides: Partial<MessageContext> = {},
): MessageContext {
  return {
    threadId: "thread-123",
    messageId: "msg-456",
    inboxId: "inbox-789",
    subject: "Pitch Deck Submission",
    bodyText: "Please review our startup",
    fromEmail: "founder@startup.com",
    fromName: "Jane Founder",
    attachments: [],
    conversationHistory: [],
    investorUserId: null,
    startupId: null,
    conversationStatus: ConversationStatus.ACTIVE,
    ...overrides,
  };
}

describe("ClaraAiService", () => {
  let service: ClaraAiService;
  let providers: jest.Mocked<AiProviderService>;
  let promptService: jest.Mocked<AiPromptService>;
  const resolvedModel = { providerModel: "test-model" };

  beforeEach(() => {
    generateTextMock.mockReset();

    providers = {
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;
    promptService = {
      resolve: jest.fn().mockImplementation(({ key }: { key: string }) =>
        Promise.resolve(
          key === "clara.intent"
            ? {
                key: "clara.intent",
                stage: null,
                systemPrompt: "You are Clara",
                userPrompt:
                  "You are Clara\nFrom: {{fromEmail}}\nSubject: {{subject}}\nBody: {{body}}\nAttachments: {{attachments}}\nHas linked startup: {{hasLinkedStartup}}\n{{historyBlock}}",
                source: "code",
                revisionId: null,
              }
            : {
                key: "clara.response",
                stage: null,
                systemPrompt: "You are Clara",
                userPrompt:
                  "You are Clara\nWrite a concise email reply.\nInvestor name: {{investorName}}\nIntent: {{intent}}\n{{startupBlock}}\n{{intentInstructions}}\n{{historyBlock}}",
                source: "code",
                revisionId: null,
              },
        ),
      ),
      renderTemplate: jest.fn().mockImplementation((template: string, vars: Record<string, string | number>) => {
        let rendered = template;
        for (const [key, value] of Object.entries(vars)) {
          rendered = rendered.replaceAll(`{{${key}}}`, String(value));
        }
        return rendered;
      }),
    } as unknown as jest.Mocked<AiPromptService>;

    service = new ClaraAiService(providers, promptService);
  });

  describe("classifyIntent - heuristic classification", () => {
    it("classifies PDF attachment with new conversation as SUBMISSION", async () => {
      const ctx = createTestContext({
        attachments: [
          {
            filename: "acme-pitch-deck.pdf",
            contentType: "application/pdf",
            attachmentId: "att-1",
            isPitchDeck: true,
            status: "downloaded",
          },
        ],
        conversationHistory: [],
      });

      const result = await service.classifyIntent(ctx);

      expect(result.intent).toBe(ClaraIntent.SUBMISSION);
      expect(result.confidence).toBe(0.95);
      expect(result.reasoning).toBe("New conversation with PDF attachment");
      expect(result.extractedCompanyName).toBe("acme");
      expect(generateTextMock).not.toHaveBeenCalled();
    });

    it("classifies pitch deck attachment with new conversation as SUBMISSION", async () => {
      const ctx = createTestContext({
        attachments: [
          {
            filename: "startup-pitch.pptx",
            contentType: "application/vnd.ms-powerpoint",
            attachmentId: "att-1",
            isPitchDeck: true,
            status: "downloaded",
          },
        ],
        conversationHistory: [],
      });

      const result = await service.classifyIntent(ctx);

      expect(result.intent).toBe(ClaraIntent.SUBMISSION);
      expect(result.confidence).toBe(0.95);
      expect(result.reasoning).toBe("New conversation with PDF attachment");
      expect(result.extractedCompanyName).toBe("startup pitch");
      expect(generateTextMock).not.toHaveBeenCalled();
    });

    it("classifies existing thread with startupId and report keyword as REPORT_REQUEST", async () => {
      const ctx = createTestContext({
        bodyText: "Can you send me the investment memo?",
        startupId: "startup-123",
        conversationHistory: [
          {
            direction: MessageDirection.INBOUND,
            bodyText: "Previous message",
            subject: null,
            intent: ClaraIntent.SUBMISSION,
            createdAt: new Date(),
          },
        ],
      });

      const result = await service.classifyIntent(ctx);

      expect(result.intent).toBe(ClaraIntent.REPORT_REQUEST);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe(
        "Existing thread with report/memo keywords",
      );
      expect(generateTextMock).not.toHaveBeenCalled();
    });

    it("classifies existing thread with startupId and memo keyword as REPORT_REQUEST", async () => {
      const ctx = createTestContext({
        bodyText: "Where is my report?",
        startupId: "startup-123",
        conversationHistory: [
          {
            direction: MessageDirection.INBOUND,
            bodyText: "Previous message",
            subject: null,
            intent: ClaraIntent.SUBMISSION,
            createdAt: new Date(),
          },
        ],
      });

      const result = await service.classifyIntent(ctx);

      expect(result.intent).toBe(ClaraIntent.REPORT_REQUEST);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe(
        "Existing thread with report/memo keywords",
      );
    });

    it("classifies existing thread with startupId and pdf keyword as REPORT_REQUEST", async () => {
      const ctx = createTestContext({
        bodyText: "Can I download the PDF analysis?",
        startupId: "startup-123",
        conversationHistory: [
          {
            direction: MessageDirection.INBOUND,
            bodyText: "Previous message",
            subject: null,
            intent: ClaraIntent.SUBMISSION,
            createdAt: new Date(),
          },
        ],
      });

      const result = await service.classifyIntent(ctx);

      expect(result.intent).toBe(ClaraIntent.REPORT_REQUEST);
      expect(result.confidence).toBe(0.85);
    });

    it("classifies existing thread with startupId without report keywords as FOLLOW_UP", async () => {
      const ctx = createTestContext({
        bodyText: "Thanks for the update!",
        startupId: "startup-123",
        conversationHistory: [
          {
            direction: MessageDirection.INBOUND,
            bodyText: "Previous message",
            subject: null,
            intent: ClaraIntent.SUBMISSION,
            createdAt: new Date(),
          },
        ],
      });

      const result = await service.classifyIntent(ctx);

      expect(result.intent).toBe(ClaraIntent.FOLLOW_UP);
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe(
        "Reply in existing thread with linked startup",
      );
      expect(generateTextMock).not.toHaveBeenCalled();
    });
  });

  describe("classifyIntent - AI classification", () => {
    it("uses AI classification when no heuristic matches", async () => {
      const ctx = createTestContext({
        bodyText: "What can you help me with?",
        conversationHistory: [],
      });

      const aiClassification: IntentClassification = {
        intent: ClaraIntent.GREETING,
        confidence: 0.92,
        reasoning: "User asking about capabilities",
      };

      generateTextMock.mockResolvedValue({
        output: aiClassification,
      });

      const result = await service.classifyIntent(ctx);

      expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
        ModelPurpose.EXTRACTION,
      );
      expect(generateTextMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual(aiClassification);

      const callArgs = generateTextMock.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.1);
      expect(callArgs.prompt).toContain("You are Clara");
      expect(callArgs.prompt).toContain("From: founder@startup.com");
      expect(callArgs.prompt).toContain("What can you help me with?");
    });

    it("includes conversation history in AI classification prompt", async () => {
      const ctx = createTestContext({
        bodyText: "What's the status?",
        conversationHistory: [
          {
            direction: MessageDirection.INBOUND,
            bodyText: "I submitted a pitch deck yesterday",
            subject: "Startup submission",
            intent: ClaraIntent.SUBMISSION,
            createdAt: new Date("2024-01-01"),
          },
          {
            direction: MessageDirection.OUTBOUND,
            bodyText: "Thanks! Analysis is underway.",
            subject: null,
            intent: ClaraIntent.SUBMISSION,
            createdAt: new Date("2024-01-01"),
          },
        ],
      });

      generateTextMock.mockResolvedValue({
        output: {
          intent: ClaraIntent.QUESTION,
          confidence: 0.88,
          reasoning: "User asking about status",
        },
      });

      await service.classifyIntent(ctx);

      const callArgs = generateTextMock.mock.calls[0][0];
      expect(callArgs.prompt).toContain("Conversation history:");
      expect(callArgs.prompt).toContain("[inbound]");
      expect(callArgs.prompt).toContain("I submitted a pitch deck");
      expect(callArgs.prompt).toContain("[outbound]");
    });

    it("falls back to GREETING on AI classification error", async () => {
      const ctx = createTestContext({
        bodyText: "Hello there",
      });

      generateTextMock.mockRejectedValue(new Error("AI provider timeout"));

      const result = await service.classifyIntent(ctx);

      expect(result.intent).toBe(ClaraIntent.GREETING);
      expect(result.confidence).toBe(0.3);
      expect(result.reasoning).toBe("Fallback due to classification error");
    });
  });

  describe("generateResponse", () => {
    it("generates SUBMISSION response with startup name", async () => {
      const ctx = createTestContext();
      generateTextMock.mockResolvedValue({
        text: "Thank you for submitting Acme Corp! Analysis is underway.",
      });

      const result = await service.generateResponse(
        ClaraIntent.SUBMISSION,
        ctx,
        { startupName: "Acme Corp" },
      );

      expect(providers.resolveModelForPurpose).toHaveBeenCalledWith(
        ModelPurpose.EXTRACTION,
      );
      expect(generateTextMock).toHaveBeenCalledTimes(1);

      const callArgs = generateTextMock.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.4);
      expect(callArgs.prompt).toContain("You are Clara");
      expect(callArgs.prompt).toContain("Intent: submission");
      expect(callArgs.prompt).toContain("Company: Acme Corp");
      expect(callArgs.prompt).toContain(
        "Confirm receipt of pitch deck. Explain analysis is underway across 5 dimensions.",
      );

      expect(result).toBe(
        "Thank you for submitting Acme Corp! Analysis is underway.",
      );
    });

    it("generates QUESTION response with startup details", async () => {
      const ctx = createTestContext();
      generateTextMock.mockResolvedValue({
        text: "Acme Corp is currently in processing. Score: 85/100.",
      });

      const result = await service.generateResponse(ClaraIntent.QUESTION, ctx, {
        startupName: "Acme Corp",
        startupStatus: "processing",
        score: 85,
      });

      const callArgs = generateTextMock.mock.calls[0][0];
      expect(callArgs.prompt).toContain("Startup: Acme Corp");
      expect(callArgs.prompt).toContain("Status: processing");
      expect(callArgs.prompt).toContain("Current score: 85/100");
      expect(result).toContain("Acme Corp");
    });

    it("generates REPORT_REQUEST response for completed startup", async () => {
      const ctx = createTestContext();
      generateTextMock.mockResolvedValue({
        text: "The analysis is complete! Report is ready.",
      });

      const result = await service.generateResponse(
        ClaraIntent.REPORT_REQUEST,
        ctx,
        {
          startupName: "Acme Corp",
          startupStatus: "pending_review",
        },
      );

      const callArgs = generateTextMock.mock.calls[0][0];
      expect(callArgs.prompt).toContain("The report is ready");
      expect(result).toContain("analysis is complete");
    });

    it("generates REPORT_REQUEST response for processing startup", async () => {
      const ctx = createTestContext();
      generateTextMock.mockResolvedValue({
        text: "Analysis is still in progress. 3/5 dimensions complete.",
      });

      const result = await service.generateResponse(
        ClaraIntent.REPORT_REQUEST,
        ctx,
        {
          startupName: "Acme Corp",
          startupStatus: "processing",
        },
      );

      const callArgs = generateTextMock.mock.calls[0][0];
      expect(callArgs.prompt).toContain(
        "The analysis is still in progress. Give an update on current progress.",
      );
      expect(result).toContain("in progress");
    });

    it("generates GREETING response", async () => {
      const ctx = createTestContext();
      generateTextMock.mockResolvedValue({
        text: "Hi! I'm Clara from Inside Line. Send me pitch decks!",
      });

      const result = await service.generateResponse(ClaraIntent.GREETING, ctx);

      const callArgs = generateTextMock.mock.calls[0][0];
      expect(callArgs.prompt).toContain("Introduce yourself as Clara");
      expect(callArgs.prompt).toContain(
        "investors can forward pitch decks for automated analysis",
      );
      expect(result).toContain("Clara");
    });

    it("includes conversation history in response prompt", async () => {
      const ctx = createTestContext({
        conversationHistory: [
          {
            direction: MessageDirection.INBOUND,
            bodyText: "I sent a deck yesterday",
            subject: null,
            intent: ClaraIntent.SUBMISSION,
            createdAt: new Date(),
          },
        ],
      });

      generateTextMock.mockResolvedValue({
        text: "Yes, I received it!",
      });

      await service.generateResponse(ClaraIntent.FOLLOW_UP, ctx);

      const callArgs = generateTextMock.mock.calls[0][0];
      expect(callArgs.prompt).toContain("Recent conversation:");
      expect(callArgs.prompt).toContain("I sent a deck yesterday");
    });

    it("falls back to static response on generation error", async () => {
      const ctx = createTestContext();
      generateTextMock.mockRejectedValue(new Error("Generation failed"));

      const result = await service.generateResponse(
        ClaraIntent.SUBMISSION,
        ctx,
      );

      expect(result).toBe(
        "Thank you for your submission! I've received your pitch deck and our analysis pipeline is processing it now. You'll receive a detailed report once the evaluation is complete.",
      );
    });

    it("returns QUESTION fallback response on error", async () => {
      const ctx = createTestContext();
      generateTextMock.mockRejectedValue(new Error("Generation failed"));

      const result = await service.generateResponse(ClaraIntent.QUESTION, ctx);

      expect(result).toBe(
        "Thanks for reaching out. I'm looking into the status of your submission and will get back to you shortly.",
      );
    });

    it("returns REPORT_REQUEST fallback response on error", async () => {
      const ctx = createTestContext();
      generateTextMock.mockRejectedValue(new Error("Generation failed"));

      const result = await service.generateResponse(
        ClaraIntent.REPORT_REQUEST,
        ctx,
      );

      expect(result).toBe(
        "I'm checking on the status of the analysis report. I'll follow up with the details shortly.",
      );
    });

    it("returns FOLLOW_UP fallback response on error", async () => {
      const ctx = createTestContext();
      generateTextMock.mockRejectedValue(new Error("Generation failed"));

      const result = await service.generateResponse(ClaraIntent.FOLLOW_UP, ctx);

      expect(result).toBe(
        "Thank you for the additional information. I've noted this for the ongoing analysis.",
      );
    });

    it("returns GREETING fallback response on error", async () => {
      const ctx = createTestContext();
      generateTextMock.mockRejectedValue(new Error("Generation failed"));

      const result = await service.generateResponse(ClaraIntent.GREETING, ctx);

      expect(result).toBe(
        "Hi! I'm Clara, your AI assistant at Inside Line. You can forward pitch decks to me and I'll run a comprehensive analysis covering team, market, product, traction, and financials. Just send a PDF and I'll take it from there!",
      );
    });
  });

  describe("extractCompanyFromFilename", () => {
    it("extracts company name from simple PDF filename", () => {
      const result = service.extractCompanyFromFilename("acme-corp.pdf");
      expect(result).toBe("acme corp");
    });

    it("removes pitch deck keywords from filename", () => {
      const result = service.extractCompanyFromFilename(
        "acme-pitch-deck.pdf",
      );
      expect(result).toBe("acme");
    });

    it("removes deck keyword from filename", () => {
      const result = service.extractCompanyFromFilename("startup-deck.pdf");
      expect(result).toBe("startup");
    });

    it("removes presentation keyword from filename", () => {
      const result = service.extractCompanyFromFilename(
        "company-presentation.pptx",
      );
      expect(result).toBe("company");
    });

    it("replaces underscores with spaces", () => {
      const result = service.extractCompanyFromFilename("acme_corp_2024.pdf");
      expect(result).toBe("acme corp 2024");
    });

    it("replaces hyphens with spaces", () => {
      const result = service.extractCompanyFromFilename("acme-corp-inc.pdf");
      expect(result).toBe("acme corp inc");
    });

    it("handles multiple file extensions", () => {
      expect(service.extractCompanyFromFilename("company.pptx")).toBe(
        "company",
      );
      expect(service.extractCompanyFromFilename("company.docx")).toBe(
        "company",
      );
      expect(service.extractCompanyFromFilename("company.ppt")).toBe("company");
    });

    it("handles case-insensitive pitch deck keywords", () => {
      expect(service.extractCompanyFromFilename("Acme-PITCH-DECK.pdf")).toBe(
        "Acme",
      );
      expect(service.extractCompanyFromFilename("Acme-Pitch-Deck.pdf")).toBe(
        "Acme",
      );
    });

    it("returns undefined for undefined input", () => {
      const result = service.extractCompanyFromFilename(undefined);
      expect(result).toBeUndefined();
    });

    it("returns undefined for empty filename after processing", () => {
      const result = service.extractCompanyFromFilename("pitch-deck.pdf");
      expect(result).toBeUndefined();
    });

    it("returns undefined for filename with only keywords", () => {
      const result = service.extractCompanyFromFilename("deck.pdf");
      expect(result).toBeUndefined();
    });

    it("handles complex pitch deck patterns", () => {
      const result = service.extractCompanyFromFilename(
        "Acme_Corp_Pitch_Deck_2024.pdf",
      );
      expect(result).toBe("Acme Corp  2024");
    });
  });
});
