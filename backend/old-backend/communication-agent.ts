import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { storage } from "./storage";
import { sendWhatsAppMessage } from "./integrations/twilio";
import { replyToEmail, sendEmail } from "./integrations/agentmail";
import { queueAnalysis } from "./analysis-queue";
import { generateStartupMemoPDF } from "./pdf-generator";
import type { 
  AgentConversation, 
  AgentMessage, 
  InsertAgentConversation,
  InsertAgentMessage,
  InsertStartup,
  InvestorProfile,
  Startup,
  StartupEvaluation
} from "@shared/schema";

const SYSTEM_PROMPT = `You are Clara, the AI Engagement Manager at Inside Line. You work for InsideLine.AI, a startup evaluation and investor matching platform.

Your role is to help investors:
1. Submit startups for evaluation by forwarding pitch decks or company information
2. Answer questions about previously evaluated startups
3. Track the status of evaluations in progress
4. Provide investment memos and analysis reports

When an investor forwards a pitch deck or company information:
- Extract the startup name, founder contact details (name, email, phone)
- Identify any URLs (website, LinkedIn profiles)
- Ask for missing critical information if needed

Always be professional, warm, concise, and helpful. Sign off as "Clara" when appropriate. If you're unsure about something, ask for clarification.

IMPORTANT:
- If the investor mentions a startup by name, check if we already have an evaluation for it
- If they're submitting a new startup, confirm receipt and let them know the evaluation will begin
- If they're asking about an existing startup, provide information from the evaluation
- If an analysis is in progress, provide status updates

Format your responses appropriately for the channel (email can be longer, WhatsApp should be concise).`;

interface MessageAnalysis {
  intent: "question" | "submission" | "follow_up" | "greeting" | "report_request" | "unknown";
  extractedEntities: {
    startupNames: string[];
    founderEmails: string[];
    founderNames: string[];
    urls: string[];
    attachments: { name: string; type: string; url?: string }[];
  };
  confidence: number;
  suggestedAction: string;
}

interface ExtractedStartupInfo {
  name: string;
  contactEmail?: string;
  contactName?: string;
  confidence: number;
}

export class CommunicationAgent {
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.3,
    });
  }

  async analyzeMessage(content: string, channel: "email" | "whatsapp"): Promise<MessageAnalysis> {
    const analysisPrompt = `Analyze this ${channel} message and extract:
1. Intent: Is this a question about a startup, a new startup submission, a follow-up, a greeting, a request for a report/memo, or unknown?
   - Use "report_request" if asking for memo, report, PDF, analysis document, or evaluation document
2. Entities: Extract any startup names, founder emails, founder names, and URLs mentioned
3. Confidence level (0-1) in your analysis
4. Suggested action

Message:
${content}

Respond in JSON format:
{
  "intent": "question" | "submission" | "follow_up" | "greeting" | "report_request" | "unknown",
  "extractedEntities": {
    "startupNames": [],
    "founderEmails": [],
    "founderNames": [],
    "urls": [],
    "attachments": []
  },
  "confidence": 0.0-1.0,
  "suggestedAction": "description of what to do"
}`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage("You are an entity extraction assistant. Respond only with valid JSON."),
        new HumanMessage(analysisPrompt)
      ]);

      const jsonStr = response.content.toString().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error("Error analyzing message:", error);
      return {
        intent: "unknown",
        extractedEntities: {
          startupNames: [],
          founderEmails: [],
          founderNames: [],
          urls: [],
          attachments: []
        },
        confidence: 0,
        suggestedAction: "Request clarification from the investor"
      };
    }
  }

  async matchInvestor(email?: string, phone?: string): Promise<InvestorProfile | null> {
    if (!email && !phone) return null;

    const allProfiles = await storage.getAllInvestorProfiles();
    const users = await Promise.all(
      allProfiles.map(async (profile) => {
        const user = await storage.getUser(profile.userId);
        return { profile, user };
      })
    );

    if (email) {
      const match = users.find(({ user }) => 
        user?.email?.toLowerCase() === email.toLowerCase()
      );
      if (match) return match.profile;
    }

    // For phone matching, we'd need to store phone numbers on user profiles
    // For now, return null if no email match
    return null;
  }

  async findStartupByName(name: string): Promise<{ startup: Startup; evaluation?: StartupEvaluation } | null> {
    const allStartups = await storage.getAllStartups();
    
    const normalizedName = name.toLowerCase().trim();
    const matchedStartup = allStartups.find(s => 
      s.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(s.name.toLowerCase())
    );

    if (!matchedStartup) return null;

    const evaluation = await storage.getEvaluation(matchedStartup.id);
    return { startup: matchedStartup, evaluation: evaluation || undefined };
  }

  async extractStartupInfo(
    content: string, 
    attachments?: Array<{ filename: string; contentType: string }>,
    senderEmail?: string,
    senderName?: string
  ): Promise<ExtractedStartupInfo | null> {
    // Simplified extraction - only need company name and contact info
    // All other fields (website, description, stage, sector, etc.) will be extracted from the pitch deck during analysis
    const extractionPrompt = `Extract ONLY the startup/company name from this email. This may be a forwarded pitch deck or a message about a startup.

Message content:
${content}

${attachments && attachments.length > 0 ? `Attachments: ${attachments.map(a => a.filename).join(", ")}` : "No attachments"}

Extract:
1. The startup/company name - look for it in the email subject, body, or attachment filenames
2. Contact email - if there's a founder email mentioned (NOT the sender's email unless they are the founder)
3. Contact name - the founder or contact person's name if mentioned

Respond ONLY in JSON:
{
  "name": "startup/company name",
  "contactEmail": "founder email if found in the content (or null)",
  "contactName": "founder/contact name if found (or null)",
  "confidence": 0.0-1.0
}

If you cannot determine the company name with reasonable confidence, set name to null.`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage("You are a startup name extraction assistant. Extract only the company name and founder contact if present. Respond only with valid JSON."),
        new HumanMessage(extractionPrompt)
      ]);

      const jsonStr = response.content.toString().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      
      if (!parsed.name) return null;
      
      // Use sender info as fallback for contact
      const result: ExtractedStartupInfo = {
        name: parsed.name,
        contactEmail: parsed.contactEmail || senderEmail,
        contactName: parsed.contactName || senderName,
        confidence: parsed.confidence || 0.5,
      };
      
      return result;
    } catch (error) {
      console.error("Error extracting startup info:", error);
      return null;
    }
  }

  async createStartupFromSubmission(params: {
    info: ExtractedStartupInfo;
    submitterId: string;
    attachments?: Array<{ filename: string; contentType: string; url?: string; path?: string }>;
  }): Promise<Startup> {
    const { info, submitterId, attachments } = params;

    // Minimal startup data - all other fields will be extracted from pitch deck during analysis
    const startupData: InsertStartup = {
      founderId: submitterId,
      submittedByRole: "investor",
      isPrivate: true,
      name: info.name,
      contactName: info.contactName,
      contactEmail: info.contactEmail,
      status: "submitted",
    };

    // Handle attachments - identify pitch deck (must have valid path)
    let hasDeckWithPath = false;
    if (attachments && attachments.length > 0) {
      const deckAttachment = attachments.find(a => 
        (a.filename.toLowerCase().includes("deck") ||
        a.filename.toLowerCase().includes("pitch") ||
        a.contentType === "application/pdf") &&
        a.path // Must have a valid path
      );
      if (deckAttachment?.path) {
        startupData.pitchDeckPath = deckAttachment.path;
        hasDeckWithPath = true;
        console.log(`[CommunicationAgent] ===== STEP 5: DECK PATH FOR ANALYSIS =====`);
        console.log(`[CommunicationAgent] Deck filename: ${deckAttachment.filename}`);
        console.log(`[CommunicationAgent] Deck path: ${deckAttachment.path}`);
        console.log(`[CommunicationAgent] This path will be used by analysis to read the file`);
      }
      // Only include attachments that have valid paths
      startupData.files = attachments
        .filter(a => a.path)
        .map(a => ({
          path: a.path!,
          name: a.filename,
          type: a.contentType
        }));
    }

    // Validate we have a deck before creating
    if (!hasDeckWithPath) {
      console.warn(`[CommunicationAgent] Creating startup without a pitch deck path - analysis may fail`);
    }

    const startup = await storage.createStartup(startupData);
    console.log(`[CommunicationAgent] ===== STEP 6: STARTUP CREATED =====`);
    console.log(`[CommunicationAgent] Startup ID: ${startup.id}`);
    console.log(`[CommunicationAgent] Startup name: ${startup.name}`);
    console.log(`[CommunicationAgent] Pitch deck path: ${startup.pitchDeckPath || 'NONE'}`);
    console.log(`[CommunicationAgent] Files array: ${JSON.stringify(startup.files)}`);
    
    // Only queue for analysis if we have a deck
    if (hasDeckWithPath) {
      console.log(`[CommunicationAgent] ===== STEP 7: QUEUEING FOR ANALYSIS =====`);
      console.log(`[CommunicationAgent] Queueing startup ${startup.id} for AI analysis...`);
      try {
        await queueAnalysis(startup.id);
        console.log(`[CommunicationAgent] Analysis queued successfully`);
        // Update status to "analyzing" AFTER successful queue so detail page shows progress immediately
        await storage.updateStartup(startup.id, { status: "analyzing" });
        console.log(`[CommunicationAgent] Status updated to "analyzing" for immediate progress display`);
      } catch (queueError: any) {
        console.error(`[CommunicationAgent] Failed to queue analysis: ${queueError?.message}`);
        // Status stays as "submitted" if queue fails
      }
    } else {
      console.warn(`[CommunicationAgent] NOT queueing startup ${startup.id} for analysis - no deck available`);
    }
    
    return startup;
  }

  async handleSubmission(params: {
    conversation: AgentConversation;
    content: string;
    channel: "email" | "whatsapp";
    attachments?: Array<{ filename: string; contentType: string; url?: string; path?: string }>;
    senderEmail?: string;
    senderName?: string;
  }): Promise<{ startup?: Startup; response: string; needsMoreInfo: boolean }> {
    const { conversation, content, channel, attachments, senderEmail, senderName } = params;

    // Check if we have a pitch deck attachment - this is the key requirement
    const hasPitchDeck = attachments?.some(a => 
      a.filename.toLowerCase().includes("deck") ||
      a.filename.toLowerCase().includes("pitch") ||
      a.contentType === "application/pdf"
    );

    // Extract startup information (simplified - just company name and contact)
    const extractedInfo = await this.extractStartupInfo(
      content, 
      attachments?.map(a => ({ filename: a.filename, contentType: a.contentType })),
      senderEmail,
      senderName
    );

    // If we have a pitch deck but couldn't extract the name, try to infer from filename
    if (!extractedInfo && hasPitchDeck) {
      const deckFile = attachments?.find(a => 
        a.filename.toLowerCase().includes("deck") ||
        a.filename.toLowerCase().includes("pitch") ||
        a.contentType === "application/pdf"
      );
      if (deckFile) {
        // Try to extract company name from filename (e.g., "Acme_Pitch_Deck.pdf" -> "Acme")
        const filename = deckFile.filename.replace(/\.(pdf|pptx?|key)$/i, '');
        const cleanedName = filename
          .replace(/(pitch|deck|presentation|investor|series|round|seed)/gi, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        
        if (cleanedName.length > 2) {
          // Create with inferred name - analysis will validate/update
          const submitterId = conversation.investorProfileId 
            ? (await storage.getInvestorProfileById(conversation.investorProfileId))?.userId || "agent"
            : "agent";

          const startup = await this.createStartupFromSubmission({
            info: { 
              name: cleanedName, 
              contactEmail: senderEmail,
              contactName: senderName,
              confidence: 0.3 
            },
            submitterId,
            attachments
          });

          await storage.updateConversation(conversation.id, {
            currentStartupId: startup.id,
          });

          return {
            startup,
            needsMoreInfo: false,
            response: `I've received the pitch deck and started the AI evaluation. I'll extract all the details from the deck and notify you when the analysis is complete (typically 5-10 minutes).`
          };
        }
      }
    }

    if (!extractedInfo) {
      // Only ask for company name if we don't have a pitch deck
      if (!hasPitchDeck) {
        return {
          needsMoreInfo: true,
          response: "I'd be happy to evaluate this startup. Please forward an email with the pitch deck attached, or let me know the company name."
        };
      }
      return {
        needsMoreInfo: true,
        response: "I received the pitch deck but couldn't identify the company name. What's the name of the startup?"
      };
    }

    // Check if startup already exists
    const existing = await this.findStartupByName(extractedInfo.name);
    if (existing) {
      const statusMessage = existing.startup.status === "analyzing" 
        ? "currently being analyzed"
        : existing.startup.status === "pending_review"
        ? "pending admin review"
        : existing.startup.status === "approved"
        ? "already evaluated"
        : "in our system";

      return {
        startup: existing.startup,
        needsMoreInfo: false,
        response: `I found that ${extractedInfo.name} is ${statusMessage}.${
          existing.evaluation?.overallScore 
            ? ` The overall score is ${existing.evaluation.overallScore.toFixed(1)}/10.`
            : ""
        } Would you like me to send you the current evaluation report?`
      };
    }

    // If we have a pitch deck, start analysis immediately regardless of confidence
    // The pitch deck contains all the info we need - AI will extract during analysis
    if (hasPitchDeck || extractedInfo.confidence >= 0.3) {
      const submitterId = conversation.investorProfileId 
        ? (await storage.getInvestorProfileById(conversation.investorProfileId))?.userId || "agent"
        : "agent";

      const startup = await this.createStartupFromSubmission({
        info: extractedInfo,
        submitterId,
        attachments
      });

      await storage.updateConversation(conversation.id, {
        currentStartupId: startup.id,
      });

      const dynamicResponse = await this.generateSubmissionAcknowledgment({
        startupName: extractedInfo.name,
        channel,
        senderName
      });

      return {
        startup,
        needsMoreInfo: false,
        response: dynamicResponse
      };
    }

    // Low confidence and no pitch deck - need more info
    return {
      needsMoreInfo: true,
      response: `I see you mentioned ${extractedInfo.name}. Could you forward the pitch deck so I can start the evaluation?`
    };
  }

  async getOrCreateConversation(params: {
    channel: "email" | "whatsapp";
    senderEmail?: string;
    senderPhone?: string;
    senderName?: string;
    emailThreadId?: string;
    whatsappThreadId?: string;
  }): Promise<AgentConversation> {
    // Try to find existing conversation by thread ID first
    if (params.emailThreadId) {
      const existing = await storage.getConversationByEmailThread(params.emailThreadId);
      if (existing) return existing;
    }

    if (params.whatsappThreadId) {
      const existing = await storage.getConversationByWhatsAppThread(params.whatsappThreadId);
      if (existing) return existing;
    }

    // Try to find by email or phone to unify conversations
    if (params.senderEmail) {
      const existing = await storage.getConversationByEmail(params.senderEmail);
      if (existing) {
        // Update with new channel info if needed
        const updates: Partial<InsertAgentConversation> = {};
        if (params.emailThreadId && !existing.emailThreadId) {
          updates.emailThreadId = params.emailThreadId;
        }
        if (params.whatsappThreadId && !existing.whatsappThreadId) {
          updates.whatsappThreadId = params.whatsappThreadId;
        }
        if (Object.keys(updates).length > 0) {
          return (await storage.updateConversation(existing.id, updates)) || existing;
        }
        return existing;
      }
    }

    if (params.senderPhone) {
      const existing = await storage.getConversationByPhone(params.senderPhone);
      if (existing) {
        const updates: Partial<InsertAgentConversation> = {};
        if (params.emailThreadId && !existing.emailThreadId) {
          updates.emailThreadId = params.emailThreadId;
        }
        if (params.whatsappThreadId && !existing.whatsappThreadId) {
          updates.whatsappThreadId = params.whatsappThreadId;
        }
        if (Object.keys(updates).length > 0) {
          return (await storage.updateConversation(existing.id, updates)) || existing;
        }
        return existing;
      }
    }

    // Create new conversation
    const investorProfile = await this.matchInvestor(params.senderEmail, params.senderPhone);

    const newConversation: InsertAgentConversation = {
      senderEmail: params.senderEmail,
      senderPhone: params.senderPhone,
      senderName: params.senderName,
      emailThreadId: params.emailThreadId,
      whatsappThreadId: params.whatsappThreadId,
      investorProfileId: investorProfile?.id,
      isAuthenticated: !!investorProfile,
      status: "active",
    } as InsertAgentConversation;

    return await storage.createConversation(newConversation);
  }

  async getConversationHistory(conversationId: number): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const messages = await storage.getMessagesByConversation(conversationId);
    return messages.map(m => ({
      role: m.direction === "inbound" ? "user" as const : "assistant" as const,
      content: m.content
    }));
  }

  async buildFullMemoContext(startup: Startup, evaluation: StartupEvaluation): Promise<string> {
    let context = "";
    
    // Basic info
    context += `\n\nOverall Score: ${evaluation.overallScore?.toFixed(1) || 'Pending'}`;
    context += `\nStage: ${startup.stage || 'Not specified'}`;
    context += `\nSector: ${startup.sector || 'Not specified'}`;
    context += `\nLocation: ${startup.location || 'Not specified'}`;
    if (startup.website) context += `\nWebsite: ${startup.website}`;
    if (startup.roundSize) context += `\nRound Size: $${(startup.roundSize / 1000000).toFixed(1)}M ${startup.roundCurrency || 'USD'}`;
    
    // Executive Summary
    if (evaluation.executiveSummary) {
      context += `\n\nEXECUTIVE SUMMARY:\n${evaluation.executiveSummary}`;
    }
    
    // All 11 sections with scores and data summaries
    const sections = [
      { name: 'TEAM ANALYSIS', score: evaluation.teamScore, data: evaluation.teamData },
      { name: 'MARKET ANALYSIS', score: evaluation.marketScore, data: evaluation.marketData },
      { name: 'PRODUCT ANALYSIS', score: evaluation.productScore, data: evaluation.productData },
      { name: 'TRACTION ANALYSIS', score: evaluation.tractionScore, data: evaluation.tractionData },
      { name: 'BUSINESS MODEL', score: evaluation.businessModelScore, data: evaluation.businessModelData },
      { name: 'GO-TO-MARKET', score: evaluation.gtmScore, data: evaluation.gtmData },
      { name: 'FINANCIALS', score: evaluation.financialsScore, data: evaluation.financialsData },
      { name: 'COMPETITIVE ADVANTAGE', score: evaluation.competitiveAdvantageScore, data: evaluation.competitiveAdvantageData },
      { name: 'LEGAL & REGULATORY', score: evaluation.legalScore, data: evaluation.legalData },
      { name: 'DEAL TERMS', score: evaluation.dealTermsScore, data: evaluation.dealTermsData },
      { name: 'EXIT POTENTIAL', score: evaluation.exitPotentialScore, data: evaluation.exitPotentialData },
    ];
    
    for (const section of sections) {
      if (section.data || section.score) {
        context += `\n\n${section.name}:`;
        if (section.score) context += `\nScore: ${section.score.toFixed(1)}/10`;
        // Extract narrative from data if available
        if (section.data && typeof section.data === 'object') {
          const data = section.data as Record<string, unknown>;
          if (data.narrative) context += `\n${data.narrative}`;
          else if (data.summary) context += `\n${data.summary}`;
          else if (data.analysis) context += `\n${data.analysis}`;
        }
      }
    }
    
    // Key strengths and risks
    if (evaluation.keyStrengths && Array.isArray(evaluation.keyStrengths)) {
      context += `\n\nKEY STRENGTHS:\n${(evaluation.keyStrengths as string[]).join('\n- ')}`;
    }
    if (evaluation.keyRisks && Array.isArray(evaluation.keyRisks)) {
      context += `\n\nKEY RISKS:\n${(evaluation.keyRisks as string[]).join('\n- ')}`;
    }
    
    // Investor memo if available
    if (evaluation.investorMemo && typeof evaluation.investorMemo === 'object') {
      const memo = evaluation.investorMemo as Record<string, unknown>;
      if (memo.recommendation) {
        context += `\n\nINVESTMENT RECOMMENDATION:\n${memo.recommendation}`;
      }
    }
    
    return context;
  }

  async generateReportAttachment(startup: Startup, evaluation: StartupEvaluation, investorName?: string): Promise<{
    filename: string;
    content: string;
    contentType: string;
  } | null> {
    try {
      if (evaluation.status !== "completed") {
        console.log(`[CommunicationAgent] Cannot generate report - evaluation not completed (status: ${evaluation.status})`);
        return null;
      }

      const watermark = investorName || "InsideLine.AI";
      const pdfBuffer = await generateStartupMemoPDF(startup, evaluation, watermark);
      
      // Convert buffer to base64
      const base64Content = pdfBuffer.toString('base64');
      
      // Create filename with startup name and date
      const date = new Date().toISOString().split('T')[0];
      const safeStartupName = startup.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${safeStartupName}_Investment_Memo_${date}.pdf`;
      
      return {
        filename,
        content: base64Content,
        contentType: 'application/pdf'
      };
    } catch (error) {
      console.error('[CommunicationAgent] Error generating report attachment:', error);
      return null;
    }
  }

  async handleReportRequest(params: {
    conversation: AgentConversation;
    analysis: MessageAnalysis;
    senderEmail?: string;
    investorProfile?: InvestorProfile | null;
  }): Promise<{ response: string; attachments: Array<{ filename: string; content: string; contentType: string }> }> {
    const { conversation, analysis, investorProfile } = params;
    const attachments: Array<{ filename: string; content: string; contentType: string }> = [];
    
    // Find the startup they're asking about
    let targetStartup: Startup | null = null;
    let targetEvaluation: StartupEvaluation | null = null;
    
    // First check extracted startup names
    for (const name of analysis.extractedEntities.startupNames) {
      const match = await this.findStartupByName(name);
      if (match) {
        targetStartup = match.startup;
        targetEvaluation = match.evaluation;
        break;
      }
    }
    
    // If no specific startup mentioned, use current conversation startup
    if (!targetStartup && conversation.currentStartupId) {
      targetStartup = await storage.getStartup(conversation.currentStartupId);
      if (targetStartup) {
        targetEvaluation = await storage.getEvaluation(targetStartup.id);
      }
    }
    
    // Fallback: If investor has only one startup in portfolio, use that
    if (!targetStartup && investorProfile) {
      const investorStartups = await storage.getStartupsForInvestor(investorProfile.id);
      const completedStartups = investorStartups.filter(s => s.status === "completed");
      
      if (completedStartups.length === 1) {
        // Only one completed startup - use it
        targetStartup = completedStartups[0];
        targetEvaluation = await storage.getEvaluation(targetStartup.id);
      } else if (completedStartups.length > 1) {
        // Multiple completed startups - list them
        const startupList = completedStartups.map(s => `- ${s.name}`).join('\n');
        return {
          response: `I can send you reports for any of these completed evaluations:\n\n${startupList}\n\nJust let me know which one you'd like and I'll send the Investment Memo right away!`,
          attachments: []
        };
      }
    }
    
    if (!targetStartup) {
      return {
        response: "I'd be happy to send you a report! Could you let me know which startup you'd like the report for? You can mention the company name in your message.",
        attachments: []
      };
    }
    
    if (!targetEvaluation || targetEvaluation.status !== "completed") {
      return {
        response: `The evaluation for ${targetStartup.name} is still in progress (status: ${targetStartup.status}). I'll notify you once the Investment Memo is ready and can send it to you then.`,
        attachments: []
      };
    }
    
    // Generate the PDF attachment
    const investorName = investorProfile?.fundName;
    console.log(`[CommunicationAgent] Generating report for startup: ${targetStartup.name}, investor: ${investorName || 'N/A'}`);
    const attachment = await this.generateReportAttachment(targetStartup, targetEvaluation, investorName);
    
    if (attachment) {
      attachments.push(attachment);
      return {
        response: `Here's the Investment Memo for ${targetStartup.name}. The attached PDF contains the complete analysis including team evaluation, market assessment, traction review, and our investment recommendation. Let me know if you have any questions about the report!`,
        attachments
      };
    } else {
      return {
        response: `I encountered an issue generating the PDF report for ${targetStartup.name}. Our team has been notified. In the meantime, I can answer any specific questions you have about the startup's evaluation.`,
        attachments: []
      };
    }
  }

  async generateSubmissionAcknowledgment(params: {
    startupName: string;
    channel: "email" | "whatsapp";
    senderName?: string;
  }): Promise<string> {
    const { startupName, channel, senderName } = params;

    const systemPrompt = `You are Clara, the AI Engagement Manager at Inside Line. 
A founder has just submitted their pitch deck for analysis. Generate a warm, professional acknowledgment.

Key information to convey naturally:
- You've received their submission for "${startupName}"
- The AI-powered analysis is now underway
- They'll receive their Investment Memo and Report within 45 minutes to 1 hour
- You'll notify them as soon as it's ready

Guidelines:
- Be conversational and encouraging, not robotic
- Keep it concise but warm
- Don't use bullet points or numbered lists
- Vary your phrasing naturally
- Sign off as "Clara" or "Clara, AI Engagement Manager at Inside Line"
${channel === "whatsapp" ? "- Keep it brief for mobile messaging" : ""}
${senderName ? `- The sender's name is ${senderName}` : ""}`;

    const response = await this.llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage("Generate an acknowledgment message for this pitch deck submission.")
    ]);

    return response.content.toString();
  }

  async generateResponse(params: {
    conversation: AgentConversation;
    messageContent: string;
    channel: "email" | "whatsapp";
    analysis: MessageAnalysis;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    senderEmail?: string;
  }): Promise<string> {
    const { conversation, messageContent, channel, analysis, history, senderEmail } = params;

    // Build context about the conversation
    let contextInfo = "";
    let investorProfile = null;
    
    // Try to recognize investor by email or conversation
    if (conversation.investorProfileId) {
      investorProfile = await storage.getInvestorProfileById(conversation.investorProfileId);
    } else if (senderEmail) {
      investorProfile = await storage.getInvestorProfileByEmail(senderEmail);
      if (investorProfile) {
        // Update conversation to link to this investor
        await storage.updateConversation(conversation.id, { investorProfileId: investorProfile.id });
      }
    }
    
    if (investorProfile) {
      contextInfo += `\n\n=== INVESTOR CONTEXT ===`;
      contextInfo += `\nYou are speaking with an investor: ${investorProfile.fundName}`;
      
      // Get their portfolio of startups
      const { matched, submitted } = await storage.getStartupsForInvestor(investorProfile.id);
      
      if (matched.length > 0 || submitted.length > 0) {
        contextInfo += `\n\nInvestor's Portfolio:`;
        
        if (matched.length > 0) {
          contextInfo += `\n\nMatched Startups (${matched.length}):`;
          for (const startup of matched.slice(0, 10)) { // Limit to first 10
            const eval_ = await storage.getEvaluation(startup.id);
            contextInfo += `\n- ${startup.name} (${startup.status}) - Score: ${eval_?.overallScore?.toFixed(1) || 'Pending'}`;
          }
        }
        
        if (submitted.length > 0) {
          contextInfo += `\n\nSubmitted via Portal (${submitted.length}):`;
          for (const startup of submitted.slice(0, 10)) {
            const eval_ = await storage.getEvaluation(startup.id);
            contextInfo += `\n- ${startup.name} (${startup.status}) - Score: ${eval_?.overallScore?.toFixed(1) || 'Pending'}`;
          }
        }
      }
    }

    if (conversation.currentStartupId) {
      const startup = await storage.getStartup(conversation.currentStartupId);
      const evaluation = startup ? await storage.getEvaluation(startup.id) : null;
      if (startup) {
        contextInfo += `\n\n=== CURRENT STARTUP ===`;
        contextInfo += `\nCurrently discussing: ${startup.name} (Status: ${startup.status})`;
        if (evaluation) {
          contextInfo += await this.buildFullMemoContext(startup, evaluation);
        }
      }
    }

    // Check if message mentions a known startup - provide full details
    for (const name of analysis.extractedEntities.startupNames) {
      const match = await this.findStartupByName(name);
      if (match) {
        contextInfo += `\n\n=== STARTUP: ${match.startup.name} ===`;
        contextInfo += `\n- Status: ${match.startup.status}`;
        if (match.evaluation) {
          contextInfo += await this.buildFullMemoContext(match.startup, match.evaluation);
        }
      }
    }

    // Build messages for LLM
    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(SYSTEM_PROMPT + contextInfo),
    ];

    // Add conversation history (last 10 messages)
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === "user") {
        messages.push(new HumanMessage(msg.content));
      } else {
        messages.push(new AIMessage(msg.content));
      }
    }

    // Add current message
    messages.push(new HumanMessage(messageContent));

    // Add channel-specific instruction for mobile messaging
    if (channel === "whatsapp") {
      messages.push(new SystemMessage("Keep your response concise for mobile messaging. Use bullet points and short sentences."));
    }

    const response = await this.llm.invoke(messages);
    return response.content.toString();
  }

  async processInboundMessage(params: {
    channel: "email" | "whatsapp";
    content: string;
    senderEmail?: string;
    senderPhone?: string;
    senderName?: string;
    emailThreadId?: string;
    whatsappThreadId?: string;
    externalMessageId?: string;
    attachments?: Array<{ filename: string; contentType: string; url?: string; path?: string }>;
    inboxId?: string;
  }): Promise<{ response: string; conversation: AgentConversation; message: AgentMessage; inboxId?: string; attachments?: Array<{ filename: string; content: string; contentType: string }> }> {
    const startTime = Date.now();

    // Get or create conversation
    const conversation = await this.getOrCreateConversation({
      channel: params.channel,
      senderEmail: params.senderEmail,
      senderPhone: params.senderPhone,
      senderName: params.senderName,
      emailThreadId: params.emailThreadId,
      whatsappThreadId: params.whatsappThreadId,
    });

    // Analyze the message
    const analysis = await this.analyzeMessage(params.content, params.channel);

    // Store inbound message
    const inboundMessage = await storage.createMessage({
      conversationId: conversation.id,
      channel: params.channel,
      direction: "inbound",
      content: params.content,
      intent: analysis.intent,
      extractedEntities: analysis.extractedEntities,
      externalMessageId: params.externalMessageId,
      attachments: params.attachments,
    });

    // Get conversation history
    const history = await this.getConversationHistory(conversation.id);

    let aiResponse: string;
    let attachments: Array<{ filename: string; content: string; contentType: string }> = [];

    // Handle startup submissions specially
    if (analysis.intent === "submission" || (params.attachments && params.attachments.length > 0)) {
      const submissionResult = await this.handleSubmission({
        conversation,
        content: params.content,
        channel: params.channel,
        attachments: params.attachments,
        senderEmail: params.senderEmail,
        senderName: params.senderName,
      });
      aiResponse = submissionResult.response;
    } else if (analysis.intent === "report_request") {
      // Handle report/memo requests with PDF attachments
      const investorProfile = params.senderEmail 
        ? await storage.getInvestorProfileByEmail(params.senderEmail) 
        : null;
      
      const reportResult = await this.handleReportRequest({
        conversation,
        analysis,
        senderEmail: params.senderEmail,
        investorProfile,
      });
      aiResponse = reportResult.response;
      attachments = reportResult.attachments;
    } else {
      // Generate AI response for other intents
      aiResponse = await this.generateResponse({
        conversation,
        messageContent: params.content,
        channel: params.channel,
        analysis,
        history: history.slice(0, -1), // Exclude the just-added message
        senderEmail: params.senderEmail,
      });
    }

    const processingTime = Date.now() - startTime;

    // Store outbound message
    const outboundMessage = await storage.createMessage({
      conversationId: conversation.id,
      channel: params.channel,
      direction: "outbound",
      content: aiResponse,
      inReplyToMessageId: inboundMessage.id,
      aiResponseMetadata: {
        model: "gpt-4o",
        promptTokens: 0, // Would need to track from LLM response
        completionTokens: 0,
        processingTimeMs: processingTime,
        agentDecision: analysis.suggestedAction,
      },
    });

    // Update conversation context
    await storage.updateConversation(conversation.id, {
      context: {
        lastIntent: analysis.intent,
        mentionedStartups: conversation.context?.mentionedStartups || [],
        pendingQuestions: [],
        extractedData: analysis.extractedEntities as Record<string, any>,
        conversationSummary: "",
      },
      status: "waiting_response",
    });

    return {
      response: aiResponse,
      conversation,
      message: outboundMessage,
      inboxId: params.inboxId,
      attachments,
    };
  }

  async sendReply(params: {
    conversation: AgentConversation;
    message: AgentMessage;
    inboxId?: string;
    attachments?: Array<{ filename: string; content: string; contentType: string }>;
  }): Promise<void> {
    const { conversation, message, inboxId, attachments } = params;

    try {
      if (message.channel === "email" && conversation.emailThreadId) {
        // Send email reply via AgentMail
        const inbox = await storage.getActiveInbox();
        // Use provided inboxId or fall back to stored inbox
        const effectiveInboxId = inboxId || inbox?.agentMailInboxId;
        
        if (effectiveInboxId) {
          // Get the original message to reply to
          const messages = await storage.getMessagesByConversation(conversation.id);
          const lastInbound = messages.filter(m => m.direction === "inbound" && m.channel === "email").pop();
          
          if (lastInbound?.externalMessageId) {
            await replyToEmail({
              inboxId: effectiveInboxId,
              messageId: lastInbound.externalMessageId,
              text: message.content,
              attachments: attachments,
            });
          } else if (conversation.senderEmail) {
            await sendEmail({
              inboxId: effectiveInboxId,
              to: [conversation.senderEmail],
              subject: "Re: InsideLine.AI",
              text: message.content,
              attachments: attachments,
            });
          }
        } else {
          console.error("No inbox ID available for sending email reply");
        }

        await storage.updateMessage(message.id, { deliveryStatus: "sent" });
      } else if (message.channel === "whatsapp" && conversation.senderPhone) {
        // Send WhatsApp message via Twilio
        await sendWhatsAppMessage({
          to: conversation.senderPhone,
          body: message.content,
        });

        await storage.updateMessage(message.id, { deliveryStatus: "sent" });
      }
    } catch (error: any) {
      console.error("Error sending reply:", error);
      await storage.updateMessage(message.id, { 
        deliveryStatus: "failed",
        deliveryError: error.message || "Unknown error"
      });
    }
  }
}

export const communicationAgent = new CommunicationAgent();
