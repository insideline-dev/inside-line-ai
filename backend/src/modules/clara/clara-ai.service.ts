import { Injectable, Logger } from "@nestjs/common";
import { generateText, Output, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import { AiProviderService } from "../ai/providers/ai-provider.service";
import { ModelPurpose } from "../ai/interfaces/pipeline.interface";
import { AiPromptService } from "../ai/services/ai-prompt.service";
import {
  ClaraIntent,
  type IntentClassification,
  type MessageContext,
} from "./interfaces/clara.interface";

const IntentClassificationSchema = z.object({
  intent: z.nativeEnum(ClaraIntent),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  extractedCompanyName: z.string().optional(),
});

@Injectable()
export class ClaraAiService {
  private readonly logger = new Logger(ClaraAiService.name);

  constructor(
    private providers: AiProviderService,
    private promptService: AiPromptService,
  ) {}

  async classifyIntent(ctx: MessageContext): Promise<IntentClassification> {
    const fastPath = this.tryHeuristic(ctx);
    if (fastPath) {
      return fastPath;
    }

    return this.classifyWithAi(ctx);
  }

  async generateResponse(
    intent: ClaraIntent,
    ctx: MessageContext,
    extra?: {
      startupName?: string;
      startupStatus?: string;
      score?: number;
      startupStage?: string;
    },
  ): Promise<string> {
    try {
      const promptConfig = await this.promptService.resolve({
        key: "clara.response",
        stage: extra?.startupStage,
      });
      const { text } = await generateText({
        model: this.providers.resolveModelForPurpose(ModelPurpose.CLARA),
        temperature: 0.4,
        system: promptConfig.systemPrompt,
        prompt: this.buildResponsePrompt(promptConfig.userPrompt, intent, ctx, extra),
      });
      return text;
    } catch (error) {
      this.logger.warn(`Response generation failed: ${error}`);
      return this.fallbackResponse(intent);
    }
  }

  private tryHeuristic(
    ctx: MessageContext,
  ): IntentClassification | null {
    const hasPdfAttachment = ctx.attachments.some(
      (a) =>
        a.contentType === "application/pdf" ||
        /deck|pitch/i.test(a.filename),
    );
    const isNewConversation = ctx.conversationHistory.length === 0;

    if (hasPdfAttachment && isNewConversation) {
      return {
        intent: ClaraIntent.SUBMISSION,
        confidence: 0.95,
        reasoning: "New conversation with PDF attachment",
        extractedCompanyName: this.extractCompanyFromFilename(
          ctx.attachments.find(
            (a) =>
              a.contentType === "application/pdf" ||
              /deck|pitch/i.test(a.filename),
          )?.filename,
        ),
      };
    }

    if (ctx.startupId && ctx.conversationHistory.length > 0) {
      const body = (ctx.bodyText ?? "").toLowerCase();
      if (/memo|report|pdf|download/i.test(body)) {
        return {
          intent: ClaraIntent.REPORT_REQUEST,
          confidence: 0.85,
          reasoning: "Existing thread with report/memo keywords",
        };
      }

      return {
        intent: ClaraIntent.FOLLOW_UP,
        confidence: 0.9,
        reasoning: "Reply in existing thread with linked startup",
      };
    }

    return null;
  }

  private async classifyWithAi(
    ctx: MessageContext,
  ): Promise<IntentClassification> {
    const historyText = ctx.conversationHistory
      .slice(-5)
      .map(
        (m) =>
          `[${m.direction}] ${m.bodyText?.slice(0, 200) ?? "(no body)"}`,
      )
      .join("\n");

    const promptConfig = await this.promptService.resolve({
      key: "clara.intent",
      stage: ctx.startupStage,
    });
    const prompt = this.promptService.renderTemplate(promptConfig.userPrompt, {
      fromEmail: ctx.fromEmail,
      subject: ctx.subject ?? "(no subject)",
      body: ctx.bodyText?.slice(0, 2000) ?? "(empty)",
      attachments:
        ctx.attachments.map((a) => `${a.filename} (${a.contentType})`).join(", ") ||
        "none",
      hasLinkedStartup: ctx.startupId ? "yes" : "no",
      historyBlock: historyText ? `Conversation history:\n${historyText}` : "No prior conversation.",
      startupStage: ctx.startupStage ?? "unknown",
    });

    try {
      const { output } = await generateText({
        model: this.providers.resolveModelForPurpose(ModelPurpose.CLARA),
        output: Output.object({ schema: IntentClassificationSchema }),
        temperature: 0.1,
        system: promptConfig.systemPrompt,
        prompt,
      });

      return IntentClassificationSchema.parse(output);
    } catch (error) {
      this.logger.warn(`AI intent classification failed: ${error}`);
      return {
        intent: ClaraIntent.GREETING,
        confidence: 0.3,
        reasoning: "Fallback due to classification error",
      };
    }
  }

  private buildResponsePrompt(
    promptTemplate: string,
    intent: ClaraIntent,
    ctx: MessageContext,
    extra?: {
      startupName?: string;
      startupStatus?: string;
      score?: number;
      startupStage?: string;
    },
  ): string {
    const parts: string[] = [];

    switch (intent) {
      case ClaraIntent.SUBMISSION:
        parts.push(
          `Company: ${extra?.startupName ?? "the submitted startup"}`,
          "Confirm receipt of pitch deck. Explain analysis is underway across 5 dimensions.",
          "Mention they'll receive a detailed report when analysis completes.",
        );
        break;
      case ClaraIntent.QUESTION:
        parts.push(
          `Startup: ${extra?.startupName ?? "unknown"}`,
          `Status: ${extra?.startupStatus ?? "unknown"}`,
          extra?.score ? `Current score: ${extra.score}/100` : "",
          "Answer their question about the startup status/progress.",
        );
        break;
      case ClaraIntent.REPORT_REQUEST:
        parts.push(
          `Startup: ${extra?.startupName ?? "unknown"}`,
          `Status: ${extra?.startupStatus ?? "unknown"}`,
          extra?.startupStatus === "pending_review" || extra?.startupStatus === "approved"
            ? "The report is ready. Let them know the analysis is complete."
            : "The analysis is still in progress. Give an update on current progress.",
        );
        break;
      case ClaraIntent.FOLLOW_UP:
        parts.push("Respond contextually based on the conversation history.");
        break;
      case ClaraIntent.GREETING:
        parts.push(
          "Introduce yourself as Clara from Inside Line.",
          "Explain: investors can forward pitch decks for automated analysis.",
          "Clara evaluates team, market, product, traction, financials, and more.",
          "Analysis typically completes in a few minutes.",
        );
        break;
    }

    const history = ctx.conversationHistory
      .slice(-3)
      .map(
        (m) =>
          `[${m.direction}] ${m.bodyText?.slice(0, 300) ?? "(no body)"}`,
      )
      .join("\n");

    const startupBlock = [
      `Startup: ${extra?.startupName ?? "unknown"}`,
      `Status: ${extra?.startupStatus ?? "unknown"}`,
      typeof extra?.score === "number" ? `Current score: ${extra.score}/100` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return this.promptService.renderTemplate(promptTemplate, {
      investorName: ctx.fromName ?? "there",
      intent,
      startupStage: extra?.startupStage ?? ctx.startupStage ?? "unknown",
      startupBlock,
      intentInstructions: parts.join("\n"),
      historyBlock: history ? `Recent conversation:\n${history}` : "No recent conversation.",
    });
  }

  private fallbackResponse(intent: ClaraIntent): string {
    switch (intent) {
      case ClaraIntent.SUBMISSION:
        return "Thank you for your submission! I've received your pitch deck and our analysis pipeline is processing it now. You'll receive a detailed report once the evaluation is complete.";
      case ClaraIntent.QUESTION:
        return "Thanks for reaching out. I'm looking into the status of your submission and will get back to you shortly.";
      case ClaraIntent.REPORT_REQUEST:
        return "I'm checking on the status of the analysis report. I'll follow up with the details shortly.";
      case ClaraIntent.FOLLOW_UP:
        return "Thank you for the additional information. I've noted this for the ongoing analysis.";
      case ClaraIntent.GREETING:
        return "Hi! I'm Clara, your AI assistant at Inside Line. You can forward pitch decks to me and I'll run a comprehensive analysis covering team, market, product, traction, and financials. Just send a PDF and I'll take it from there!";
    }
  }

  isLikelySubmission(ctx: MessageContext): boolean {
    const hasPdf = ctx.attachments.some(
      (a) =>
        a.contentType === "application/pdf" ||
        /deck|pitch/i.test(a.filename),
    );
    const isNew = ctx.conversationHistory.length === 0;
    return hasPdf && (isNew || !ctx.startupId);
  }

  async runAgentLoop(
    ctx: MessageContext,
    tools: ToolSet,
    options?: {
      actorRole?: string | null;
      conversationMemory?: Record<string, unknown> | null;
    },
  ): Promise<string> {
    try {
      const history = ctx.conversationHistory
        .slice(-5)
        .map(
          (m) =>
            `[${m.direction}] ${m.bodyText?.slice(0, 300) ?? "(no body)"}`,
        )
        .join("\n");

      const systemPrompt = [
        "You are Clara, a smart and friendly AI assistant for Inside Line, an investor deal-flow platform.",
        "",
        "## Your Capabilities",
        "You can look up and act on platform information using the tools available to you.",
        "The sender may be an investor or an admin.",
        "- Their matched startups and scores",
        "- Their deal pipeline status",
        "- Detailed startup information (fuzzy name search)",
        "- Quick startup status checks",
        "- Their investment thesis",
        "- Their notes on startups",
        "- Their portfolio companies",
        "- Search startups by name",
        "- Platform analytics (admin senders)",
        "- Startup analysis progress/status",
        "- Email a memo/report PDF attachment back to the sender when requested",
        "",
        "## Guidelines",
        "- Be concise and professional but warm. Use the investor's name when available.",
        "- Use tools to gather data before answering questions. Don't guess.",
        "- If the sender has no linked account, explain they can register on Inside Line.",
        "- If asked about submitting a startup, explain they can forward a pitch deck PDF.",
        "- If asked for a memo/report PDF and a linked startup exists, use the PDF email tool instead of only describing how to download it.",
        "- Prefer answering from the platform data and tools, not generic advice.",
        "- Sign off as Clara.",
        "- Format responses for email (plain text, no markdown).",
        "- Never fabricate data. If a tool returns no results, say so.",
      ].join("\n");

      const memoryBlock =
        options?.conversationMemory && Object.keys(options.conversationMemory).length > 0
          ? `Conversation memory:\n${JSON.stringify(options.conversationMemory, null, 2)}`
          : "";

      const userPrompt = [
        `From: ${ctx.fromName ?? ctx.fromEmail} <${ctx.fromEmail}>`,
        `Role: ${options?.actorRole ?? ctx.actorRole ?? "unknown"}`,
        `Subject: ${ctx.subject ?? "(no subject)"}`,
        "",
        ctx.bodyText?.slice(0, 3000) ?? "(empty body)",
        "",
        memoryBlock,
        "",
        history ? `Recent conversation:\n${history}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const { text } = await generateText({
        model: this.providers.resolveModelForPurpose(ModelPurpose.CLARA),
        tools,
        stopWhen: stepCountIs(5),
        temperature: 0.3,
        system: systemPrompt,
        prompt: userPrompt,
      });

      return text;
    } catch (error) {
      this.logger.warn(`Agent loop failed: ${error}`);
      return this.fallbackResponse(ClaraIntent.GREETING);
    }
  }

  extractCompanyFromFilename(
    filename: string | undefined,
  ): string | undefined {
    if (!filename) return undefined;
    const name = filename
      .replace(/\.(pdf|pptx?|docx?)$/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\b(pitch\s*deck|deck|presentation|slides?)\b/gi, "")
      .trim();
    return name || undefined;
  }
}
