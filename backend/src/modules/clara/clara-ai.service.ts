import { Injectable, Logger } from "@nestjs/common";
import { generateText, Output } from "ai";
import { z } from "zod";
import { AiProviderService } from "../ai/providers/ai-provider.service";
import { ModelPurpose } from "../ai/interfaces/pipeline.interface";
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

  constructor(private providers: AiProviderService) {}

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
    extra?: { startupName?: string; startupStatus?: string; score?: number },
  ): Promise<string> {
    try {
      const { text } = await generateText({
        model: this.providers.resolveModelForPurpose(ModelPurpose.EXTRACTION),
        temperature: 0.4,
        prompt: this.buildResponsePrompt(intent, ctx, extra),
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

    const prompt = [
      "You are Clara, an AI email assistant for Inside Line, an investor deal-flow platform.",
      "Classify the intent of this incoming email.",
      "",
      `From: ${ctx.fromEmail}`,
      `Subject: ${ctx.subject ?? "(no subject)"}`,
      `Body: ${ctx.bodyText?.slice(0, 2000) ?? "(empty)"}`,
      `Attachments: ${ctx.attachments.map((a) => `${a.filename} (${a.contentType})`).join(", ") || "none"}`,
      `Has linked startup: ${ctx.startupId ? "yes" : "no"}`,
      "",
      historyText ? `Conversation history:\n${historyText}` : "No prior conversation.",
      "",
      "Intents:",
      "- submission: Investor forwarding a pitch deck or startup details for analysis",
      "- question: Asking about a startup's status, scores, or analysis progress",
      "- report_request: Requesting the investment memo, report PDF, or detailed analysis",
      "- follow_up: Continuing an existing conversation or providing additional info",
      "- greeting: General hello, introduction, or asking what Clara can do",
    ].join("\n");

    try {
      const { output } = await generateText({
        model: this.providers.resolveModelForPurpose(ModelPurpose.EXTRACTION),
        output: Output.object({ schema: IntentClassificationSchema }),
        temperature: 0.1,
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
    intent: ClaraIntent,
    ctx: MessageContext,
    extra?: { startupName?: string; startupStatus?: string; score?: number },
  ): string {
    const parts = [
      "You are Clara, a friendly and professional AI assistant for Inside Line, an investor deal-flow platform.",
      "Write a concise email reply. Be warm but professional. Use the investor's name if available.",
      `Investor name: ${ctx.fromName ?? "there"}`,
      `Intent: ${intent}`,
    ];

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

    if (history) {
      parts.push("", "Recent conversation:", history);
    }

    return parts.filter(Boolean).join("\n");
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
