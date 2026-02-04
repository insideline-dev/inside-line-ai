// Re-export from LangChain-based multi-agent implementation
export { analyzeStartup, StartupEvaluationOrchestrator, reanalyzeSection, type SectionName } from "./langchain-agents";

// Legacy implementation below (kept for reference)
import OpenAI from "openai";
import { storage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface WebsiteAnalysis {
  companyDescription: string;
  productDescription: string;
  targetMarket: string;
  keyFeatures: string[];
  messagingClarity: number;
  overallScore: number;
}

interface MarketAnalysis {
  statedTAM: string | null;
  validatedTAM: string | null;
  tamSource: string | null;
  marketCredibility: number;
  marketDynamics: string;
  competitiveLandscape: string;
  overallScore: number;
}

interface TeamMemberLinkedInAnalysis {
  currentPosition: string;
  company: string;
  yearsExperience: number;
  education: string[];
  previousCompanies: string[];
  skills: string[];
  relevantExperience: string;
  strengthsForRole: string[];
  potentialConcerns: string[];
  founderFitScore: number;
}

interface TeamMemberEvaluation {
  name: string;
  role: string;
  linkedinUrl: string;
  linkedinAnalysis: TeamMemberLinkedInAnalysis | null;
}

interface TeamComposition {
  hasBusinessLeader: boolean;
  hasTechnicalLeader: boolean;
  hasIndustryExpert: boolean;
  teamBalance: string;
  gapsIdentified: string[];
}

interface TeamAnalysis {
  founders: Array<{
    name: string;
    background: string;
    relevantExperience: string;
  }>;
  teamMemberEvaluations: TeamMemberEvaluation[];
  teamComposition: TeamComposition;
  founderMarketFit: number;
  executionRiskNotes: string;
  overallScore: number;
}

interface TractionAnalysis {
  revenueStage: string;
  growthSignals: string[];
  momentum: number;
  credibility: number;
  overallScore: number;
}

interface DeckAnalysis {
  hasTeamSlide: boolean;
  hasMarketSlide: boolean;
  hasTractionSlide: boolean;
  hasBusinessModelSlide: boolean;
  hasCompetitionSlide: boolean;
  hasFinancialsSlide: boolean;
  missingSlides: string[];
  overallScore: number;
}

async function analyzeWebsite(website: string): Promise<WebsiteAnalysis> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a VC analyst evaluating a startup's website. Analyze the website and extract key information. 
          Return a JSON object with:
          - companyDescription: One paragraph description of what the company does
          - productDescription: What product/service they offer
          - targetMarket: Who they target
          - keyFeatures: Array of 3-5 key features/benefits
          - messagingClarity: Score 0-100 for how clear their messaging is
          - overallScore: Score 0-100 for overall website quality from an investor perspective`
        },
        {
          role: "user",
          content: `Analyze this company website: ${website}. Extract information about the company, product, target market, and assess the quality of their messaging.`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Website analysis error:", error);
    return {
      companyDescription: "Analysis unavailable",
      productDescription: "Analysis unavailable",
      targetMarket: "Analysis unavailable",
      keyFeatures: [],
      messagingClarity: 50,
      overallScore: 50
    };
  }
}

async function analyzeMarket(website: string, deckData: any): Promise<MarketAnalysis> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a VC analyst validating market size claims. Analyze the market and TAM claims.
          Return a JSON object with:
          - statedTAM: The TAM claimed by the company (if available)
          - validatedTAM: Your estimate of the actual TAM based on research
          - tamSource: Where you would validate this TAM
          - marketCredibility: Score 0-100 for how credible their market claims are
          - marketDynamics: Brief description of market growth and dynamics
          - competitiveLandscape: Key competitors and positioning
          - overallScore: Score 0-100 for market opportunity`
        },
        {
          role: "user",
          content: `Analyze the market for this company: ${website}. 
          Additional context from deck: ${JSON.stringify(deckData || {})}.
          Validate any TAM claims against what you know about the market.`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Market analysis error:", error);
    return {
      statedTAM: null,
      validatedTAM: null,
      tamSource: null,
      marketCredibility: 50,
      marketDynamics: "Analysis unavailable",
      competitiveLandscape: "Analysis unavailable",
      overallScore: 50
    };
  }
}

async function analyzeLinkedInProfile(
  name: string,
  role: string,
  linkedinUrl: string,
  companyContext: string
): Promise<TeamMemberLinkedInAnalysis | null> {
  if (!linkedinUrl || linkedinUrl.trim() === "") {
    return null;
  }
  
  try {
    console.log(`Analyzing LinkedIn profile for ${name}: ${linkedinUrl}`);
    
    // Try to fetch real LinkedIn data via Unipile
    const { fetchLinkedInProfile, isUnipileConfigured } = await import('./unipile');
    
    let linkedinData = null;
    if (isUnipileConfigured()) {
      console.log(`[linkedin] Fetching real profile data via Unipile for ${name}...`);
      linkedinData = await fetchLinkedInProfile(linkedinUrl);
      if (linkedinData) {
        console.log(`[linkedin] Successfully retrieved profile for ${linkedinData.name}`);
      }
    } else {
      console.log(`[linkedin] Unipile not configured, using AI inference only`);
    }
    
    // Build the prompt with real LinkedIn data if available
    let profileContext = "";
    if (linkedinData) {
      profileContext = `
REAL LINKEDIN PROFILE DATA:
- Full Name: ${linkedinData.name}
- Headline: ${linkedinData.headline}
- Location: ${linkedinData.location}
- Current Position: ${linkedinData.currentPosition} at ${linkedinData.currentCompany}
- Years of Experience: ${linkedinData.yearsExperience || "Unknown"}
- Summary: ${linkedinData.summary || "Not provided"}
- Skills: ${linkedinData.skills.join(", ") || "None listed"}
- Education: ${linkedinData.education.join("; ") || "None listed"}
- Previous Companies: ${linkedinData.previousCompanies.join(", ") || "None listed"}
- Experience Details:
${linkedinData.experienceDetails.map(exp => 
  `  - ${exp.position} at ${exp.company} (${exp.duration}): ${exp.description || "No description"}`
).join("\n")}

Use this REAL profile data to provide an accurate assessment. Do NOT make up information - base your analysis strictly on the data provided above.`;
    } else {
      profileContext = `LinkedIn URL provided but profile data not accessible. Provide a conservative assessment based only on the name, role, and any patterns you can infer from the URL. Be explicit that profile details could not be verified.`;
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a VC analyst evaluating a startup team member's LinkedIn profile. 
          Analyze the profile and assess their fit for the stated role at the company.
          
          Return a JSON object with:
          - currentPosition: Their current job title
          - company: Current or most recent company
          - yearsExperience: Total years of relevant professional experience (number or null)
          - education: Array of educational credentials (university, degree)
          - previousCompanies: Array of notable previous employers
          - skills: Array of key skills relevant to their role
          - relevantExperience: Summary of experience most relevant to their startup role
          - strengthsForRole: Array of 2-4 strengths for this specific role
          - potentialConcerns: Array of 0-3 potential concerns or gaps
          - founderFitScore: Score 0-100 for how well suited they are for this role at this type of company`
        },
        {
          role: "user",
          content: `Analyze this team member for a startup:
          Name: ${name}
          Role at Startup: ${role}
          LinkedIn URL: ${linkedinUrl}
          Company Context: ${companyContext}
          
          ${profileContext}
          
          Provide a comprehensive assessment based on the information available.`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    const analysis = JSON.parse(content || "null");
    
    // Enrich with real data if available
    if (linkedinData && analysis) {
      analysis.currentPosition = linkedinData.currentPosition || analysis.currentPosition;
      analysis.company = linkedinData.currentCompany || analysis.company;
      analysis.yearsExperience = linkedinData.yearsExperience || analysis.yearsExperience;
      if (linkedinData.education.length > 0) {
        analysis.education = linkedinData.education;
      }
      if (linkedinData.previousCompanies.length > 0) {
        analysis.previousCompanies = linkedinData.previousCompanies;
      }
      if (linkedinData.skills.length > 0) {
        analysis.skills = linkedinData.skills;
      }
    }
    
    return analysis;
  } catch (error) {
    console.error(`LinkedIn analysis error for ${name}:`, error);
    return null;
  }
}

async function analyzeTeam(
  website: string, 
  teamMembers: { name: string; role: string; linkedinUrl: string }[] | null | undefined,
  companyDescription: string
): Promise<TeamAnalysis> {
  try {
    // First, analyze each team member's LinkedIn profile
    const teamMemberEvaluations: TeamMemberEvaluation[] = [];
    
    if (teamMembers && teamMembers.length > 0) {
      console.log(`Analyzing ${teamMembers.length} team members' LinkedIn profiles...`);
      
      // Analyze all team members in parallel
      const linkedinPromises = teamMembers.map(member =>
        analyzeLinkedInProfile(
          member.name,
          member.role,
          member.linkedinUrl,
          companyDescription
        )
      );
      
      const linkedinResults = await Promise.all(linkedinPromises);
      
      for (let i = 0; i < teamMembers.length; i++) {
        teamMemberEvaluations.push({
          name: teamMembers[i].name,
          role: teamMembers[i].role,
          linkedinUrl: teamMembers[i].linkedinUrl,
          linkedinAnalysis: linkedinResults[i],
        });
      }
    }
    
    // Now do the overall team analysis with LinkedIn context
    const teamContext = teamMemberEvaluations.length > 0
      ? `Team members with LinkedIn data: ${JSON.stringify(teamMemberEvaluations.map(m => ({
          name: m.name,
          role: m.role,
          hasLinkedIn: !!m.linkedinUrl,
          analysis: m.linkedinAnalysis
        })))}`
      : "No team members provided with LinkedIn profiles";
    
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a VC analyst evaluating a startup's founding team. Analyze team composition, founder-market fit, and execution capability.
          
          Return a JSON object with:
          - founders: Array of founder objects with name, background, relevantExperience
          - teamComposition: Object with:
            - hasBusinessLeader: boolean - Does the team have someone with business/sales/marketing expertise?
            - hasTechnicalLeader: boolean - Does the team have strong technical leadership?
            - hasIndustryExpert: boolean - Does anyone have deep domain expertise in the target industry?
            - teamBalance: string describing overall team balance (e.g., "Strong technical, needs business development")
            - gapsIdentified: Array of key hiring needs or capability gaps
          - founderMarketFit: Score 0-100 for how well founders' experience matches the market opportunity
          - executionRiskNotes: Key execution risks based on team composition and backgrounds
          - overallScore: Score 0-100 for overall team strength and startup readiness`
        },
        {
          role: "user",
          content: `Analyze the founding team for: ${website}
          
          Company context: ${companyDescription}
          
          ${teamContext}
          
          Provide a comprehensive team evaluation considering their backgrounds, the company they're building, and founder-market fit.`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content || "{}");
    
    return {
      founders: parsed.founders || [],
      teamMemberEvaluations,
      teamComposition: parsed.teamComposition || {
        hasBusinessLeader: false,
        hasTechnicalLeader: false,
        hasIndustryExpert: false,
        teamBalance: "Unable to assess",
        gapsIdentified: []
      },
      founderMarketFit: parsed.founderMarketFit || 50,
      executionRiskNotes: parsed.executionRiskNotes || "Analysis unavailable",
      overallScore: parsed.overallScore || 50
    };
  } catch (error) {
    console.error("Team analysis error:", error);
    return {
      founders: [],
      teamMemberEvaluations: [],
      teamComposition: {
        hasBusinessLeader: false,
        hasTechnicalLeader: false,
        hasIndustryExpert: false,
        teamBalance: "Analysis unavailable",
        gapsIdentified: []
      },
      founderMarketFit: 50,
      executionRiskNotes: "Analysis unavailable",
      overallScore: 50
    };
  }
}

async function analyzeTraction(website: string, deckData: any): Promise<TractionAnalysis> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a VC analyst evaluating startup traction. Look for signals of product-market fit.
          Return a JSON object with:
          - revenueStage: pre-revenue, early-revenue, scaling, or mature
          - growthSignals: Array of positive growth indicators
          - momentum: Score 0-100 for growth momentum
          - credibility: Score 0-100 for how credible their traction claims are
          - overallScore: Score 0-100 for overall traction`
        },
        {
          role: "user",
          content: `Analyze traction signals for: ${website}.
          Additional context: ${JSON.stringify(deckData || {})}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Traction analysis error:", error);
    return {
      revenueStage: "unknown",
      growthSignals: [],
      momentum: 50,
      credibility: 50,
      overallScore: 50
    };
  }
}

async function analyzeDeck(deckData: any): Promise<DeckAnalysis> {
  // For now, return default values since deck parsing is complex
  return {
    hasTeamSlide: true,
    hasMarketSlide: true,
    hasTractionSlide: true,
    hasBusinessModelSlide: true,
    hasCompetitionSlide: true,
    hasFinancialsSlide: false,
    missingSlides: ["Financial projections"],
    overallScore: 70
  };
}

async function generateScores(
  websiteAnalysis: WebsiteAnalysis,
  marketAnalysis: MarketAnalysis,
  teamAnalysis: TeamAnalysis,
  tractionAnalysis: TractionAnalysis,
  deckAnalysis: DeckAnalysis
): Promise<{
  overallScore: number;
  percentileRank: number;
  keyStrengths: string[];
  keyRisks: string[];
  recommendations: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a VC analyst synthesizing a final evaluation. Based on all the analysis data, provide:
          - overallScore: Weighted average score 0-100
          - percentileRank: Estimated percentile among startups (0-100, higher is better)
          - keyStrengths: 3-5 main strengths
          - keyRisks: 3-5 main risks
          - recommendations: 3-5 actionable recommendations for improvement
          Return as JSON.`
        },
        {
          role: "user",
          content: `Synthesize final evaluation from:
          Website: ${JSON.stringify(websiteAnalysis)}
          Market: ${JSON.stringify(marketAnalysis)}
          Team: ${JSON.stringify(teamAnalysis)}
          Traction: ${JSON.stringify(tractionAnalysis)}
          Deck: ${JSON.stringify(deckAnalysis)}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Scoring error:", error);
    return {
      overallScore: 50,
      percentileRank: 50,
      keyStrengths: ["Analysis in progress"],
      keyRisks: ["Analysis in progress"],
      recommendations: ["Complete analysis for full recommendations"]
    };
  }
}

async function generateInvestorMemo(
  startup: any,
  evaluation: any
): Promise<{ summary: string; recommendation: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a VC analyst writing an IC memo. Create a concise but comprehensive investment memo.
          Return JSON with:
          - summary: 2-3 paragraph executive summary
          - recommendation: Clear investment recommendation with rationale`
        },
        {
          role: "user",
          content: `Write IC memo for: ${startup.name}
          Website: ${startup.website}
          Evaluation: ${JSON.stringify(evaluation)}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Memo generation error:", error);
    return {
      summary: "Memo generation in progress",
      recommendation: "Pending full analysis"
    };
  }
}

async function legacyAnalyzeStartup(startupId: number): Promise<void> {
  console.log(`Starting analysis for startup ${startupId}`);
  
  try {
    // Update status to analyzing
    await storage.updateStartup(startupId, { status: "analyzing" });
    
    const startup = await storage.getStartup(startupId);
    if (!startup) {
      throw new Error("Startup not found");
    }
    
    const websiteUrl = startup.website || "";
    
    // First analyze website to get company context for team analysis
    const websiteAnalysis = await analyzeWebsite(websiteUrl);
    
    // Run remaining analyses in parallel, with team analysis using LinkedIn data
    const [marketAnalysis, teamAnalysis, tractionAnalysis] = await Promise.all([
      analyzeMarket(websiteUrl, null),
      analyzeTeam(
        websiteUrl, 
        startup.teamMembers as { name: string; role: string; linkedinUrl: string }[] | null,
        `${websiteAnalysis.companyDescription} ${startup.description || ''}`
      ),
      analyzeTraction(websiteUrl, null),
    ]);
    
    const deckAnalysis = await analyzeDeck(null);
    
    // Generate final scores
    const scores = await generateScores(
      websiteAnalysis,
      marketAnalysis,
      teamAnalysis,
      tractionAnalysis,
      deckAnalysis
    );
    
    // Generate investor memo
    const investorMemo = await generateInvestorMemo(startup, {
      websiteAnalysis,
      marketAnalysis,
      teamAnalysis,
      tractionAnalysis,
      scores
    });
    
    // Create or update evaluation
    await storage.upsertEvaluation({
      startupId,
      websiteData: websiteAnalysis as any,
      websiteScore: websiteAnalysis.overallScore,
      messagingClarityScore: websiteAnalysis.messagingClarity,
      deckData: deckAnalysis as any,
      deckScore: deckAnalysis.overallScore,
      missingSlideFlags: deckAnalysis.missingSlides as any,
      marketData: marketAnalysis as any,
      marketScore: marketAnalysis.overallScore,
      tamValidation: {
        stated: marketAnalysis.statedTAM,
        validated: marketAnalysis.validatedTAM,
        source: marketAnalysis.tamSource,
      } as any,
      marketCredibility: marketAnalysis.marketCredibility,
      teamData: teamAnalysis as any,
      teamMemberEvaluations: teamAnalysis.teamMemberEvaluations as any,
      teamScore: teamAnalysis.overallScore,
      founderMarketFit: teamAnalysis.founderMarketFit,
      executionRiskNotes: teamAnalysis.executionRiskNotes,
      teamComposition: teamAnalysis.teamComposition as any,
      tractionData: tractionAnalysis as any,
      tractionScore: tractionAnalysis.overallScore,
      momentumScore: tractionAnalysis.momentum,
      tractionCredibility: tractionAnalysis.credibility,
      overallScore: scores.overallScore,
      percentileRank: scores.percentileRank,
      keyStrengths: scores.keyStrengths as any,
      keyRisks: scores.keyRisks as any,
      recommendations: scores.recommendations as any,
      investorMemo: investorMemo as any,
    });
    
    // Update startup with final score
    await storage.updateStartup(startupId, {
      status: "pending_review",
      overallScore: scores.overallScore,
      percentileRank: scores.percentileRank,
    });
    
    console.log(`Analysis complete for startup ${startupId}`);
  } catch (error) {
    console.error(`Analysis failed for startup ${startupId}:`, error);
    // Keep as submitted on error so it can be retried
    await storage.updateStartup(startupId, { status: "submitted" });
  }
}
