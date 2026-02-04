import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { fetchLinkedInProfile, searchLinkedInByName, isUnipileConfigured, type LinkedInProfileData } from "./unipile";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface WebPageContent {
  url: string;
  title: string;
  description: string;
  mainContent: string;
  links: { text: string; href: string }[];
  headings: string[];
  metadata?: {
    ogImage?: string;
    ogTitle?: string;
    keywords?: string;
    author?: string;
  };
  error?: string;
}

export interface TeamMemberDiscovered {
  name: string;
  role: string;
  linkedinUrl?: string;
  email?: string;
  bio?: string;
  imageUrl?: string;
  source: 'deck' | 'website' | 'linkedin';
  linkedinData?: LinkedInProfileData;
}

export interface TeamMemberResearch {
  name: string;
  role: string;
  linkedinProfile?: LinkedInProfileData;
  pastAccomplishments: string[];
  patents: Array<{ title: string; year?: string; url?: string }>;
  previousExits: Array<{ company: string; type: 'IPO' | 'acquisition' | 'merger' | 'other'; year?: string; value?: string }>;
  notableAchievements: string[];
  educationHighlights: string[];
  confidenceScore: number;
  sources: string[];
}

export interface MarketResearch {
  totalAddressableMarket: {
    value: string;
    year: string;
    source: string;
    confidence: 'high' | 'medium' | 'low';
  };
  serviceableAddressableMarket?: {
    value: string;
    source: string;
  };
  marketGrowthRate: {
    cagr: string;
    period: string;
    source: string;
  };
  marketTrends: Array<{
    trend: string;
    impact: 'positive' | 'negative' | 'neutral' | string;
    timeframe: string;
  }>;
  marketDrivers: string[];
  marketChallenges: string[];
  forecasts: Array<{
    metric: string;
    value: string;
    year: string;
    source: string;
  }>;
  regulatoryLandscape?: string;
  tamValidation?: {
    claimAccuracy: 'accurate' | 'overstated' | 'understated' | 'unverifiable' | string;
    explanation: string;
  };
  sources: string[];
}

export interface CompetitorProfile {
  name: string;
  website?: string;
  description: string;
  marketShare?: string;
  funding?: {
    totalRaised: string;
    lastRound?: string;
    lastRoundDate?: string;
    keyInvestors?: string[];
  };
  strengths: string[];
  weaknesses: string[];
  productFeatures: string[];
  pricing?: string;
  targetCustomers: string;
  differentiators: string[];
  recentNews?: string[];
  sources: string[];
}

export interface ProductResearch {
  productDescription: string;
  coreFeatures: string[];
  technicalStack?: string[];
  reviews: Array<{
    source: string;
    rating?: string;
    summary: string;
    url?: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  competitivePosition: string;
  marketDynamics: {
    entryBarriers: string;
    substitutes: string[];
    buyerPower: string;
    supplierPower: string;
  };
  competitors: CompetitorProfile[];
  sources: string[];
}

export interface NewsItem {
  title: string;
  url: string;
  date?: string;
  source: string;
  summary: string;
  category: 'funding' | 'product' | 'partnership' | 'growth' | 'general';
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface NewsResearch {
  companyMentions: NewsItem[];
  fundingNews: NewsItem[];
  productReleases: NewsItem[];
  industryNews: NewsItem[];
  totalMentions: number;
  sentimentOverview: {
    positive: number;
    negative: number;
    neutral: number;
  };
  sources: string[];
}

export interface BackgroundResponseIds {
  team: string;
  market: string;
  product: string;
  initiatedAt: string;
}

export interface ExtractedData {
  companyName: string;
  website: string;
  sector: string;
  websiteContent: WebPageContent[];
  deckContent: string;
  documentContent: string[];
  teamMembers: TeamMemberDiscovered[];
  backgroundResponseIds?: BackgroundResponseIds;
}

export interface ResearchParameters {
  companyName: string;
  sector: string;
  specificMarket: string;
  productDescription: string;
  targetCustomers: string;
  knownCompetitors: string[];
  geographicFocus: string;
  businessModel: string;
  fundingStage: string;
  teamMembers: TeamMemberDiscovered[];
  claimedMetrics: {
    tam?: string;
    growthRate?: string;
    revenue?: string;
    customers?: string;
  };
}

export interface ComprehensiveResearchResult {
  extractedData: ExtractedData;
  researchParameters: ResearchParameters;
  teamResearch: TeamMemberResearch[];
  marketResearch: MarketResearch;
  productResearch: ProductResearch;
  newsResearch: NewsResearch;
  researchSummary: {
    totalSources: number;
    dataQuality: 'high' | 'medium' | 'low' | 'pending';
    keyFindings: string[];
    dataGaps: string[];
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  
  if (!apiKey) {
    console.warn('[research-orchestrator] AI_INTEGRATIONS_OPENAI_API_KEY not set');
    return null;
  }
  
  return new OpenAI({ apiKey, baseURL });
}

function getDirectOpenAIClient(): OpenAI | null {
  // Use direct OpenAI API key for GPT-5.2 with web search (requires v1/responses)
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('[research-orchestrator] OPENAI_API_KEY not set for deep research');
    return null;
  }
  
  return new OpenAI({ apiKey });
}

// Return type for background deep research
export interface BackgroundResearchResponse {
  responseId: string;
  status: string;
  createdAt: Date;
  agentType: string;
}

// Background mode deep research - creates background response, polls every 15 seconds until complete
async function callDeepResearchModel(prompt: string, agentType: string = 'deep-research'): Promise<any> {
  const openai = getDirectOpenAIClient();
  if (!openai) {
    throw new Error("OPENAI_API_KEY is not set for deep research");
  }
  
  console.log(`[${agentType}] Creating GPT-5.2 background response...`);
  
  // Create the response with background:true for async execution
  const createResponse = await (openai as any).responses.create({
    model: "gpt-5.2",
    input: prompt,
    tools: [{ type: "web_search" }],
    reasoning: { effort: "medium" },
    store: true,
    background: true, // Returns immediately, we poll for completion
  });
  
  const responseId = createResponse?.id;
  const initialStatus = createResponse?.status || 'unknown';
  
  if (!responseId) {
    throw new Error('No response ID returned from API');
  }
  
  // Log background response creation
  console.log(`[${agentType}] ====== BACKGROUND RESPONSE CREATED ======`);
  console.log(`[${agentType}] Response ID: ${responseId}`);
  console.log(`[${agentType}] Initial Status: ${initialStatus}`);
  console.log(`[${agentType}] Model: gpt-5.2`);
  console.log(`[${agentType}] Created At: ${new Date().toISOString()}`);
  console.log(`[${agentType}] Prompt Length: ${prompt.length} chars`);
  console.log(`[${agentType}] Polling Interval: 15 seconds`);
  console.log(`[${agentType}] ==========================================`);
  
  // Poll every 15 seconds until completion
  const POLL_INTERVAL = 15000; // 15 seconds
  const MAX_POLL_TIME = 1800000; // 30 minutes max
  const startTime = Date.now();
  let pollCount = 0;
  let response = createResponse;
  
  // Terminal statuses: completed, failed, incomplete
  const isTerminal = (status: string) => ['completed', 'failed', 'incomplete'].includes(status);
  
  while (!isTerminal(response?.status)) {
    if (Date.now() - startTime > MAX_POLL_TIME) {
      throw new Error(`[${agentType}] Response polling timed out after ${MAX_POLL_TIME / 1000}s`);
    }
    
    pollCount++;
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`[${agentType}] ====== POLLING STATUS (${pollCount}) ======`);
    console.log(`[${agentType}] Response ID: ${responseId}`);
    console.log(`[${agentType}] Current Status: ${response?.status}`);
    console.log(`[${agentType}] Elapsed Time: ${elapsedSec}s`);
    console.log(`[${agentType}] Next poll in: 15 seconds`);
    console.log(`[${agentType}] ==========================================`);
    
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    
    // Retrieve the response status
    response = await (openai as any).responses.retrieve(responseId);
  }
  
  // Handle terminal states
  if (response?.status === 'failed') {
    const errorType = response?.error?.type || 'unknown';
    const errorMsg = response?.error?.message || 'Unknown error';
    console.error(`[${agentType}] ====== RESPONSE FAILED ======`);
    console.error(`[${agentType}] Error Type: ${errorType}`);
    console.error(`[${agentType}] Error Message: ${errorMsg}`);
    console.error(`[${agentType}] ==============================`);
    throw new Error(`Response failed (${errorType}): ${errorMsg}`);
  }
  
  if (response?.status === 'incomplete') {
    console.warn(`[${agentType}] Response incomplete, extracting partial output...`);
  }
  
  // Extract text from responses API format - use output_text directly
  const resultText = (response as any).output_text || '';
  
  const elapsedTotal = Math.round((Date.now() - startTime) / 1000);
  console.log(`[${agentType}] ====== RESPONSE COMPLETED ======`);
  console.log(`[${agentType}] Response ID: ${responseId}`);
  console.log(`[${agentType}] Final Status: ${response?.status}`);
  console.log(`[${agentType}] Total Time: ${elapsedTotal}s`);
  console.log(`[${agentType}] Poll Count: ${pollCount}`);
  console.log(`[${agentType}] Output Length: ${resultText.length} chars`);
  console.log(`[${agentType}] =================================`);
  
  if (!resultText) {
    console.warn(`[${agentType}] Warning: No text extracted from response`);
  }
  
  // Parse JSON from the response
  const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : resultText.trim();
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error(`[${agentType}] Failed to parse JSON response:`, jsonStr.substring(0, 500));
    throw new Error('Failed to parse deep research response as JSON');
  }
}

// Utility function to check status of a background response
export async function checkBackgroundResponseStatus(responseId: string, agentType: string = 'deep-research'): Promise<{
  status: string;
  output?: any;
  error?: string;
}> {
  const openai = getDirectOpenAIClient();
  if (!openai) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  try {
    const response = await (openai as any).responses.retrieve(responseId);
    
    console.log(`[${agentType}] ====== STATUS CHECK ======`);
    console.log(`[${agentType}] Response ID: ${responseId}`);
    console.log(`[${agentType}] Current Status: ${response?.status}`);
    console.log(`[${agentType}] Checked At: ${new Date().toISOString()}`);
    
    if (response?.status === 'completed') {
      // Extract text from responses API format
      let resultText = '';
      for (const item of response.output || []) {
        if (item.type === 'message') {
          for (const content of item.content || []) {
            if (content.type === 'text') {
              resultText = content.text;
            }
          }
        }
      }
      console.log(`[${agentType}] Output Length: ${resultText.length} chars`);
      console.log(`[${agentType}] ===========================`);
      
      // Try to parse JSON
      const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : resultText.trim();
      
      try {
        return { status: 'completed', output: JSON.parse(jsonStr) };
      } catch {
        return { status: 'completed', output: resultText };
      }
    }
    
    if (response?.status === 'failed') {
      const errorMsg = response?.error?.message || 'Unknown error';
      console.log(`[${agentType}] Error: ${errorMsg}`);
      console.log(`[${agentType}] ===========================`);
      return { status: 'failed', error: errorMsg };
    }
    
    console.log(`[${agentType}] ===========================`);
    return { status: response?.status || 'unknown' };
  } catch (error: any) {
    console.error(`[${agentType}] Status check error:`, error.message);
    return { status: 'error', error: error.message };
  }
}

function getStandardSearchModel() {
  // Use direct OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  return new ChatOpenAI({
    modelName: "gpt-5.2",
    openAIApiKey: apiKey,
    // No baseURL - use OpenAI directly
  });
}

async function fetchWithTimeout(url: string, timeout = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VCAnalyzer/2.0; +https://accesslayer.ai)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// STAGE 1: COMPREHENSIVE WEBSITE SCRAPING
// ============================================================================

async function scrapeWebpage(url: string): Promise<WebPageContent> {
  console.log(`[deep-scraper] Scraping: ${url}`);
  
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      return {
        url,
        title: '',
        description: '',
        mainContent: '',
        links: [],
        headings: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract metadata before removing elements
    const metadata = {
      ogImage: $('meta[property="og:image"]').attr('content'),
      ogTitle: $('meta[property="og:title"]').attr('content'),
      keywords: $('meta[name="keywords"]').attr('content'),
      author: $('meta[name="author"]').attr('content'),
    };
    
    // Remove non-content elements
    $('script, style, noscript, iframe').remove();
    
    const title = $('title').text().trim() || $('h1').first().text().trim();
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || '';
    
    const headings: string[] = [];
    $('h1, h2, h3, h4').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 300) {
        headings.push(text);
      }
    });
    
    const links: { text: string; href: string }[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
        try {
          const absoluteUrl = new URL(href, url).toString();
          if (links.length < 100) {
            links.push({ text: text.substring(0, 150), href: absoluteUrl });
          }
        } catch {}
      }
    });
    
    // Extract main content more thoroughly
    let mainContent = '';
    
    // Try specific content containers first
    const contentSelectors = [
      'main', 'article', '[role="main"]', '.content', '#content', '.main',
      '.page-content', '.post-content', '.entry-content', '.article-content',
      '#main-content', '.container main', '.wrapper main'
    ];
    
    for (const selector of contentSelectors) {
      const content = $(selector).text().trim().replace(/\s+/g, ' ');
      if (content.length > mainContent.length) {
        mainContent = content;
      }
    }
    
    // Fallback to body
    if (mainContent.length < 500) {
      $('nav, footer, header, aside, .sidebar, .menu, .navigation').remove();
      mainContent = $('body').text().trim().replace(/\s+/g, ' ');
    }
    
    // Limit content length
    mainContent = mainContent.substring(0, 25000);
    
    console.log(`[deep-scraper] Extracted ${mainContent.length} chars, ${links.length} links from ${url}`);
    
    return { url, title, description, mainContent, links, headings, metadata };
  } catch (error: any) {
    console.error(`[deep-scraper] Error scraping ${url}:`, error.message);
    return {
      url,
      title: '',
      description: '',
      mainContent: '',
      links: [],
      headings: [],
      error: error.message,
    };
  }
}

export async function deepScrapeWebsite(baseUrl: string, maxPages: number = 20): Promise<WebPageContent[]> {
  console.log(`[deep-scraper] Starting deep scrape of: ${baseUrl} (max ${maxPages} pages)`);
  
  const results: WebPageContent[] = [];
  const visited = new Set<string>();
  const toVisit: string[] = [];
  
  try {
    const baseUrlObj = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
    const baseHostname = baseUrlObj.hostname;
    
    // Start with homepage
    const homePage = await scrapeWebpage(baseUrlObj.toString());
    results.push(homePage);
    visited.add(baseUrlObj.toString());
    visited.add(baseUrlObj.toString() + '/');
    
    if (homePage.error) {
      return results;
    }
    
    // Priority pages to look for
    const priorityPatterns = [
      '/about', '/team', '/leadership', '/founders', '/people',
      '/product', '/products', '/platform', '/solution', '/solutions', '/features',
      '/pricing', '/plans',
      '/company', '/careers', '/jobs',
      '/customers', '/case-studies', '/testimonials',
      '/technology', '/how-it-works',
      '/blog', '/news', '/press',
      '/investors', '/funding',
      '/contact', '/demo'
    ];
    
    // Collect internal links
    const internalLinks = homePage.links
      .filter(link => {
        try {
          const linkUrl = new URL(link.href);
          return linkUrl.hostname === baseHostname || 
                 linkUrl.hostname === 'www.' + baseHostname ||
                 linkUrl.hostname.endsWith('.' + baseHostname);
        } catch {
          return false;
        }
      })
      .map(link => link.href);
    
    // Prioritize links
    const priorityLinks: string[] = [];
    const otherLinks: string[] = [];
    
    for (const link of internalLinks) {
      const path = new URL(link).pathname.toLowerCase();
      if (priorityPatterns.some(p => path.includes(p))) {
        priorityLinks.push(link);
      } else if (!path.includes('/blog/') && !path.includes('/news/') && path.split('/').length <= 4) {
        otherLinks.push(link);
      }
    }
    
    // Add priority pattern URLs directly
    for (const pattern of priorityPatterns) {
      try {
        const directUrl = new URL(pattern, baseUrlObj).toString();
        if (!visited.has(directUrl) && !priorityLinks.includes(directUrl)) {
          priorityLinks.push(directUrl);
        }
      } catch {}
    }
    
    // Combine and deduplicate
    toVisit.push(...priorityLinks, ...otherLinks);
    const uniqueToVisit = [...new Set(toVisit)];
    
    // Scrape pages in parallel batches
    const batchSize = 5;
    let pagesScraped = 1;
    
    for (let i = 0; i < uniqueToVisit.length && pagesScraped < maxPages; i += batchSize) {
      const batch = uniqueToVisit.slice(i, i + batchSize).filter(url => !visited.has(url));
      
      if (batch.length === 0) continue;
      
      const batchResults = await Promise.all(
        batch.map(async (url) => {
          if (visited.has(url)) return null;
          visited.add(url);
          return scrapeWebpage(url);
        })
      );
      
      for (const result of batchResults) {
        if (result && !result.error && result.mainContent.length > 100) {
          results.push(result);
          pagesScraped++;
        }
      }
    }
    
    console.log(`[deep-scraper] Deep scrape complete: ${results.length} pages from ${baseUrl}`);
  } catch (error: any) {
    console.error(`[deep-scraper] Error in deep scrape:`, error.message);
  }
  
  return results;
}

// ============================================================================
// STAGE 2: TEAM DISCOVERY & LINKEDIN EXTRACTION
// ============================================================================

export async function discoverTeamMembers(
  _websiteContent: WebPageContent[],
  deckContent: string
): Promise<TeamMemberDiscovered[]> {
  const openai = getOpenAIClient();
  
  if (!openai) {
    console.log('[team-discovery] OpenAI not configured');
    return [];
  }
  
  console.log('[team-discovery] Discovering team members from pitch deck only...');
  
  // Only use deck content - ignore website to avoid picking up unrelated people
  const deckExcerpt = deckContent?.substring(0, 25000) || '';
  
  if (!deckExcerpt) {
    console.log('[team-discovery] No deck content available');
    return [];
  }
  
  const prompt = `Analyze the following pitch deck to identify the TOP 6 most impactful leadership team members.

INCLUDE (in order of priority):
1. Founders and Co-founders
2. C-suite executives (CEO, CTO, CFO, COO, CMO, CRO, CPO, etc.)
3. VPs (VP of Engineering, VP of Sales, VP of Product, etc.)
4. Directors (Director of Engineering, Director of Marketing, etc.)

LIMIT: Return only the TOP 10 most senior/impactful people. Prioritize founders and C-level first.

DO NOT INCLUDE:
- Advisors (even if they have an "Advisor" title)
- Board members (unless they are also executives)
- People mentioned in endorsements/testimonials
- Customers or partners
- Industry figures mentioned as references
- Anyone from OTHER companies providing quotes
- Regular employees below Director level

=== PITCH DECK CONTENT ===
${deckExcerpt}

For EACH core team member, extract:
1. Full name (exactly as written)
2. Role/title (exactly as written)
3. LinkedIn URL if mentioned
4. Bio/description if available

Return JSON:
{
  "teamMembers": [
    {
      "name": "Full Name",
      "role": "Exact Title",
      "linkedinUrl": "https://linkedin.com/in/..." or null,
      "bio": "Short bio if available" or null,
      "source": "deck"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4000,
    });
    
    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    
    const members: TeamMemberDiscovered[] = (parsed.teamMembers || []).map((m: any) => ({
      name: m.name || '',
      role: m.role || '',
      linkedinUrl: m.linkedinUrl || undefined,
      bio: m.bio || undefined,
      source: 'deck' as const, // Only using deck content
    })).filter((m: TeamMemberDiscovered) => m.name && m.name.length > 1);
    
    console.log(`[team-discovery] Discovered ${members.length} team members`);
    return members;
  } catch (error: any) {
    console.error('[team-discovery] Error:', error.message);
    return [];
  }
}

export async function enrichTeamWithLinkedIn(
  teamMembers: TeamMemberDiscovered[],
  companyName: string
): Promise<TeamMemberDiscovered[]> {
  if (!isUnipileConfigured()) {
    console.log('[team-linkedin] Unipile not configured, skipping LinkedIn enrichment');
    return teamMembers;
  }
  
  console.log(`[team-linkedin] Enriching ${teamMembers.length} team members with LinkedIn data...`);
  
  const enrichedMembers: TeamMemberDiscovered[] = [];
  
  for (const member of teamMembers) {
    try {
      let linkedinProfile: LinkedInProfileData | null = null;
      
      // Try direct URL first
      if (member.linkedinUrl) {
        linkedinProfile = await fetchLinkedInProfile(member.linkedinUrl);
      }
      
      // Fall back to search
      if (!linkedinProfile) {
        linkedinProfile = await searchLinkedInByName(member.name, companyName);
      }
      
      if (linkedinProfile) {
        enrichedMembers.push({
          ...member,
          linkedinUrl: linkedinProfile.linkedinUrl || member.linkedinUrl,
          bio: linkedinProfile.summary || member.bio,
          imageUrl: linkedinProfile.profilePictureUrl,
          source: 'linkedin',
          linkedinData: linkedinProfile,
        });
        console.log(`[team-linkedin] Enriched: ${member.name}`);
      } else {
        enrichedMembers.push(member);
      }
    } catch (error: any) {
      console.warn(`[team-linkedin] Failed to enrich ${member.name}:`, error.message);
      enrichedMembers.push(member);
    }
  }
  
  return enrichedMembers;
}

// ============================================================================
// STAGE 3: RESEARCH ORCHESTRATOR
// ============================================================================

export async function generateResearchParameters(
  extractedData: ExtractedData
): Promise<ResearchParameters> {
  const openai = getOpenAIClient();
  
  if (!openai) {
    throw new Error('OpenAI not configured');
  }
  
  console.log('[research-params] Generating research parameters...');
  
  const websiteText = extractedData.websiteContent
    .filter(p => !p.error)
    .map(p => `${p.title}: ${p.mainContent.substring(0, 2000)}`)
    .join('\n\n')
    .substring(0, 12000);
  
  const prompt = `Analyze this company's website and pitch deck to create comprehensive research parameters.

COMPANY: ${extractedData.companyName}
SECTOR: ${extractedData.sector}
WEBSITE: ${extractedData.website}

=== WEBSITE CONTENT ===
${websiteText || 'No website content'}

=== PITCH DECK CONTENT ===
${extractedData.deckContent?.substring(0, 15000) || 'No deck content'}

=== TEAM MEMBERS ===
${extractedData.teamMembers.map(m => `- ${m.name}: ${m.role}`).join('\n')}

Generate research parameters for deep market research. Be SPECIFIC and use exact terms from materials:

Return JSON:
{
  "specificMarket": "Very specific market definition (e.g., 'enterprise AI-powered customer service automation' not just 'SaaS')",
  "productDescription": "One paragraph describing exactly what the product does",
  "targetCustomers": "Specific customer segments (e.g., 'Fortune 500 enterprises, mid-market tech companies')",
  "knownCompetitors": ["List", "of", "competitors", "mentioned", "or", "implied"],
  "geographicFocus": "Target regions/countries",
  "businessModel": "Revenue model details (SaaS, usage-based, enterprise contracts, etc.)",
  "fundingStage": "Current stage (pre-seed, seed, Series A, etc.)",
  "claimedMetrics": {
    "tam": "If TAM mentioned, exact figure" or null,
    "growthRate": "If growth mentioned" or null,
    "revenue": "If revenue mentioned" or null,
    "customers": "If customer count mentioned" or null
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
    });
    
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    const params: ResearchParameters = {
      companyName: extractedData.companyName,
      sector: extractedData.sector,
      specificMarket: parsed.specificMarket || extractedData.sector,
      productDescription: parsed.productDescription || '',
      targetCustomers: parsed.targetCustomers || '',
      knownCompetitors: Array.isArray(parsed.knownCompetitors) ? parsed.knownCompetitors : [],
      geographicFocus: parsed.geographicFocus || 'United States',
      businessModel: parsed.businessModel || 'SaaS',
      fundingStage: parsed.fundingStage || 'seed',
      teamMembers: extractedData.teamMembers,
      claimedMetrics: parsed.claimedMetrics || {},
    };
    
    console.log('[research-params] Generated parameters:', JSON.stringify(params, null, 2).substring(0, 500));
    return params;
  } catch (error: any) {
    console.error('[research-params] Error:', error.message);
    return {
      companyName: extractedData.companyName,
      sector: extractedData.sector,
      specificMarket: extractedData.sector,
      productDescription: '',
      targetCustomers: '',
      knownCompetitors: [],
      geographicFocus: 'United States',
      businessModel: 'SaaS',
      fundingStage: 'seed',
      teamMembers: extractedData.teamMembers,
      claimedMetrics: {},
    };
  }
}

// ============================================================================
// DEEP RESEARCH AGENT A: TEAM RESEARCH
// ============================================================================

const teamDeepResearchPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are an expert researcher specializing in startup team due diligence. Your task is to conduct deep research on team members, their backgrounds, accomplishments, patents, and exits.

CRITICAL INSTRUCTIONS:
1. Search thoroughly for EACH team member
2. Verify information - only include data you can cite with sources
3. Assign confidence scores (0-100) based on data quality
4. Filter out information about OTHER people with similar names
5. Look for: patents, previous exits, notable achievements, education, prior roles

For EACH team member, research:
- Professional background and career trajectory
- Patents filed (search USPTO, Google Patents)
- Previous company exits (IPO, M&A) they were part of
- Notable achievements, awards, publications
- Education and certifications
- Red flags or concerns

Return comprehensive JSON with sources for all claims.`),
  HumanMessagePromptTemplate.fromTemplate(`Research these team members for company: {companyName}

TEAM MEMBERS:
{teamMembersList}

COMPANY CONTEXT:
{companyContext}

Return JSON:
{{
  "teamResearch": [
    {{
      "name": "Person Name",
      "role": "Their Role",
      "pastAccomplishments": ["Achievement 1 with context", "Achievement 2"],
      "patents": [
        {{"title": "Patent Title", "year": "2020", "url": "patent URL"}}
      ],
      "previousExits": [
        {{"company": "Company Name", "type": "acquisition", "year": "2019", "value": "$500M"}}
      ],
      "notableAchievements": ["Award 1", "Recognition 2"],
      "educationHighlights": ["PhD from MIT", "Stanford MBA"],
      "confidenceScore": 85,
      "sources": ["URL1", "URL2"]
    }}
  ],
  "teamSummary": {{
    "overallExperience": "Assessment of team's collective experience",
    "strengthAreas": ["Area 1", "Area 2"],
    "gaps": ["Gap 1", "Gap 2"],
    "redFlags": ["Concern 1"] or []
  }}
}}`),
]);

export async function runTeamDeepResearch(
  params: ResearchParameters
): Promise<TeamMemberResearch[]> {
  console.log('[deep-research-team] Starting team deep research (background mode with polling)...');
  
  try {
    const teamMembersList = params.teamMembers
      .map(m => `- ${m.name} (${m.role})${m.linkedinUrl ? ` - LinkedIn: ${m.linkedinUrl}` : ''}${m.bio ? `\n  Bio: ${m.bio}` : ''}`)
      .join('\n');
    
    const prompt = `You are an expert researcher specializing in startup team due diligence. Your task is to conduct deep research on team members, their backgrounds, accomplishments, patents, and exits.

CRITICAL INSTRUCTIONS:
1. Search thoroughly for EACH team member
2. Verify information - only include data you can cite with sources
3. Assign confidence scores (0-100) based on data quality
4. Filter out information about OTHER people with similar names
5. Look for: patents, previous exits, notable achievements, education, prior roles

For EACH team member, research:
- Professional background and career trajectory
- Patents filed (search USPTO, Google Patents)
- Previous company exits (IPO, M&A) they were part of
- Notable achievements, awards, publications
- Education and certifications
- Red flags or concerns

Research these team members for company: ${params.companyName}

TEAM MEMBERS:
${teamMembersList}

COMPANY CONTEXT:
Sector: ${params.sector}
Market: ${params.specificMarket}
Product: ${params.productDescription}

Return comprehensive JSON with sources for all claims:
{
  "teamResearch": [
    {
      "name": "Person Name",
      "role": "Their Role",
      "pastAccomplishments": ["Achievement 1 with context", "Achievement 2"],
      "patents": [
        {"title": "Patent Title", "year": "2020", "url": "patent URL"}
      ],
      "previousExits": [
        {"company": "Company Name", "type": "acquisition", "year": "2019", "value": "$500M"}
      ],
      "notableAchievements": ["Award 1", "Recognition 2"],
      "educationHighlights": ["PhD from MIT", "Stanford MBA"],
      "confidenceScore": 85,
      "sources": ["URL1", "URL2"]
    }
  ],
  "teamSummary": {
    "overallExperience": "Assessment of team's collective experience",
    "strengthAreas": ["Area 1", "Area 2"],
    "gaps": ["Gap 1", "Gap 2"],
    "redFlags": ["Concern 1"] or []
  }
}`;
    
    // Background mode with polling - waits for completion
    const result = await callDeepResearchModel(prompt, 'deep-research-team');
    
    console.log(`[deep-research-team] Completed research for ${result?.teamResearch?.length || 0} team members`);
    return result?.teamResearch || [];
  } catch (error: any) {
    console.error('[deep-research-team] Error:', error.message);
    return [];
  }
}

// ============================================================================
// DEEP RESEARCH AGENT B: MARKET RESEARCH
// ============================================================================

const marketDeepResearchPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are an expert market research analyst. Your task is to conduct deep research on market size, growth, trends, and dynamics.

CRITICAL INSTRUCTIONS:
1. Use authoritative sources (Gartner, IDC, McKinsey, industry reports)
2. Validate claimed TAM/SAM figures when provided
3. Find multiple data points for market size to cross-validate
4. Look for recent reports (2024-2026)
5. Include CAGR, market drivers, and forecasts
6. Assess regulatory landscape and trends

Research comprehensively:
- Total Addressable Market (TAM) with sources
- Market growth rate (CAGR) with time period
- Key market trends and their impact
- Market drivers and tailwinds
- Challenges and headwinds
- Regulatory considerations
- 5-year forecasts`),
  HumanMessagePromptTemplate.fromTemplate(`Research the market for:

COMPANY: {companyName}
SPECIFIC MARKET: {specificMarket}
SECTOR: {sector}
TARGET CUSTOMERS: {targetCustomers}
GEOGRAPHIC FOCUS: {geographicFocus}

CLAIMED METRICS (validate these):
- Claimed TAM: {claimedTam}
- Claimed Growth: {claimedGrowth}

Return JSON:
{{
  "totalAddressableMarket": {{
    "value": "$X billion",
    "year": "2025",
    "source": "Report/analyst name",
    "confidence": "high|medium|low"
  }},
  "serviceableAddressableMarket": {{
    "value": "$X billion",
    "source": "Source"
  }},
  "marketGrowthRate": {{
    "cagr": "X%",
    "period": "2024-2030",
    "source": "Source"
  }},
  "marketTrends": [
    {{"trend": "Trend description", "impact": "positive", "timeframe": "2024-2027"}}
  ],
  "marketDrivers": ["Driver 1", "Driver 2"],
  "marketChallenges": ["Challenge 1", "Challenge 2"],
  "forecasts": [
    {{"metric": "Market Size", "value": "$X billion", "year": "2028", "source": "Source"}}
  ],
  "regulatoryLandscape": "Assessment of regulatory environment",
  "tamValidation": {{
    "claimAccuracy": "accurate|overstated|understated|unverifiable",
    "explanation": "Analysis of claimed vs researched figures"
  }},
  "sources": ["URL1", "URL2", "Report names"]
}}`),
]);

export async function runMarketDeepResearch(
  params: ResearchParameters
): Promise<MarketResearch> {
  console.log('[deep-research-market] Starting market deep research (background mode with polling)...');
  
  try {
    const prompt = `You are an expert market research analyst. Your task is to conduct deep research on market size, growth, trends, and dynamics.

CRITICAL INSTRUCTIONS:
1. Use authoritative sources (Gartner, IDC, McKinsey, industry reports)
2. Validate claimed TAM/SAM figures when provided
3. Find multiple data points for market size to cross-validate
4. Look for recent reports (2024-2026)
5. Include CAGR, market drivers, and forecasts
6. Assess regulatory landscape and trends

Research comprehensively:
- Total Addressable Market (TAM) with sources
- Market growth rate (CAGR) with time period
- Key market trends and their impact
- Market drivers and tailwinds
- Challenges and headwinds
- Regulatory considerations
- 5-year forecasts

Research the market for:

COMPANY: ${params.companyName}
SPECIFIC MARKET: ${params.specificMarket}
SECTOR: ${params.sector}
TARGET CUSTOMERS: ${params.targetCustomers}
GEOGRAPHIC FOCUS: ${params.geographicFocus}

CLAIMED METRICS (validate these):
- Claimed TAM: ${params.claimedMetrics.tam || 'Not specified'}
- Claimed Growth: ${params.claimedMetrics.growthRate || 'Not specified'}

Return JSON:
{
  "totalAddressableMarket": {
    "value": "$X billion",
    "year": "2025",
    "source": "Report/analyst name",
    "confidence": "high|medium|low"
  },
  "serviceableAddressableMarket": {
    "value": "$X billion",
    "source": "Source"
  },
  "marketGrowthRate": {
    "cagr": "X%",
    "period": "2024-2030",
    "source": "Source"
  },
  "marketTrends": [
    {"trend": "Trend description", "impact": "positive", "timeframe": "2024-2027"}
  ],
  "marketDrivers": ["Driver 1", "Driver 2"],
  "marketChallenges": ["Challenge 1", "Challenge 2"],
  "forecasts": [
    {"metric": "Market Size", "value": "$X billion", "year": "2028", "source": "Source"}
  ],
  "regulatoryLandscape": "Assessment of regulatory environment",
  "tamValidation": {
    "claimAccuracy": "accurate|overstated|understated|unverifiable",
    "explanation": "Analysis of claimed vs researched figures"
  },
  "sources": ["URL1", "URL2", "Report names"]
}`;
    
    // Background mode with polling - waits for completion
    const result = await callDeepResearchModel(prompt, 'deep-research-market');
    
    console.log('[deep-research-market] Market research complete');
    return result as MarketResearch;
  } catch (error: any) {
    console.error('[deep-research-market] Error:', error.message);
    return {
      totalAddressableMarket: { value: 'Unknown', year: '2025', source: 'Research failed', confidence: 'low' },
      marketGrowthRate: { cagr: 'Unknown', period: '2024-2030', source: 'Research failed' },
      marketTrends: [],
      marketDrivers: [],
      marketChallenges: [],
      forecasts: [],
      sources: [],
    };
  }
}

// ============================================================================
// DEEP RESEARCH AGENT C: PRODUCT & COMPETITOR RESEARCH
// ============================================================================

const productDeepResearchPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are an expert competitive intelligence analyst. Your task is to conduct deep research on a product, its reviews, competitors, and market dynamics.

CRITICAL INSTRUCTIONS:
1. Research the product's features, strengths, and weaknesses
2. Find actual user reviews from G2, Capterra, TrustRadius, ProductHunt
3. Identify and deeply profile all competitors
4. Analyze competitive positioning and market dynamics
5. Use Porter's Five Forces framework for market dynamics
6. Compare pricing, features, and positioning

For EACH competitor, research:
- Funding history (Crunchbase, PitchBook data)
- Market share estimates
- Product features and pricing
- Target customers
- Key differentiators
- Recent news and developments`),
  HumanMessagePromptTemplate.fromTemplate(`Research product and competitive landscape for:

COMPANY: {companyName}
PRODUCT: {productDescription}
SPECIFIC MARKET: {specificMarket}
KNOWN COMPETITORS: {knownCompetitors}
BUSINESS MODEL: {businessModel}

Return JSON:
{{
  "productDescription": "Detailed product description",
  "coreFeatures": ["Feature 1", "Feature 2"],
  "technicalStack": ["Tech 1", "Tech 2"] or null,
  "reviews": [
    {{"source": "G2", "rating": "4.5/5", "summary": "Review summary", "url": "URL"}}
  ],
  "strengths": ["Strength 1", "Strength 2"],
  "weaknesses": ["Weakness 1", "Weakness 2"],
  "competitivePosition": "Assessment of market position",
  "marketDynamics": {{
    "entryBarriers": "High/Medium/Low with explanation",
    "substitutes": ["Substitute 1", "Substitute 2"],
    "buyerPower": "Assessment",
    "supplierPower": "Assessment"
  }},
  "competitors": [
    {{
      "name": "Competitor Name",
      "website": "URL",
      "description": "What they do",
      "marketShare": "X% or 'significant'",
      "funding": {{
        "totalRaised": "$X million",
        "lastRound": "Series B",
        "lastRoundDate": "2024",
        "keyInvestors": ["Investor 1", "Investor 2"]
      }},
      "strengths": ["Strength 1"],
      "weaknesses": ["Weakness 1"],
      "productFeatures": ["Feature 1"],
      "pricing": "Pricing model",
      "targetCustomers": "Target segment",
      "differentiators": ["Differentiator 1"],
      "recentNews": ["News item 1"],
      "sources": ["URL1"]
    }}
  ],
  "sources": ["URL1", "URL2"]
}}`),
]);

export async function runProductDeepResearch(
  params: ResearchParameters
): Promise<ProductResearch> {
  console.log('[deep-research-product] Starting product and competitor deep research (background mode with polling)...');
  
  try {
    const prompt = `You are an expert competitive intelligence analyst. Your task is to conduct deep research on a product, its reviews, competitors, and market dynamics.

CRITICAL INSTRUCTIONS:
1. Research the product's features, strengths, and weaknesses
2. Find actual user reviews from G2, Capterra, TrustRadius, ProductHunt
3. Identify and deeply profile all competitors
4. Analyze competitive positioning and market dynamics
5. Use Porter's Five Forces framework for market dynamics
6. Compare pricing, features, and positioning

For EACH competitor, research:
- Funding history (Crunchbase, PitchBook data)
- Market share estimates
- Product features and pricing
- Target customers
- Key differentiators
- Recent news and developments

Research product and competitive landscape for:

COMPANY: ${params.companyName}
PRODUCT: ${params.productDescription}
SPECIFIC MARKET: ${params.specificMarket}
KNOWN COMPETITORS: ${params.knownCompetitors.join(', ') || 'Research competitors'}
BUSINESS MODEL: ${params.businessModel}

Return JSON:
{
  "productDescription": "Detailed product description",
  "coreFeatures": ["Feature 1", "Feature 2"],
  "technicalStack": ["Tech 1", "Tech 2"] or null,
  "reviews": [
    {"source": "G2", "rating": "4.5/5", "summary": "Review summary", "url": "URL"}
  ],
  "strengths": ["Strength 1", "Strength 2"],
  "weaknesses": ["Weakness 1", "Weakness 2"],
  "competitivePosition": "Assessment of market position",
  "marketDynamics": {
    "entryBarriers": "High/Medium/Low with explanation",
    "substitutes": ["Substitute 1", "Substitute 2"],
    "buyerPower": "Assessment",
    "supplierPower": "Assessment"
  },
  "competitors": [
    {
      "name": "Competitor Name",
      "website": "URL",
      "description": "What they do",
      "marketShare": "X% or 'significant'",
      "funding": {
        "totalRaised": "$X million",
        "lastRound": "Series B",
        "lastRoundDate": "2024",
        "keyInvestors": ["Investor 1", "Investor 2"]
      },
      "strengths": ["Strength 1"],
      "weaknesses": ["Weakness 1"],
      "productFeatures": ["Feature 1"],
      "pricing": "Pricing model",
      "targetCustomers": "Target segment",
      "differentiators": ["Differentiator 1"],
      "recentNews": ["News item 1"],
      "sources": ["URL1"]
    }
  ],
  "sources": ["URL1", "URL2"]
}`;
    
    // Background mode with polling - waits for completion
    const result = await callDeepResearchModel(prompt, 'deep-research-product');
    
    console.log(`[deep-research-product] Found ${result?.competitors?.length || 0} competitors`);
    return result as ProductResearch;
  } catch (error: any) {
    console.error('[deep-research-product] Error:', error.message);
    return {
      productDescription: params.productDescription,
      coreFeatures: [],
      reviews: [],
      strengths: [],
      weaknesses: [],
      competitivePosition: 'Unknown',
      marketDynamics: {
        entryBarriers: 'Unknown',
        substitutes: [],
        buyerPower: 'Unknown',
        supplierPower: 'Unknown',
      },
      competitors: [],
      sources: [],
    };
  }
}

// ============================================================================
// STANDARD SEARCH AGENT D: NEWS & MENTIONS
// ============================================================================

export async function runNewsSearch(
  params: ResearchParameters
): Promise<NewsResearch> {
  console.log('[search-news] Starting news and mentions search...');
  
  const openai = getOpenAIClient();
  
  if (!openai) {
    return {
      companyMentions: [],
      fundingNews: [],
      productReleases: [],
      industryNews: [],
      totalMentions: 0,
      sentimentOverview: { positive: 0, negative: 0, neutral: 0 },
      sources: [],
    };
  }
  
  // Define search queries
  const queries = [
    `"${params.companyName}" company news 2025 2026`,
    `"${params.companyName}" funding investment round`,
    `"${params.companyName}" product launch release announcement`,
    `"${params.companyName}" partnership acquisition`,
    `${params.specificMarket} industry news trends 2025`,
  ];
  
  try {
    // Run all searches in parallel using GPT-5.2 with web_search tool + polling
    const searchPromises = queries.map(async (query) => {
      try {
        // Create response with background:true for async execution + polling
        const createResponse = await (openai as any).responses.create({
          model: "gpt-5.2",
          tools: [{ type: "web_search" }],
          input: query,
          store: true,
          background: true, // Returns immediately, poll for completion
        });
        
        const responseId = createResponse?.id;
        if (!responseId) {
          return { query, answer: '', urls: [] };
        }
        
        // Poll for completion with backoff
        let response = createResponse;
        const maxPollTime = 120000; // 2 minutes max
        const basePollInterval = 1500;
        const startTime = Date.now();
        let pollCount = 0;
        
        // Terminal statuses: completed, failed, incomplete
        const isTerminal = (status: string) => ['completed', 'failed', 'incomplete'].includes(status);
        
        while (!isTerminal(response?.status)) {
          if (Date.now() - startTime > maxPollTime) {
            return { query, answer: '', urls: [] };
          }
          pollCount++;
          // Exponential backoff with jitter to reduce rate limit pressure
          const backoff = Math.min(basePollInterval * Math.pow(1.2, pollCount), 8000);
          const jitter = Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, backoff + jitter));
          response = await (openai as any).responses.retrieve(responseId);
        }
        
        if (response?.status === 'failed') {
          return { query, answer: '', urls: [] };
        }
        // status='incomplete' - continue to extract partial output
        
        let answer = '';
        const urls: string[] = [];
        
        for (const item of (response as any).output || []) {
          if (item.type === 'message') {
            for (const content of item.content || []) {
              if (content.type === 'text') {
                answer = content.text;
                // Extract URLs
                const urlMatches = content.text.match(/https?:\/\/[^\s\)]+/g) || [];
                urls.push(...urlMatches);
                
                if (content.annotations) {
                  for (const annotation of content.annotations) {
                    if (annotation.type === 'url_citation' && annotation.url) {
                      urls.push(annotation.url);
                    }
                  }
                }
              }
            }
          }
        }
        
        return { query, answer, urls: [...new Set(urls)] };
      } catch (e) {
        return { query, answer: '', urls: [] };
      }
    });
    
    const searchResults = await Promise.all(searchPromises);
    
    // Process and categorize results
    const allUrls = searchResults.flatMap(r => r.urls);
    const allAnswers = searchResults.map(r => r.answer).join('\n\n');
    
    // Use AI to categorize and structure the news
    const categorizationPrompt = `Analyze these search results about ${params.companyName} and categorize them:

${allAnswers}

URLs found: ${allUrls.slice(0, 20).join(', ')}

Return JSON:
{
  "companyMentions": [{"title": "...", "summary": "...", "url": "...", "sentiment": "positive|negative|neutral", "category": "general"}],
  "fundingNews": [{"title": "...", "summary": "...", "url": "...", "date": "...", "category": "funding"}],
  "productReleases": [{"title": "...", "summary": "...", "url": "...", "category": "product"}],
  "industryNews": [{"title": "...", "summary": "...", "url": "...", "category": "general"}],
  "sentimentOverview": {"positive": 0, "negative": 0, "neutral": 0}
}`;

    const categorized = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: categorizationPrompt }],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
    });
    
    const result = JSON.parse(categorized.choices[0]?.message?.content || '{}');
    
    console.log(`[search-news] Found ${(result.companyMentions?.length || 0) + (result.fundingNews?.length || 0)} news items`);
    
    return {
      companyMentions: result.companyMentions || [],
      fundingNews: result.fundingNews || [],
      productReleases: result.productReleases || [],
      industryNews: result.industryNews || [],
      totalMentions: (result.companyMentions?.length || 0) + (result.fundingNews?.length || 0) + (result.productReleases?.length || 0),
      sentimentOverview: result.sentimentOverview || { positive: 0, negative: 0, neutral: 0 },
      sources: allUrls.slice(0, 30),
    };
  } catch (error: any) {
    console.error('[search-news] Error:', error.message);
    return {
      companyMentions: [],
      fundingNews: [],
      productReleases: [],
      industryNews: [],
      totalMentions: 0,
      sentimentOverview: { positive: 0, negative: 0, neutral: 0 },
      sources: [],
    };
  }
}

// ============================================================================
// MAIN ORCHESTRATION FUNCTION
// ============================================================================

// Callback types for incremental saves
export interface StageProgressData {
  stage: 1 | 2 | 3 | 4;
  websiteContent?: WebPageContent[];
  teamMembers?: TeamMemberDiscovered[];
  researchParams?: ResearchParameters;
  comprehensiveResearch?: ComprehensiveResearchResult;
}

export type StageProgressCallback = (data: StageProgressData) => Promise<void>;

export interface ResearchOptions {
  // Skip stages by providing cached data
  cachedWebsiteContent?: WebPageContent[];
  cachedTeamMembers?: TeamMemberDiscovered[];
  // Control which stages to run
  skipWebsiteScraping?: boolean;
  skipLinkedInEnrichment?: boolean;
  // Callback for incremental saves after each stage
  onStageComplete?: StageProgressCallback;
  // Callback when deep research agents are about to start (after LinkedIn enrichment)
  onDeepResearchStart?: () => Promise<void>;
  // Callbacks for individual deep research agent progress
  onDeepResearchAgentStart?: (agentId: string) => Promise<void>;
  onDeepResearchAgentComplete?: (agentId: string) => Promise<void>;
}

export async function conductComprehensiveResearch(
  companyName: string,
  website: string,
  sector: string,
  deckContent: string,
  documentContent: string[] = [],
  options: ResearchOptions = {}
): Promise<ComprehensiveResearchResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[RESEARCH ORCHESTRATOR] Starting comprehensive research for: ${companyName}`);
  if (options.skipWebsiteScraping) console.log(`  - Skipping website scraping (using cached)`);
  if (options.skipLinkedInEnrichment) console.log(`  - Skipping LinkedIn enrichment (using cached)`);
  console.log(`${'='.repeat(60)}\n`);
  
  const startTime = Date.now();
  
  // -------------------------------------------------------------------------
  // STAGE 1: Data Extraction (skip if cached data provided)
  // -------------------------------------------------------------------------
  let websiteContent: WebPageContent[];
  if (options.skipWebsiteScraping && options.cachedWebsiteContent) {
    console.log(`[STAGE 1] Using cached website content (${options.cachedWebsiteContent.length} pages)`);
    websiteContent = options.cachedWebsiteContent;
  } else {
    console.log('[STAGE 1] Deep scraping website and extracting all content...');
    websiteContent = await deepScrapeWebsite(website, 20);
    console.log(`[STAGE 1] Scraped ${websiteContent.length} pages from website`);
    
    // Incremental save after Stage 1
    if (options.onStageComplete) {
      await options.onStageComplete({ stage: 1, websiteContent });
    }
  }
  
  // -------------------------------------------------------------------------
  // STAGE 2: Team Discovery & LinkedIn (skip if cached data provided)
  // -------------------------------------------------------------------------
  let teamMembers: TeamMemberDiscovered[];
  if (options.skipLinkedInEnrichment && options.cachedTeamMembers) {
    console.log(`[STAGE 2] Using cached team members with LinkedIn data (${options.cachedTeamMembers.length} members)`);
    teamMembers = options.cachedTeamMembers;
  } else {
    console.log('[STAGE 2] Discovering team members and enriching with LinkedIn...');
    teamMembers = await discoverTeamMembers(websiteContent, deckContent);
    teamMembers = await enrichTeamWithLinkedIn(teamMembers, companyName);
    console.log(`[STAGE 2] Found ${teamMembers.length} team members`);
    
    // Incremental save after Stage 2
    if (options.onStageComplete) {
      await options.onStageComplete({ stage: 2, websiteContent, teamMembers });
    }
  }
  
  const extractedData: ExtractedData = {
    companyName,
    website,
    sector,
    websiteContent,
    deckContent,
    documentContent,
    teamMembers,
  };
  
  // -------------------------------------------------------------------------
  // STAGE 3: Generate Research Parameters
  // -------------------------------------------------------------------------
  console.log('[STAGE 3] Generating research parameters from extracted data...');
  
  // Notify that deep research is about to start (for UI progress tracking)
  if (options.onDeepResearchStart) {
    await options.onDeepResearchStart();
  }
  
  const researchParams = await generateResearchParameters(extractedData);
  console.log(`[STAGE 3] Research parameters generated`);
  
  // -------------------------------------------------------------------------
  // STAGE 4: Run All Deep Research Agents (Background Mode with Polling)
  // -------------------------------------------------------------------------
  console.log('[STAGE 4] Running deep research agents (background mode with 15s polling)...');
  console.log('[STAGE 4] Each agent creates a background response, then polls until complete');
  
  // Helper to wrap agent calls with progress tracking
  const trackAgent = async <T>(agentId: string, agentFn: () => Promise<T>): Promise<T> => {
    if (options.onDeepResearchAgentStart) {
      await options.onDeepResearchAgentStart(agentId);
    }
    const result = await agentFn();
    if (options.onDeepResearchAgentComplete) {
      await options.onDeepResearchAgentComplete(agentId);
    }
    return result;
  };
  
  // Run all 4 deep research agents in parallel
  console.log('[STAGE 4] Starting all 4 deep research agents in parallel...');
  const [teamResearch, newsResearch, marketResearch, productResearch] = await Promise.all([
    trackAgent('teamResearch', () => runTeamDeepResearch(researchParams)),
    trackAgent('newsResearch', () => runNewsSearch(researchParams)),
    trackAgent('marketResearch', () => runMarketDeepResearch(researchParams)),
    trackAgent('productResearch', () => runProductDeepResearch(researchParams)),
  ]);
  console.log('[STAGE 4] All deep research agents completed');
  
  // -------------------------------------------------------------------------
  // Compile Results
  // -------------------------------------------------------------------------
  const totalSources = new Set([
    ...websiteContent.map(p => p.url),
    ...(teamResearch.flatMap(t => t.sources || [])),
    ...(marketResearch.sources || []),
    ...(productResearch.sources || []),
    ...(newsResearch.sources || []),
  ]).size;
  
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[RESEARCH ORCHESTRATOR] Research complete in ${elapsedTime}s`);
  console.log(`- Pages scraped: ${websiteContent.length}`);
  console.log(`- Team members: ${teamMembers.length}`);
  console.log(`- Team research results: ${teamResearch.length}`);
  console.log(`- Competitors found: ${productResearch.competitors?.length || 0}`);
  console.log(`- News items: ${newsResearch.totalMentions}`);
  console.log(`- Total sources: ${totalSources}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Build the complete result
  const result: ComprehensiveResearchResult = {
    extractedData,
    researchParameters: researchParams,
    teamResearch,
    marketResearch,
    productResearch,
    newsResearch,
    researchSummary: {
      totalSources,
      dataQuality: totalSources > 20 ? 'high' : totalSources > 10 ? 'medium' : 'low',
      keyFindings: [
        `Found ${teamMembers.length} team members`,
        `Team research: ${teamResearch.length} profiles analyzed`,
        `Market: TAM ${marketResearch.totalAddressableMarket?.value || 'N/A'}`,
        `Competitors: ${productResearch.competitors?.length || 0} identified`,
        `${newsResearch.totalMentions} news mentions found`,
      ],
      dataGaps: [],
    },
  };
  
  // Final incremental save after Stage 4 (all research complete)
  if (options.onStageComplete) {
    await options.onStageComplete({ 
      stage: 4, 
      websiteContent,
      teamMembers,
      researchParams,
      comprehensiveResearch: result,
    });
  }
  
  return result;
}

// ============================================================================
// FORMAT FOR EVALUATION AGENTS
// ============================================================================

export function formatResearchForEvaluation(research: ComprehensiveResearchResult): string {
  let formatted = '';
  
  // Website content
  formatted += '=== COMPANY WEBSITE CONTENT ===\n\n';
  for (const page of research.extractedData.websiteContent.slice(0, 10)) {
    if (!page.error) {
      formatted += `--- ${page.title} (${page.url}) ---\n`;
      formatted += `${page.mainContent.substring(0, 3000)}\n\n`;
    }
  }
  
  // Team research
  formatted += '\n=== TEAM RESEARCH ===\n\n';
  for (const member of research.teamResearch) {
    formatted += `**${member.name}** (${member.role})\n`;
    formatted += `Confidence: ${member.confidenceScore}/100\n`;
    if (member.pastAccomplishments?.length) {
      formatted += `Accomplishments: ${member.pastAccomplishments.join('; ')}\n`;
    }
    if (member.patents?.length) {
      formatted += `Patents: ${member.patents.map(p => p.title).join(', ')}\n`;
    }
    if (member.previousExits?.length) {
      formatted += `Exits: ${member.previousExits.map(e => `${e.company} (${e.type})`).join(', ')}\n`;
    }
    formatted += '\n';
  }
  
  // Market research
  formatted += '\n=== MARKET RESEARCH ===\n\n';
  formatted += `TAM: ${research.marketResearch.totalAddressableMarket?.value || 'Unknown'}\n`;
  formatted += `Growth Rate: ${research.marketResearch.marketGrowthRate?.cagr || 'Unknown'}\n`;
  formatted += `Trends: ${research.marketResearch.marketTrends?.map(t => t.trend).join('; ') || 'None'}\n`;
  formatted += `Drivers: ${research.marketResearch.marketDrivers?.join(', ') || 'None'}\n`;
  formatted += `Challenges: ${research.marketResearch.marketChallenges?.join(', ') || 'None'}\n`;
  
  // Product & competitors
  formatted += '\n=== PRODUCT & COMPETITIVE RESEARCH ===\n\n';
  formatted += `Product: ${research.productResearch.productDescription}\n`;
  formatted += `Strengths: ${research.productResearch.strengths?.join(', ') || 'Unknown'}\n`;
  formatted += `Weaknesses: ${research.productResearch.weaknesses?.join(', ') || 'Unknown'}\n`;
  formatted += `Position: ${research.productResearch.competitivePosition}\n\n`;
  
  formatted += 'Competitors:\n';
  for (const comp of research.productResearch.competitors || []) {
    formatted += `- ${comp.name}: ${comp.description} (Funding: ${comp.funding?.totalRaised || 'Unknown'})\n`;
  }
  
  // News
  formatted += '\n=== RECENT NEWS ===\n\n';
  for (const news of [...(research.newsResearch.companyMentions || []), ...(research.newsResearch.fundingNews || [])].slice(0, 10)) {
    formatted += `- ${news.title}: ${news.summary}\n`;
  }
  
  return formatted;
}
