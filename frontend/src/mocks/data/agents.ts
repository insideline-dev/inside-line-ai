import type { AgentPrompt } from "@/types/admin";

// Stage 3: Research Pipeline Agents
export const mockResearchAgents: AgentPrompt[] = [
  {
    id: 1,
    agentKey: "researchOrchestrator",
    displayName: "Research Orchestrator",
    description: "Generates research parameters and coordinates the 4 specialized deep research agents",
    category: "orchestrator",
    systemPrompt: `You are the Research Orchestrator. Your role is to coordinate comprehensive startup research using 4 specialized agents.

=== YOUR RESPONSIBILITIES ===
1. **Generate Research Parameters**: Analyze deck/website content to extract:
   - Specific market and target customers
   - Product description and key features
   - Known competitors mentioned
   - Team member names and roles for LinkedIn research

2. **Coordinate Research Agents**: Dispatch tasks to:
   - Team Deep Research: Background on founders/key hires
   - Market Deep Research: TAM/SAM/SOM analysis
   - Product Deep Research: Technical differentiation
   - News Search: Recent mentions and PR

3. **Synthesize Findings**: Combine all research into a unified context document.

=== OUTPUT FORMAT ===
Return structured JSON with research parameters for each agent.`,
    humanPrompt: `Coordinate research for startup evaluation:

Company: {companyName}
Sector: {sector}
Website: {website}

=== EXTRACTED DATA ===
Deck Content: {deckContent}
Website Content: {websiteContent}
Team Members: {teamMembers}

Generate research parameters for all 4 research agents.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "sector", description: "Industry sector", required: true },
      { key: "website", description: "Company website URL", required: false },
      { key: "deckContent", description: "Extracted pitch deck text", required: true },
      { key: "websiteContent", description: "Scraped website content", required: false },
      { key: "teamMembers", description: "List of team members", required: false },
    ],
    outputs: [
      { key: "researchParams", type: "object", description: "Parameters for each research agent" },
      { key: "priorityAreas", type: "array", description: "Key areas requiring deep research" },
    ],
    tools: ["web_search", "document_analysis"],
    version: 2,
    lastModifiedBy: "admin@insideline.vc",
    createdAt: "2024-01-15T00:00:00Z",
    updatedAt: "2024-06-01T00:00:00Z",
  },
  {
    id: 2,
    agentKey: "teamDeepResearch",
    displayName: "Team Deep Research",
    description: "Researches founder backgrounds, previous exits, domain expertise, and network connections",
    category: "research",
    systemPrompt: `You are a Team Research Specialist. Your role is to conduct deep background research on startup founders and key team members.

=== RESEARCH AREAS ===
1. **Founder Track Record**: Previous companies, exits, roles
2. **Domain Expertise**: Years in industry, notable achievements
3. **Education**: Degrees, institutions, relevance to startup
4. **Network**: Notable investors, advisors, board members
5. **Red Flags**: Lawsuits, failed companies, controversies

=== SOURCES TO CHECK ===
- LinkedIn profiles (use provided enrichment data)
- Crunchbase profiles
- News articles and interviews
- Company registries
- Patent databases

Return comprehensive team assessment with confidence scores.`,
    humanPrompt: `Research the founding team of {companyName}:

Team Members:
{teamMembers}

LinkedIn Enrichment Data:
{linkedInData}

Provide detailed background on each team member.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "teamMembers", description: "List of team members with roles", required: true },
      { key: "linkedInData", description: "Enriched LinkedIn profile data", required: false },
    ],
    outputs: [
      { key: "teamProfiles", type: "array", description: "Detailed profile for each team member" },
      { key: "teamScore", type: "number", description: "Overall team strength score (1-10)" },
      { key: "redFlags", type: "array", description: "Any concerns found" },
    ],
    tools: ["web_search", "linkedin_lookup"],
    version: 1,
    createdAt: "2024-01-15T00:00:00Z",
  },
  {
    id: 3,
    agentKey: "marketDeepResearch",
    displayName: "Market Deep Research",
    description: "Analyzes TAM/SAM/SOM, market trends, competitive landscape, and growth drivers",
    category: "research",
    systemPrompt: `You are a Market Research Specialist. Conduct comprehensive market analysis for startup evaluation.

=== ANALYSIS FRAMEWORK ===
1. **Market Sizing**:
   - TAM: Total Addressable Market
   - SAM: Serviceable Addressable Market  
   - SOM: Serviceable Obtainable Market
   - Include data sources and methodology

2. **Market Dynamics**:
   - Growth rate (CAGR)
   - Key drivers and headwinds
   - Regulatory environment
   - Technology disruption potential

3. **Competitive Landscape**:
   - Direct competitors
   - Indirect competitors
   - Market leaders and their market share
   - Barriers to entry

4. **Trends**:
   - Emerging trends
   - Customer behavior shifts
   - Geographic expansion opportunities`,
    humanPrompt: `Analyze the market for {companyName} in the {sector} sector:

Product/Service: {productDescription}
Target Customers: {targetCustomers}
Geographic Focus: {geography}

Provide comprehensive market analysis with data sources.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "sector", description: "Industry sector", required: true },
      { key: "productDescription", description: "Description of product/service", required: true },
      { key: "targetCustomers", description: "Target customer segments", required: true },
      { key: "geography", description: "Geographic focus", required: false },
    ],
    outputs: [
      { key: "marketSize", type: "object", description: "TAM/SAM/SOM with sources" },
      { key: "growthRate", type: "string", description: "Market CAGR" },
      { key: "competitors", type: "array", description: "List of competitors" },
      { key: "trends", type: "array", description: "Key market trends" },
    ],
    tools: ["web_search", "market_data"],
    version: 1,
    createdAt: "2024-01-15T00:00:00Z",
  },
  {
    id: 4,
    agentKey: "productDeepResearch",
    displayName: "Product & Competitor Research",
    description: "Analyzes product differentiation, technology stack, and competitive positioning",
    category: "research",
    systemPrompt: `You are a Product Research Specialist. Analyze product differentiation and competitive positioning.

=== RESEARCH AREAS ===
1. **Product Analysis**:
   - Core value proposition
   - Key features and capabilities
   - Technology stack (if discoverable)
   - IP and patents

2. **Competitive Comparison**:
   - Feature-by-feature comparison
   - Pricing comparison
   - Go-to-market differences
   - Customer reviews and sentiment

3. **Technical Moat**:
   - Proprietary technology
   - Data advantages
   - Network effects
   - Switching costs

4. **Product-Market Fit Signals**:
   - Customer testimonials
   - Case studies
   - Usage metrics (if available)`,
    humanPrompt: `Research the product and competitive landscape for {companyName}:

Product: {productDescription}
Competitors Mentioned: {knownCompetitors}
Website: {website}

Analyze differentiation and competitive positioning.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "productDescription", description: "Description of the product", required: true },
      { key: "knownCompetitors", description: "Competitors mentioned in pitch", required: false },
      { key: "website", description: "Company website URL", required: false },
    ],
    outputs: [
      { key: "productAnalysis", type: "object", description: "Detailed product breakdown" },
      { key: "competitorMatrix", type: "array", description: "Feature comparison matrix" },
      { key: "moatAssessment", type: "object", description: "Competitive moat analysis" },
    ],
    tools: ["web_search", "product_hunt", "g2_reviews"],
    version: 1,
    createdAt: "2024-01-15T00:00:00Z",
  },
  {
    id: 5,
    agentKey: "newsSearch",
    displayName: "News & PR Research",
    description: "Searches for recent news, press releases, funding announcements, and media coverage",
    category: "research",
    systemPrompt: `You are a News Research Specialist. Find recent coverage and announcements about startups.

=== SEARCH AREAS ===
1. **Funding News**: Recent rounds, investors, valuations
2. **Press Releases**: Product launches, partnerships, expansions
3. **Media Coverage**: Tech blogs, industry publications, mainstream media
4. **Social Buzz**: Twitter/X mentions, LinkedIn posts, Reddit discussions
5. **Awards & Recognition**: Industry awards, accelerator participation

=== ANALYSIS ===
- Assess sentiment (positive/negative/neutral)
- Identify key themes and narratives
- Note any controversies or concerns
- Track coverage frequency and recency`,
    humanPrompt: `Search for recent news and coverage about {companyName}:

Founder Names: {founderNames}
Product: {productDescription}
Time Range: Last 12 months

Find all relevant news, press releases, and media mentions.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "founderNames", description: "Names of founders to search", required: false },
      { key: "productDescription", description: "Product for context", required: false },
    ],
    outputs: [
      { key: "newsArticles", type: "array", description: "List of news articles with summaries" },
      { key: "fundingNews", type: "array", description: "Funding-related announcements" },
      { key: "sentiment", type: "string", description: "Overall media sentiment" },
    ],
    tools: ["news_search", "social_media_search"],
    version: 1,
    createdAt: "2024-01-15T00:00:00Z",
  },
];

// Stage 4: Evaluation Pipeline Agents
export const mockEvaluationAgents: AgentPrompt[] = [
  {
    id: 10,
    agentKey: "orchestrator",
    displayName: "Evaluation Orchestrator",
    description: "Coordinates the 11 analysis agents and manages the evaluation workflow",
    category: "orchestrator",
    systemPrompt: `You are the Evaluation Orchestrator. Your role is to coordinate 11 specialized analysis agents to produce a comprehensive startup evaluation.

=== WORKFLOW ===
1. Receive startup data and research findings
2. Dispatch analysis tasks to specialized agents in parallel
3. Collect and validate all analysis results
4. Pass results to Synthesis Agent for final memo

=== AGENTS YOU COORDINATE ===
1. Team Analysis
2. Market Analysis
3. Product Analysis
4. Business Model Analysis
5. Traction Analysis
6. GTM Analysis
7. Competitive Advantage Analysis
8. Financials Analysis
9. Legal & Risk Analysis
10. Deal Terms Analysis
11. Exit Potential Analysis

Ensure all agents receive appropriate context and return structured outputs.`,
    humanPrompt: `Evaluate startup submission:

Company: {companyName}
Stage: {fundingStage}
Sector: {sector}

=== AVAILABLE DATA ===
{startupData}

=== RESEARCH FINDINGS ===
{researchFindings}

Coordinate all 11 analysis agents and compile results.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "fundingStage", description: "Current funding stage", required: true },
      { key: "sector", description: "Industry sector", required: true },
      { key: "startupData", description: "All startup submission data", required: true },
      { key: "researchFindings", description: "Output from research pipeline", required: true },
    ],
    outputs: [
      { key: "analysisResults", type: "object", description: "Combined results from all agents" },
      { key: "evaluationComplete", type: "boolean", description: "Whether all analyses completed" },
    ],
    tools: ["agent_dispatch"],
    version: 3,
    lastModifiedBy: "admin@insideline.vc",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-07-15T00:00:00Z",
  },
  {
    id: 11,
    agentKey: "team",
    displayName: "Team Analysis",
    description: "Evaluates founding team quality, experience, and execution capability",
    category: "analysis",
    systemPrompt: `You are a Team Analysis specialist. Evaluate the founding team's ability to execute on their vision.

=== EVALUATION CRITERIA ===
1. **Founder-Market Fit** (0-10): Domain expertise and insight
2. **Track Record** (0-10): Previous successes, failures, learnings
3. **Complementary Skills** (0-10): Balance of technical/business/industry
4. **Commitment** (0-10): Full-time, equity split, vesting
5. **Network** (0-10): Access to talent, customers, investors

=== WEIGHT BY STAGE ===
- Pre-seed/Seed: Team is 30-40% of evaluation
- Series A+: Track record matters more

Provide specific evidence for each score.`,
    humanPrompt: `Analyze the team of {companyName}:

Team Data:
{teamData}

LinkedIn Research:
{linkedInResearch}

Previous Companies:
{previousCompanies}

Score each criterion and provide overall team assessment.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "teamData", description: "Team member information", required: true },
      { key: "linkedInResearch", description: "LinkedIn enrichment data", required: false },
      { key: "previousCompanies", description: "Founders' previous companies", required: false },
    ],
    outputs: [
      { key: "teamScore", type: "number", description: "Overall team score (0-100)" },
      { key: "criteriaScores", type: "object", description: "Individual criterion scores" },
      { key: "strengths", type: "array", description: "Key team strengths" },
      { key: "concerns", type: "array", description: "Areas of concern" },
    ],
    version: 2,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-05-01T00:00:00Z",
  },
  {
    id: 12,
    agentKey: "market",
    displayName: "Market Analysis",
    description: "Evaluates market size, growth potential, and timing",
    category: "analysis",
    systemPrompt: `You are a Market Analysis specialist. Evaluate the market opportunity for the startup.

=== EVALUATION CRITERIA ===
1. **Market Size** (0-10): TAM/SAM/SOM attractiveness
2. **Growth Rate** (0-10): Market growth trajectory
3. **Timing** (0-10): Why now? Market readiness
4. **Tailwinds** (0-10): Favorable macro trends
5. **Defensibility** (0-10): Ability to capture and retain market share

Validate market claims with research data. Be skeptical of inflated TAM figures.`,
    humanPrompt: `Analyze the market for {companyName}:

Claimed Market: {claimedMarket}
Market Research: {marketResearch}
Sector: {sector}

Provide validated market assessment.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "claimedMarket", description: "Market claims from pitch", required: true },
      { key: "marketResearch", description: "Deep research findings", required: true },
      { key: "sector", description: "Industry sector", required: true },
    ],
    outputs: [
      { key: "marketScore", type: "number", description: "Overall market score (0-100)" },
      { key: "validatedTAM", type: "string", description: "Validated TAM figure" },
      { key: "growthAssessment", type: "string", description: "Growth trajectory analysis" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 13,
    agentKey: "product",
    displayName: "Product Analysis",
    description: "Evaluates product differentiation, technology, and user value",
    category: "analysis",
    systemPrompt: `You are a Product Analysis specialist. Evaluate the product's differentiation and potential.

=== EVALUATION CRITERIA ===
1. **Value Proposition** (0-10): Clear, compelling user benefit
2. **Differentiation** (0-10): Unique vs. competitors
3. **Technology** (0-10): Technical innovation and moat
4. **UX/Design** (0-10): User experience quality
5. **Scalability** (0-10): Ability to scale technically

Look for evidence of product-market fit: user engagement, retention, NPS.`,
    humanPrompt: `Analyze the product of {companyName}:

Product Description: {productDescription}
Product Research: {productResearch}
Competitor Analysis: {competitorAnalysis}

Evaluate product strength and differentiation.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "productDescription", description: "Product description from pitch", required: true },
      { key: "productResearch", description: "Deep research findings", required: true },
      { key: "competitorAnalysis", description: "Competitive analysis", required: false },
    ],
    outputs: [
      { key: "productScore", type: "number", description: "Overall product score (0-100)" },
      { key: "differentiators", type: "array", description: "Key differentiators" },
      { key: "pmfSignals", type: "array", description: "Product-market fit signals" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 14,
    agentKey: "businessModel",
    displayName: "Business Model",
    description: "Evaluates revenue model, unit economics, and scalability",
    category: "analysis",
    systemPrompt: `You are a Business Model specialist. Evaluate the startup's revenue model and economics.

=== EVALUATION CRITERIA ===
1. **Revenue Model** (0-10): Clarity and attractiveness
2. **Unit Economics** (0-10): LTV/CAC, gross margin potential
3. **Pricing Power** (0-10): Ability to raise prices
4. **Recurring Revenue** (0-10): Predictability of revenue
5. **Scalability** (0-10): Operating leverage potential

Focus on path to profitability and capital efficiency.`,
    humanPrompt: `Analyze the business model of {companyName}:

Revenue Model: {revenueModel}
Pricing: {pricing}
Current Metrics: {metrics}

Evaluate business model viability.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "revenueModel", description: "Revenue model description", required: true },
      { key: "pricing", description: "Pricing information", required: false },
      { key: "metrics", description: "Current business metrics", required: false },
    ],
    outputs: [
      { key: "businessModelScore", type: "number", description: "Overall score (0-100)" },
      { key: "unitEconomics", type: "object", description: "Unit economics analysis" },
      { key: "scalabilityPath", type: "string", description: "Path to scale" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 15,
    agentKey: "traction",
    displayName: "Traction Analysis",
    description: "Evaluates revenue, users, growth rates, and momentum",
    category: "analysis",
    systemPrompt: `You are a Traction Analysis specialist. Evaluate the startup's current momentum and growth.

=== EVALUATION CRITERIA ===
1. **Revenue Traction** (0-10): ARR/MRR and growth rate
2. **User Traction** (0-10): User base and engagement
3. **Growth Rate** (0-10): Month-over-month growth
4. **Retention** (0-10): Churn and cohort analysis
5. **Efficiency** (0-10): Burn multiple, CAC payback

Benchmark against stage-appropriate metrics.`,
    humanPrompt: `Analyze the traction of {companyName}:

Revenue: {revenue}
Users: {users}
Growth Metrics: {growthMetrics}
Funding Stage: {fundingStage}

Evaluate traction relative to stage.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "revenue", description: "Revenue information", required: false },
      { key: "users", description: "User metrics", required: false },
      { key: "growthMetrics", description: "Growth rate data", required: false },
      { key: "fundingStage", description: "Current funding stage", required: true },
    ],
    outputs: [
      { key: "tractionScore", type: "number", description: "Overall traction score (0-100)" },
      { key: "growthRate", type: "string", description: "Growth rate assessment" },
      { key: "stageComparison", type: "string", description: "Comparison to stage benchmarks" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 16,
    agentKey: "gtm",
    displayName: "GTM Strategy",
    description: "Evaluates go-to-market strategy, sales motion, and distribution",
    category: "analysis",
    systemPrompt: `You are a GTM Strategy specialist. Evaluate the startup's go-to-market approach.

=== EVALUATION CRITERIA ===
1. **Strategy Clarity** (0-10): Clear, coherent GTM plan
2. **Channel Fit** (0-10): Right channels for target customers
3. **Sales Motion** (0-10): Appropriate sales model (PLG, sales-led, etc.)
4. **Distribution** (0-10): Unique distribution advantages
5. **Execution** (0-10): Evidence of GTM execution capability`,
    humanPrompt: `Analyze the GTM strategy of {companyName}:

GTM Plan: {gtmPlan}
Target Customers: {targetCustomers}
Current Channels: {channels}

Evaluate go-to-market viability.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "gtmPlan", description: "Go-to-market plan", required: true },
      { key: "targetCustomers", description: "Target customer segments", required: true },
      { key: "channels", description: "Distribution channels", required: false },
    ],
    outputs: [
      { key: "gtmScore", type: "number", description: "Overall GTM score (0-100)" },
      { key: "channelAssessment", type: "string", description: "Channel strategy assessment" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 17,
    agentKey: "competitiveAdvantage",
    displayName: "Competitive Advantage",
    description: "Evaluates moat, barriers to entry, and defensibility",
    category: "analysis",
    systemPrompt: `You are a Competitive Advantage specialist. Evaluate the startup's defensibility.

=== MOAT TYPES ===
1. **Network Effects**: Value increases with users
2. **Economies of Scale**: Cost advantages at scale
3. **Switching Costs**: Lock-in factors
4. **Brand**: Brand recognition and trust
5. **Data**: Proprietary data advantages
6. **IP**: Patents, trade secrets
7. **Regulatory**: Regulatory moats

Assess sustainability of competitive advantages.`,
    humanPrompt: `Analyze competitive advantages of {companyName}:

Claimed Moats: {claimedMoats}
Competitor Research: {competitorResearch}
Product Analysis: {productAnalysis}

Evaluate defensibility and sustainability.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "claimedMoats", description: "Claimed competitive advantages", required: true },
      { key: "competitorResearch", description: "Competitor analysis", required: true },
      { key: "productAnalysis", description: "Product differentiation analysis", required: false },
    ],
    outputs: [
      { key: "moatScore", type: "number", description: "Overall moat score (0-100)" },
      { key: "moatTypes", type: "array", description: "Identified moat types" },
      { key: "sustainability", type: "string", description: "Moat sustainability assessment" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 18,
    agentKey: "financials",
    displayName: "Financials Analysis",
    description: "Evaluates financial projections, burn rate, and capital efficiency",
    category: "analysis",
    systemPrompt: `You are a Financials Analysis specialist. Evaluate the startup's financial health and projections.

=== EVALUATION AREAS ===
1. **Current Financials**: Revenue, burn, runway
2. **Projections**: Realism of growth projections
3. **Unit Economics**: Margins, LTV/CAC
4. **Capital Efficiency**: Burn multiple, capital required to milestones
5. **Funding Need**: Use of funds, milestone clarity`,
    humanPrompt: `Analyze the financials of {companyName}:

Current Financials: {currentFinancials}
Projections: {projections}
Funding Ask: {fundingAsk}
Use of Funds: {useOfFunds}

Evaluate financial viability and capital efficiency.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "currentFinancials", description: "Current financial data", required: true },
      { key: "projections", description: "Financial projections", required: false },
      { key: "fundingAsk", description: "Amount being raised", required: true },
      { key: "useOfFunds", description: "Planned use of funds", required: false },
    ],
    outputs: [
      { key: "financialsScore", type: "number", description: "Overall financials score (0-100)" },
      { key: "runway", type: "string", description: "Current runway" },
      { key: "burnMultiple", type: "number", description: "Burn multiple" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 19,
    agentKey: "legal",
    displayName: "Legal & Risk",
    description: "Evaluates legal structure, IP protection, and risk factors",
    category: "analysis",
    systemPrompt: `You are a Legal & Risk specialist. Evaluate the startup's legal health and risk profile.

=== RISK AREAS ===
1. **Corporate Structure**: Clean cap table, proper incorporation
2. **IP Protection**: Patents, trademarks, trade secrets
3. **Regulatory Risk**: Compliance requirements, regulatory changes
4. **Litigation Risk**: Existing or potential lawsuits
5. **Key Person Risk**: Founder dependency
6. **Market Risk**: External factors that could harm business`,
    humanPrompt: `Analyze legal and risk factors for {companyName}:

Corporate Info: {corporateInfo}
IP Assets: {ipAssets}
Regulatory Environment: {regulatoryInfo}
Known Risks: {knownRisks}

Identify and assess all risk factors.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "corporateInfo", description: "Corporate structure info", required: false },
      { key: "ipAssets", description: "IP and patent info", required: false },
      { key: "regulatoryInfo", description: "Regulatory considerations", required: false },
      { key: "knownRisks", description: "Known risk factors", required: false },
    ],
    outputs: [
      { key: "riskScore", type: "number", description: "Overall risk score (0-100, higher is better)" },
      { key: "riskFactors", type: "array", description: "Identified risk factors" },
      { key: "mitigations", type: "array", description: "Suggested mitigations" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 20,
    agentKey: "dealTerms",
    displayName: "Deal Terms",
    description: "Evaluates valuation, terms, and investment attractiveness",
    category: "analysis",
    systemPrompt: `You are a Deal Terms specialist. Evaluate the investment terms and valuation.

=== EVALUATION AREAS ===
1. **Valuation**: Fair value based on comparables and metrics
2. **Terms**: Investor-friendly vs. founder-friendly
3. **Structure**: SAFE, convertible note, priced round
4. **Pro-rata Rights**: Future investment rights
5. **Governance**: Board seats, information rights`,
    humanPrompt: `Analyze deal terms for {companyName}:

Valuation: {valuation}
Terms: {terms}
Funding Stage: {fundingStage}
Comparable Raises: {comparables}

Evaluate deal attractiveness.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "valuation", description: "Proposed valuation", required: true },
      { key: "terms", description: "Investment terms", required: true },
      { key: "fundingStage", description: "Funding stage", required: true },
      { key: "comparables", description: "Comparable raises", required: false },
    ],
    outputs: [
      { key: "termsScore", type: "number", description: "Deal terms score (0-100)" },
      { key: "valuationAssessment", type: "string", description: "Valuation analysis" },
      { key: "termsConcerns", type: "array", description: "Any concerning terms" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 21,
    agentKey: "exitPotential",
    displayName: "Exit Potential",
    description: "Evaluates potential exit paths, acquirers, and return potential",
    category: "analysis",
    systemPrompt: `You are an Exit Potential specialist. Evaluate the startup's exit opportunities.

=== EXIT ANALYSIS ===
1. **Exit Paths**: IPO, M&A, strategic acquisition
2. **Potential Acquirers**: Strategic buyers, PE firms
3. **Comparable Exits**: Similar company exits
4. **Timeline**: Expected time to exit
5. **Return Potential**: Expected multiple based on entry valuation`,
    humanPrompt: `Analyze exit potential for {companyName}:

Sector: {sector}
Business Model: {businessModel}
Current Metrics: {metrics}
Valuation: {valuation}
Comparable Exits: {comparableExits}

Evaluate exit opportunities and return potential.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "sector", description: "Industry sector", required: true },
      { key: "businessModel", description: "Business model", required: true },
      { key: "metrics", description: "Current metrics", required: false },
      { key: "valuation", description: "Current valuation", required: true },
      { key: "comparableExits", description: "Similar exits", required: false },
    ],
    outputs: [
      { key: "exitScore", type: "number", description: "Exit potential score (0-100)" },
      { key: "exitPaths", type: "array", description: "Likely exit paths" },
      { key: "potentialAcquirers", type: "array", description: "Potential acquirers" },
      { key: "returnPotential", type: "string", description: "Expected return multiple" },
    ],
    version: 1,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 22,
    agentKey: "synthesis",
    displayName: "Investment Synthesis",
    description: "Synthesizes all analyses into final investment memo and recommendation",
    category: "synthesis",
    systemPrompt: `You are the Investment Synthesis agent. Your role is to combine all analysis results into a comprehensive investment memo.

=== MEMO STRUCTURE ===
1. **Executive Summary**: 2-3 sentence overview
2. **Investment Thesis**: Why this is a good/bad investment
3. **Key Strengths**: Top 3-5 strengths
4. **Key Risks**: Top 3-5 risks with mitigations
5. **Section Summaries**: Summary of each analysis area
6. **Overall Score**: Weighted score based on stage
7. **Recommendation**: Invest / Pass / More Info Needed

Be balanced, specific, and actionable.`,
    humanPrompt: `Synthesize investment analysis for {companyName}:

Funding Stage: {fundingStage}
All Analysis Results: {analysisResults}
Stage Weights: {stageWeights}

Generate final investment memo with recommendation.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "fundingStage", description: "Funding stage", required: true },
      { key: "analysisResults", description: "Results from all 11 analysis agents", required: true },
      { key: "stageWeights", description: "Scoring weights for this stage", required: true },
    ],
    outputs: [
      { key: "investmentMemo", type: "object", description: "Complete investment memo" },
      { key: "overallScore", type: "number", description: "Final weighted score (0-100)" },
      { key: "recommendation", type: "string", description: "Investment recommendation" },
    ],
    version: 2,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-08-01T00:00:00Z",
  },
];

// Stage 5: Investor Matching Agents
export const mockInvestorAgents: AgentPrompt[] = [
  {
    id: 30,
    agentKey: "investorThesis",
    displayName: "Investor Thesis Agent",
    description: "Analyzes and structures investor investment theses for matching",
    category: "investor",
    systemPrompt: `You are an Investor Thesis specialist. Your role is to analyze and structure investor investment preferences.

=== THESIS COMPONENTS ===
1. **Stage Preference**: Pre-seed, Seed, Series A, etc.
2. **Sector Focus**: Industries and verticals
3. **Geography**: Target regions/countries
4. **Check Size**: Typical investment range
5. **Value Add**: What the investor brings beyond capital
6. **Anti-Portfolio**: What they explicitly avoid

Create structured, queryable thesis representation.`,
    humanPrompt: `Analyze and structure investor thesis:

Investor: {investorName}
Thesis Description: {thesisDescription}
Portfolio: {portfolio}
Investment History: {investmentHistory}

Create structured thesis for matching.`,
    inputs: [
      { key: "investorName", description: "Name of the investor", required: true },
      { key: "thesisDescription", description: "Investor's stated thesis", required: true },
      { key: "portfolio", description: "Current portfolio companies", required: false },
      { key: "investmentHistory", description: "Past investments", required: false },
    ],
    outputs: [
      { key: "structuredThesis", type: "object", description: "Structured thesis representation" },
      { key: "matchingCriteria", type: "object", description: "Criteria for startup matching" },
    ],
    version: 1,
    createdAt: "2024-02-01T00:00:00Z",
  },
  {
    id: 31,
    agentKey: "thesisAlignment",
    displayName: "Thesis Alignment",
    description: "Matches startups to investor theses and generates personalized introductions",
    category: "investor",
    systemPrompt: `You are a Thesis Alignment specialist. Match startups with appropriate investors based on thesis fit.

=== MATCHING CRITERIA ===
1. **Stage Match**: Does funding stage align?
2. **Sector Match**: Does industry/vertical align?
3. **Geography Match**: Does location align?
4. **Size Match**: Does check size align with raise?
5. **Thesis Fit**: Does company match investor's stated thesis?
6. **Portfolio Synergy**: Synergies with existing portfolio?

Generate match scores and personalized intro talking points.`,
    humanPrompt: `Match startup to investors:

Startup: {companyName}
Startup Profile: {startupProfile}
Investment Memo: {investmentMemo}

Investor Theses: {investorTheses}

Generate matching scores and intro recommendations.`,
    inputs: [
      { key: "companyName", description: "Name of the startup", required: true },
      { key: "startupProfile", description: "Startup summary", required: true },
      { key: "investmentMemo", description: "Investment memo", required: true },
      { key: "investorTheses", description: "Available investor theses", required: true },
    ],
    outputs: [
      { key: "matches", type: "array", description: "Ranked investor matches with scores" },
      { key: "introTalkingPoints", type: "object", description: "Personalized intro points per investor" },
    ],
    version: 1,
    createdAt: "2024-02-01T00:00:00Z",
  },
];

// Combined mock data
export const mockAgents: AgentPrompt[] = [
  ...mockResearchAgents,
  ...mockEvaluationAgents,
  ...mockInvestorAgents,
];

// Helper functions
export function getAgentByKey(key: string): AgentPrompt | undefined {
  return mockAgents.find((a) => a.agentKey === key);
}

export function getAgentsByCategory(category: string): AgentPrompt[] {
  return mockAgents.filter((a) => a.category === category);
}

export function getResearchOrchestrator(): AgentPrompt | undefined {
  return mockAgents.find((a) => a.agentKey === "researchOrchestrator");
}

export function getEvaluationOrchestrator(): AgentPrompt | undefined {
  return mockAgents.find((a) => a.agentKey === "orchestrator");
}

export function getResearchAgents(): AgentPrompt[] {
  return mockAgents.filter((a) => a.category === "research");
}

export function getAnalysisAgents(): AgentPrompt[] {
  return mockAgents.filter((a) => a.category === "analysis");
}

export function getSynthesisAgent(): AgentPrompt | undefined {
  return mockAgents.find((a) => a.agentKey === "synthesis");
}

export function getInvestorAgents(): AgentPrompt[] {
  return mockAgents.filter((a) => a.category === "investor");
}
