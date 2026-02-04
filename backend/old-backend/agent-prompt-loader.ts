import { storage } from "./storage";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from "@langchain/core/prompts";
import type { AgentPrompt } from "@shared/schema";

const promptCache: Map<string, { prompt: AgentPrompt; loadedAt: number }> = new Map();
const CACHE_TTL = 60000; // 1 minute cache

// Known template variables used in agent prompts
const TEMPLATE_VARIABLES = new Set([
  'companyName', 'website', 'companyDescription', 'sector', 'stage', 'location',
  'teamMembers', 'teamMembersData', 'linkedInProfiles', 'deckContext', 'webResearch', 'competitorResearch',
  'adminGuidance', 'roundSize', 'roundCurrency', 'valuation', 'valuationType',
  'raiseType', 'leadSecured', 'leadInvestorName', 'hasPreviousFunding',
  'previousFundingAmount', 'previousFundingCurrency', 'previousInvestors', 'previousRoundType',
  'teamAnalysis', 'marketAnalysis', 'productAnalysis', 'tractionAnalysis',
  'businessModelAnalysis', 'gtmAnalysis', 'financialsAnalysis', 
  'competitiveAdvantageAnalysis', 'legalAnalysis', 'dealTermsAnalysis', 'exitPotentialAnalysis',
  'founderDetails', 'teamComposition', 'teamRisks', 'capabilityGaps', 'scoringData',
  // Investor agent variables
  'fundName', 'fundDescription', 'fundSize', 'stages', 'sectors', 'geographies',
  'businessModels', 'checkSize', 'minRevenue', 'minGrowthRate', 'minTeamSize',
  'thesisNarrative', 'antiPortfolio', 'portfolioSummary', 'thesisSummary',
  'startupStage', 'startupIndustries', 'description', 'overallScore',
  'productSummary', 'executiveSummary', 'strengths', 'risks', 'content'
]);

/**
 * Escapes curly braces that are NOT template variables.
 * LangChain uses {variableName} for templates, so literal braces need to be {{ and }}.
 * 
 * This function takes a two-pass approach:
 * 1. First, identify and temporarily protect known template variables
 * 2. Escape ALL remaining curly braces
 * 3. Restore the protected template variables
 */
function escapeNonTemplateVariables(text: string): string {
  // Step 1: Replace known template variables with unique placeholders
  const placeholders: Record<string, string> = {};
  let counter = 0;
  
  let protectedText = text;
  const variablesArray = Array.from(TEMPLATE_VARIABLES);
  for (let i = 0; i < variablesArray.length; i++) {
    const variable = variablesArray[i];
    const pattern = new RegExp(`\\{${variable}\\}`, 'g');
    const placeholder = `__LANGCHAIN_VAR_${counter}__`;
    if (protectedText.includes(`{${variable}}`)) {
      placeholders[placeholder] = `{${variable}}`;
      protectedText = protectedText.replace(pattern, placeholder);
      counter++;
    }
  }
  
  // Step 2: Escape ALL remaining curly braces (double them for LangChain)
  let escapedText = protectedText
    .replace(/\{/g, '{{')
    .replace(/\}/g, '}}');
  
  // Step 3: Restore the template variable placeholders
  const placeholderKeys = Object.keys(placeholders);
  for (let i = 0; i < placeholderKeys.length; i++) {
    const placeholder = placeholderKeys[i];
    escapedText = escapedText.replace(new RegExp(placeholder, 'g'), placeholders[placeholder]);
  }
  
  return escapedText;
}

export async function getAgentPrompt(agentKey: string): Promise<AgentPrompt | undefined> {
  const cached = promptCache.get(agentKey);
  const now = Date.now();
  
  if (cached && (now - cached.loadedAt) < CACHE_TTL) {
    return cached.prompt;
  }
  
  try {
    const prompt = await storage.getAgentPrompt(agentKey);
    if (prompt) {
      promptCache.set(agentKey, { prompt, loadedAt: now });
    }
    return prompt;
  } catch (error) {
    console.error(`[PromptLoader] Failed to load prompt for ${agentKey}:`, error);
    return undefined;
  }
}

export async function createChatPromptFromDB(agentKey: string): Promise<ChatPromptTemplate | undefined> {
  const agentPrompt = await getAgentPrompt(agentKey);
  
  if (!agentPrompt) {
    return undefined;
  }
  
  try {
    // Escape curly braces that aren't template variables (e.g., JSON examples in prompts)
    let systemPrompt = escapeNonTemplateVariables(agentPrompt.systemPrompt);
    let humanPrompt = escapeNonTemplateVariables(agentPrompt.humanPrompt);
    
    // Append JSON format instruction if not already present (required by OpenAI response_format: json_object)
    if (!humanPrompt.toLowerCase().includes('json')) {
      humanPrompt += '\n\nRespond with your analysis in JSON format.';
    }
    
    return ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(systemPrompt),
      HumanMessagePromptTemplate.fromTemplate(humanPrompt),
    ]);
  } catch (error) {
    console.error(`[PromptLoader] Failed to create ChatPromptTemplate for ${agentKey}:`, error);
    return undefined;
  }
}

export async function getDynamicPrompt(
  agentKey: string, 
  fallbackPrompt: ChatPromptTemplate
): Promise<ChatPromptTemplate> {
  const dbPrompt = await createChatPromptFromDB(agentKey);
  
  if (dbPrompt) {
    console.log(`[PromptLoader] Using database prompt for ${agentKey}`);
    return dbPrompt;
  }
  
  console.log(`[PromptLoader] Using fallback prompt for ${agentKey}`);
  return fallbackPrompt;
}

export function clearPromptCache(): void {
  promptCache.clear();
}

export function clearPromptCacheFor(agentKey: string): void {
  promptCache.delete(agentKey);
}
