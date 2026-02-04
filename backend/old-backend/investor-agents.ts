import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { storage } from "./storage";
import { scrapeWebpage, type WebPageContent } from "./web-tools";
import { getAgentPrompt, createChatPromptFromDB } from "./agent-prompt-loader";
import type { InvestmentThesis, InvestorProfile, Startup, StartupEvaluation, InvestorMatch } from "@shared/schema";

let investorThesisPromptVersion = 0;
let thesisAlignmentPromptVersion = 0;

const MODEL_NAME = "gpt-5.2";
const MINI_MODEL_NAME = "gpt-5.2";
const MAX_JSON_RETRIES = 2;

// Valid geography codes used in investor theses - must match geoOptions in investor-thesis.tsx
const VALID_GEOGRAPHY_CODES = ["us", "europe", "latam", "asia", "mena", "global"] as const;
type GeographyCode = typeof VALID_GEOGRAPHY_CODES[number];

async function safeJsonParse<T>(
  chain: RunnableSequence,
  input: Record<string, any>,
  defaultValue: T,
  context: string
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_JSON_RETRIES; attempt++) {
    try {
      const result = await chain.invoke(input);
      if (result && typeof result === 'object') {
        return result as T;
      }
      console.warn(`[${context}] Attempt ${attempt + 1}: Invalid response format, retrying...`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('JSON') || errorMsg.includes('parse')) {
        console.warn(`[${context}] Attempt ${attempt + 1}: JSON parse error, retrying...`);
      } else {
        console.error(`[${context}] Attempt ${attempt + 1}: Error:`, error);
        if (attempt === MAX_JSON_RETRIES) {
          throw error;
        }
      }
    }
  }
  console.error(`[${context}] All ${MAX_JSON_RETRIES + 1} attempts failed, using default value`);
  return defaultValue;
}

function createMiniLLM(temperature = 0.1) {
  return new ChatOpenAI({
    modelName: MINI_MODEL_NAME,
    temperature,
    configuration: {
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    },
  });
}

export async function normalizeLocationToRegion(location: string): Promise<string | null> {
  if (!location || location.trim() === '') {
    return null;
  }
  
  console.log(`[LocationNormalizer] Normalizing location: "${location}"`);
  
  const llm = createMiniLLM(0.1);
  
  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      `You are a geography expert. Given a location (city, state, country, or region), determine the most appropriate region code from this EXACT list:

Valid region codes: ${VALID_GEOGRAPHY_CODES.join(', ')}

Rules:
- "us" = United States (all US cities/states) and Canada
- "europe" = All European countries including UK, Germany, France, Italy, Spain, Netherlands, Scandinavia, etc.
- "asia" = All Asian countries including China, Japan, India, Singapore, Korea, Southeast Asia, etc.
- "latam" = Latin America including Mexico, Brazil, Argentina, Chile, Colombia, etc.
- "mena" = Middle East and North Africa including UAE, Saudi Arabia, Israel, Egypt, etc.
- "global" = Multiple regions, unclear, or location cannot be determined

IMPORTANT: You MUST only return one of these 6 codes: us, europe, latam, asia, mena, global

Return ONLY a JSON object with this exact structure:
{{"region": "<region_code>", "confidence": <0.0-1.0>}}

Example inputs and outputs:
- "New York, USA" -> {{"region": "us", "confidence": 0.99}}
- "San Francisco" -> {{"region": "us", "confidence": 0.99}}
- "Toronto, Canada" -> {{"region": "us", "confidence": 0.95}}
- "London" -> {{"region": "europe", "confidence": 0.95}}
- "Berlin, Germany" -> {{"region": "europe", "confidence": 0.99}}
- "Singapore" -> {{"region": "asia", "confidence": 0.99}}
- "Tokyo, Japan" -> {{"region": "asia", "confidence": 0.99}}
- "Mumbai, India" -> {{"region": "asia", "confidence": 0.99}}
- "São Paulo, Brazil" -> {{"region": "latam", "confidence": 0.99}}
- "Mexico City" -> {{"region": "latam", "confidence": 0.99}}
- "Dubai, UAE" -> {{"region": "mena", "confidence": 0.95}}
- "Tel Aviv, Israel" -> {{"region": "mena", "confidence": 0.95}}`
    ),
    HumanMessagePromptTemplate.fromTemplate(`Location: {location}`),
  ]);
  
  const chain = RunnableSequence.from([
    prompt,
    llm,
    new JsonOutputParser(),
  ]);
  
  try {
    const result = await safeJsonParse<{ region?: string; confidence?: number }>(
      chain,
      { location },
      { region: 'global', confidence: 0.5 },
      'LocationNormalizer'
    );
    
    const region = result.region?.toLowerCase() || 'global';
    const confidence = result.confidence || 0.5;
    
    console.log(`[LocationNormalizer] Mapped "${location}" -> "${region}" (confidence: ${confidence})`);
    
    return region;
  } catch (error) {
    console.error(`[LocationNormalizer] Error normalizing location:`, error);
    return 'global';
  }
}

interface PortfolioCompany {
  name: string;
  description?: string;
  stage?: string;
  sector?: string;
  url?: string;
}

interface ThesisSummaryResult {
  thesisSummary: string;
  portfolioCompanies: PortfolioCompany[];
  investmentFocus: string[];
  typicalCheckSize?: string;
  preferredStages?: string[];
}

interface ThesisAlignmentResult {
  fitScore: number;
  rationale: string;
  keyStrengths: string[];
  concerns: string[];
}

interface FirstLevelFilterResult {
  passes: boolean;
  matchedCriteria: string[];
  failedCriteria: string[];
}

function createLLM(temperature = 0.3) {
  return new ChatOpenAI({
    modelName: MODEL_NAME,
    temperature,
    configuration: {
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    },
  });
}

export async function scrapeInvestorPortfolio(websiteUrl: string): Promise<PortfolioCompany[]> {
  console.log(`[InvestorThesisAgent] Scraping investor website: ${websiteUrl}`);
  
  const companies: PortfolioCompany[] = [];
  
  try {
    const mainPage = await scrapeWebpage(websiteUrl);
    if (mainPage.error) {
      console.log(`[InvestorThesisAgent] Error scraping main page: ${mainPage.error}`);
      return companies;
    }
    
    const portfolioLinks = mainPage.links.filter(link => 
      link.text.toLowerCase().includes('portfolio') ||
      link.href.toLowerCase().includes('portfolio') ||
      link.text.toLowerCase().includes('companies') ||
      link.href.toLowerCase().includes('companies') ||
      link.text.toLowerCase().includes('investments') ||
      link.href.toLowerCase().includes('investments')
    );
    
    let portfolioContent = mainPage.mainContent;
    
    if (portfolioLinks.length > 0) {
      const portfolioPage = await scrapeWebpage(portfolioLinks[0].href);
      if (!portfolioPage.error) {
        portfolioContent = portfolioPage.mainContent;
      }
    }
    
    const llm = createLLM(0.1);
    const extractionPrompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(
        `You are an expert at extracting portfolio company information from investor websites.
Extract all portfolio companies mentioned on this page. For each company, identify:
- name (required)
- description (if available)
- stage (seed, series A, etc. if mentioned)
- sector/industry (if mentioned)

Return a JSON object with this structure:
{{
  "companies": [
    {{
      "name": "Company Name",
      "description": "Brief description",
      "stage": "Series A",
      "sector": "FinTech"
    }}
  ]
}}

If no portfolio companies are found, return: {{ "companies": [] }}`
      ),
      HumanMessagePromptTemplate.fromTemplate(
        `Website content:\n{content}\n\nExtract portfolio companies:`
      ),
    ]);
    
    const chain = RunnableSequence.from([
      extractionPrompt,
      llm,
      new JsonOutputParser(),
    ]);
    
    const result = await safeJsonParse<{ companies?: PortfolioCompany[] }>(
      chain,
      { content: portfolioContent.substring(0, 15000) },
      { companies: [] },
      'PortfolioExtraction'
    );
    
    if (result && Array.isArray(result.companies)) {
      companies.push(...result.companies);
    }
    
    console.log(`[InvestorThesisAgent] Extracted ${companies.length} portfolio companies`);
  } catch (error) {
    console.error(`[InvestorThesisAgent] Error scraping portfolio:`, error);
  }
  
  return companies;
}

async function getInvestorThesisPrompt(): Promise<ChatPromptTemplate> {
  const dbPrompt = await getAgentPrompt("investorThesis");
  
  if (dbPrompt && dbPrompt.version !== investorThesisPromptVersion) {
    const chatPrompt = await createChatPromptFromDB("investorThesis");
    if (chatPrompt) {
      console.log("[InvestorThesisAgent] Using database prompt (version " + dbPrompt.version + ")");
      investorThesisPromptVersion = dbPrompt.version || 0;
      return chatPrompt;
    }
  }
  
  return ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      `You are an expert VC analyst. Create a holistic investment thesis summary that captures the investor's focus, preferences, and investment patterns.

Analyze the provided thesis information and portfolio to understand:
1. Investment philosophy and focus areas
2. Typical company profile they invest in
3. Key criteria they look for
4. Pattern of investments from their portfolio

Return a JSON object with this structure:
{{
  "thesisSummary": "A comprehensive 3-5 paragraph summary of the investor's thesis, investment philosophy, and what makes a company a good fit for them",
  "investmentFocus": ["focus area 1", "focus area 2"],
  "typicalCheckSize": "$X-$Y range",
  "preferredStages": ["seed", "series_a"]
}}`
    ),
    HumanMessagePromptTemplate.fromTemplate(
      `Investment Thesis Information:

Fund Name: {fundName}
Fund Description: {fundDescription}
Fund Size/AUM: {fundSize}

Target Stages: {stages}
Check Size Range: {checkSize}
Sectors/Industries: {sectors}
Geographies: {geographies}
Business Models: {businessModels}

Minimum Revenue: {minRevenue}
Minimum Growth Rate: {minGrowthRate}
Minimum Team Size: {minTeamSize}

Thesis Narrative: {thesisNarrative}
Anti-Portfolio (What they don't invest in): {antiPortfolio}

Portfolio Companies:
{portfolioSummary}

Generate a holistic thesis summary:`
    ),
  ]);
}

export async function generateThesisSummary(
  thesis: InvestmentThesis,
  profile: InvestorProfile,
  portfolioCompanies: PortfolioCompany[]
): Promise<ThesisSummaryResult> {
  console.log(`[InvestorThesisAgent] Generating thesis summary for investor ${profile.fundName}`);
  
  const llm = createLLM(0.4);
  const summaryPrompt = await getInvestorThesisPrompt();
  
  const chain = RunnableSequence.from([
    summaryPrompt,
    llm,
    new JsonOutputParser(),
  ]);
  
  const portfolioSummary = portfolioCompanies.length > 0
    ? portfolioCompanies.map(c => `- ${c.name}: ${c.description || 'No description'} (${c.stage || 'Unknown stage'}, ${c.sector || 'Unknown sector'})`).join('\n')
    : 'No portfolio companies identified';
  
  const checkSizeStr = thesis.checkSizeMin || thesis.checkSizeMax
    ? `$${thesis.checkSizeMin?.toLocaleString() || '?'} - $${thesis.checkSizeMax?.toLocaleString() || '?'}`
    : 'Not specified';
  
  const inputData = {
    fundName: profile.fundName,
    fundDescription: profile.fundDescription || 'Not provided',
    fundSize: thesis.fundSize ? `$${thesis.fundSize.toLocaleString()}` : 'Not disclosed',
    stages: Array.isArray(thesis.stages) ? (thesis.stages as string[]).join(', ') : 'Not specified',
    checkSize: checkSizeStr,
    sectors: Array.isArray(thesis.sectors) ? (thesis.sectors as string[]).join(', ') : 'Not specified',
    geographies: Array.isArray(thesis.geographies) ? (thesis.geographies as string[]).join(', ') : 'Not specified',
    businessModels: Array.isArray(thesis.businessModels) ? (thesis.businessModels as string[]).join(', ') : 'Not specified',
    minRevenue: thesis.minRevenue ? `$${thesis.minRevenue.toLocaleString()}` : 'Not specified',
    minGrowthRate: thesis.minGrowthRate ? `${thesis.minGrowthRate}%` : 'Not specified',
    minTeamSize: thesis.minTeamSize?.toString() || 'Not specified',
    thesisNarrative: thesis.thesisNarrative || 'Not provided',
    antiPortfolio: thesis.antiPortfolio || 'Not provided',
    portfolioSummary,
  };
  
  const result = await safeJsonParse<{ thesisSummary?: string; investmentFocus?: string[]; typicalCheckSize?: string; preferredStages?: string[] }>(
    chain,
    inputData,
    { thesisSummary: '', investmentFocus: [], typicalCheckSize: undefined, preferredStages: undefined },
    'ThesisSummary'
  );
  
  return {
    thesisSummary: result.thesisSummary || '',
    portfolioCompanies,
    investmentFocus: result.investmentFocus || [],
    typicalCheckSize: result.typicalCheckSize,
    preferredStages: result.preferredStages,
  };
}

export async function runInvestorThesisAgent(investorId: number): Promise<void> {
  console.log(`[InvestorThesisAgent] Starting thesis analysis for investor ${investorId}`);
  
  try {
    const profile = await storage.getInvestorProfileById(investorId);
    if (!profile) {
      console.error(`[InvestorThesisAgent] Investor profile not found: ${investorId}`);
      return;
    }
    
    const thesis = await storage.getInvestmentThesis(investorId);
    if (!thesis) {
      console.error(`[InvestorThesisAgent] Investment thesis not found for investor: ${investorId}`);
      return;
    }
    
    let portfolioCompanies: PortfolioCompany[] = [];
    const websiteUrl = thesis.website || profile.website;
    if (websiteUrl) {
      portfolioCompanies = await scrapeInvestorPortfolio(websiteUrl);
    }
    
    const summaryResult = await generateThesisSummary(thesis, profile, portfolioCompanies);
    
    await storage.createOrUpdateThesis(investorId, {
      thesisSummary: summaryResult.thesisSummary,
      portfolioCompanies: portfolioCompanies as any,
      thesisSummaryGeneratedAt: new Date(),
    });
    
    console.log(`[InvestorThesisAgent] Thesis summary saved for investor ${investorId}`);
  } catch (error) {
    console.error(`[InvestorThesisAgent] Error processing thesis:`, error);
    throw error;
  }
}

export function checkFirstLevelFilters(
  startup: Startup,
  thesis: InvestmentThesis
): FirstLevelFilterResult {
  const matchedCriteria: string[] = [];
  const failedCriteria: string[] = [];
  
  const startupSectors = startup.sectorIndustryGroup ? [startup.sectorIndustryGroup] : [];
  const thesisSectors = thesis.sectors as string[] || [];
  
  if (thesisSectors.length > 0) {
    const sectorMatch = startupSectors.some(s => thesisSectors.includes(s));
    if (sectorMatch) {
      matchedCriteria.push('Industry/sector match');
    } else {
      failedCriteria.push('Industry/sector mismatch');
    }
  } else {
    matchedCriteria.push('No sector filter (open)');
  }
  
  const thesisStages = thesis.stages as string[] || [];
  if (thesisStages.length > 0 && startup.stage) {
    const stageMatch = thesisStages.includes(startup.stage);
    if (stageMatch) {
      matchedCriteria.push('Stage match');
    } else {
      failedCriteria.push('Stage mismatch');
    }
  } else {
    matchedCriteria.push('No stage filter (open)');
  }
  
  const thesisGeographies = thesis.geographies as string[] || [];
  if (thesisGeographies.length > 0) {
    // Use normalized region if available, otherwise skip geography filter
    const normalizedRegion = startup.normalizedRegion?.toLowerCase();
    
    if (normalizedRegion) {
      // Check if thesis geographies includes the startup's normalized region
      // Also check if thesis includes "global" (matches everything)
      const thesisGeoLower = thesisGeographies.map(g => g.toLowerCase());
      const geoMatch = thesisGeoLower.includes(normalizedRegion) || thesisGeoLower.includes('global');
      
      if (geoMatch) {
        matchedCriteria.push(`Geography match (${normalizedRegion})`);
      } else {
        failedCriteria.push(`Geography mismatch (startup: ${normalizedRegion}, thesis: ${thesisGeographies.join(', ')})`);
      }
    } else if (startup.location) {
      // Fallback: location exists but no normalized region yet - skip geography check
      matchedCriteria.push('No normalized region (skip geography filter)');
    } else {
      matchedCriteria.push('No location specified (skip geography filter)');
    }
  } else {
    matchedCriteria.push('No geography filter (open)');
  }
  
  if (thesis.checkSizeMin || thesis.checkSizeMax) {
    const roundSize = startup.roundSize;
    if (roundSize) {
      const withinRange = 
        (!thesis.checkSizeMin || roundSize >= thesis.checkSizeMin) &&
        (!thesis.checkSizeMax || roundSize <= thesis.checkSizeMax);
      if (withinRange) {
        matchedCriteria.push('Check size within range');
      } else {
        failedCriteria.push('Check size outside range');
      }
    } else {
      matchedCriteria.push('No round size specified (skip check)');
    }
  } else {
    matchedCriteria.push('No check size filter (open)');
  }
  
  const passes = failedCriteria.length === 0;
  
  console.log(`[FirstLevelFilter] Startup ${startup.id} for thesis ${thesis.id}: ${passes ? 'PASS' : 'FAIL'}`);
  console.log(`[FirstLevelFilter] Matched: ${matchedCriteria.join(', ')}`);
  if (failedCriteria.length > 0) {
    console.log(`[FirstLevelFilter] Failed: ${failedCriteria.join(', ')}`);
  }
  
  return { passes, matchedCriteria, failedCriteria };
}

async function getThesisAlignmentPrompt(): Promise<ChatPromptTemplate> {
  const dbPrompt = await getAgentPrompt("thesisAlignment");
  
  if (dbPrompt && dbPrompt.version !== thesisAlignmentPromptVersion) {
    const chatPrompt = await createChatPromptFromDB("thesisAlignment");
    if (chatPrompt) {
      console.log("[ThesisAlignmentAgent] Using database prompt (version " + dbPrompt.version + ")");
      thesisAlignmentPromptVersion = dbPrompt.version || 0;
      return chatPrompt;
    }
  }
  
  return ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      `You are an expert VC analyst evaluating startup-investor fit. Analyze how well a startup aligns with an investor's thesis and produce a fit assessment.

Consider:
1. Sector/industry alignment
2. Stage fit
3. Geographic preferences
4. Business model alignment
5. Revenue and traction requirements
6. Team requirements
7. Investment thesis narrative alignment
8. Anti-portfolio considerations

Return a JSON object with this structure:
{{
  "fitScore": <number 1-100>,
  "rationale": "<2-3 sentence summary of fit, suitable for investor dashboard display>",
  "keyStrengths": ["strength 1", "strength 2"],
  "concerns": ["concern 1", "concern 2"]
}}

The rationale should be concise and highlight the most important fit factors.`
    ),
    HumanMessagePromptTemplate.fromTemplate(
      `INVESTOR THESIS:
Fund: {fundName}
Fund Description: {fundDescription}
Target Stages: {stages}
Target Sectors: {sectors}
Target Geographies: {geographies}
Business Models: {businessModels}
Check Size: {checkSize}
Minimum Revenue: {minRevenue}
Thesis Narrative: {thesisNarrative}
Anti-Portfolio: {antiPortfolio}
Holistic Thesis Summary: {thesisSummary}

STARTUP INFORMATION:
Company: {companyName}
Stage: {startupStage}
Industry: {startupIndustries}
Location: {location}
Description: {description}
Round Size: {roundSize}
Valuation: {valuation}

STARTUP EVALUATION SUMMARY:
Overall Score: {overallScore}
Product Summary: {productSummary}
Executive Summary: {executiveSummary}
Key Strengths: {strengths}
Key Risks: {risks}

Analyze the thesis alignment and generate fit assessment:`
    ),
  ]);
}

export async function runThesisAlignmentAgent(
  startup: Startup,
  evaluation: StartupEvaluation,
  thesis: InvestmentThesis,
  profile: InvestorProfile
): Promise<ThesisAlignmentResult> {
  console.log(`[ThesisAlignmentAgent] Analyzing fit for startup ${startup.id} with investor ${profile.fundName}`);
  
  const llm = createLLM(0.3);
  const alignmentPrompt = await getThesisAlignmentPrompt();
  
  const chain = RunnableSequence.from([
    alignmentPrompt,
    llm,
    new JsonOutputParser(),
  ]);
  
  const investorMemo = evaluation.investorMemo as any || {};
  const keyStrengthsList = evaluation.keyStrengths as string[] || [];
  const keyRisksList = evaluation.keyRisks as string[] || [];
  
  const inputData = {
    fundName: profile.fundName,
    fundDescription: profile.fundDescription || 'Not provided',
    stages: Array.isArray(thesis.stages) ? (thesis.stages as string[]).join(', ') : 'Not specified',
    sectors: Array.isArray(thesis.sectors) ? (thesis.sectors as string[]).join(', ') : 'Not specified',
    geographies: Array.isArray(thesis.geographies) ? (thesis.geographies as string[]).join(', ') : 'Not specified',
    businessModels: Array.isArray(thesis.businessModels) ? (thesis.businessModels as string[]).join(', ') : 'Not specified',
    checkSize: thesis.checkSizeMin || thesis.checkSizeMax 
      ? `$${thesis.checkSizeMin?.toLocaleString() || '?'} - $${thesis.checkSizeMax?.toLocaleString() || '?'}`
      : 'Not specified',
    minRevenue: thesis.minRevenue ? `$${thesis.minRevenue.toLocaleString()}` : 'Not specified',
    thesisNarrative: thesis.thesisNarrative || 'Not provided',
    antiPortfolio: thesis.antiPortfolio || 'Not provided',
    thesisSummary: thesis.thesisSummary || 'Not available',
    companyName: startup.name,
    startupStage: startup.stage || 'Not specified',
    startupIndustries: startup.sectorIndustryGroup || startup.sector || 'Not specified',
    location: startup.location || 'Not specified',
    description: startup.description || 'Not provided',
    roundSize: startup.roundSize ? `$${startup.roundSize.toLocaleString()}` : 'Not specified',
    valuation: startup.valuation ? `$${startup.valuation.toLocaleString()}` : 'Not specified',
    overallScore: evaluation.overallScore || 'Not available',
    productSummary: investorMemo.productSummary || 'Not available',
    executiveSummary: evaluation.executiveSummary || 'Not available',
    strengths: keyStrengthsList.join(', ') || 'Not available',
    risks: keyRisksList.join(', ') || 'Not available',
  };
  
  const defaultResult: ThesisAlignmentResult = {
    fitScore: 50,
    rationale: 'Unable to generate alignment assessment',
    keyStrengths: [],
    concerns: [],
  };
  
  const result = await safeJsonParse<{ fitScore?: number; rationale?: string; keyStrengths?: string[]; concerns?: string[] }>(
    chain,
    inputData,
    defaultResult,
    'ThesisAlignment'
  );
  
  return {
    fitScore: result.fitScore || 50,
    rationale: result.rationale || 'Unable to generate alignment assessment',
    keyStrengths: result.keyStrengths || [],
    concerns: result.concerns || [],
  };
}

export async function runThesisAlignmentForApprovedStartup(startupId: number): Promise<void> {
  console.log(`[ThesisAlignment] Running alignment for approved startup ${startupId}`);
  
  try {
    const startup = await storage.getStartup(startupId);
    if (!startup) {
      console.error(`[ThesisAlignment] Startup not found: ${startupId}`);
      return;
    }
    
    const evaluation = await storage.getEvaluation(startupId);
    if (!evaluation) {
      console.error(`[ThesisAlignment] Evaluation not found for startup: ${startupId}`);
      return;
    }
    
    const allInvestorProfiles = await storage.getAllInvestorProfiles();
    console.log(`[ThesisAlignment] Checking ${allInvestorProfiles.length} investor profiles`);
    
    for (const profile of allInvestorProfiles) {
      try {
        const thesis = await storage.getInvestmentThesis(profile.id);
        if (!thesis) {
          console.log(`[ThesisAlignment] No thesis for investor ${profile.id}, skipping`);
          continue;
        }
        
        const filterResult = checkFirstLevelFilters(startup, thesis);
        if (!filterResult.passes) {
          console.log(`[ThesisAlignment] Startup ${startupId} filtered out for investor ${profile.id}`);
          continue;
        }
        
        const alignmentResult = await runThesisAlignmentAgent(startup, evaluation, thesis, profile);
        
        const existingMatch = await storage.getMatchByInvestorAndStartup(profile.id, startupId);
        
        if (existingMatch) {
          await storage.updateMatchFitScore(existingMatch.id, alignmentResult.fitScore, alignmentResult.rationale);
        } else {
          await storage.createMatch({
            investorId: profile.id,
            startupId: startupId,
            thesisFitScore: alignmentResult.fitScore,
            fitRationale: alignmentResult.rationale,
            status: 'new',
          });
        }
        
        console.log(`[ThesisAlignment] Created/updated match for startup ${startupId} with investor ${profile.id}: score ${alignmentResult.fitScore}`);
      } catch (err) {
        console.error(`[ThesisAlignment] Error processing investor ${profile.id}:`, err);
      }
    }
    
    console.log(`[ThesisAlignment] Completed alignment for startup ${startupId}`);
  } catch (error) {
    console.error(`[ThesisAlignment] Error running alignment:`, error);
    throw error;
  }
}

export async function runThesisAlignmentForInvestorSubmission(
  startupId: number,
  investorId: number
): Promise<ThesisAlignmentResult | null> {
  console.log(`[ThesisAlignment] Running alignment for investor-submitted startup ${startupId} by investor ${investorId}`);
  
  try {
    const startup = await storage.getStartup(startupId);
    if (!startup) {
      console.error(`[ThesisAlignment] Startup not found: ${startupId}`);
      return null;
    }
    
    const evaluation = await storage.getEvaluation(startupId);
    if (!evaluation) {
      console.error(`[ThesisAlignment] Evaluation not found for startup: ${startupId}`);
      return null;
    }
    
    const profile = await storage.getInvestorProfileById(investorId);
    if (!profile) {
      console.error(`[ThesisAlignment] Investor profile not found: ${investorId}`);
      return null;
    }
    
    const thesis = await storage.getInvestmentThesis(investorId);
    if (!thesis) {
      console.log(`[ThesisAlignment] No thesis for investor ${investorId}, using default scoring`);
      return null;
    }
    
    const alignmentResult = await runThesisAlignmentAgent(startup, evaluation, thesis, profile);
    
    const existingMatch = await storage.getMatchByInvestorAndStartup(investorId, startupId);
    
    if (existingMatch) {
      await storage.updateMatchFitScore(existingMatch.id, alignmentResult.fitScore, alignmentResult.rationale);
    } else {
      await storage.createMatch({
        investorId: investorId,
        startupId: startupId,
        thesisFitScore: alignmentResult.fitScore,
        fitRationale: alignmentResult.rationale,
        status: 'reviewing',
      });
    }
    
    console.log(`[ThesisAlignment] Investor submission alignment complete: score ${alignmentResult.fitScore}`);
    return alignmentResult;
  } catch (error) {
    console.error(`[ThesisAlignment] Error running investor alignment:`, error);
    throw error;
  }
}
