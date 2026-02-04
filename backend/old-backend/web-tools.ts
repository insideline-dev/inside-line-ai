import * as cheerio from 'cheerio';
import OpenAI from 'openai';

export interface WebPageContent {
  url: string;
  title: string;
  description: string;
  mainContent: string;
  links: { text: string; href: string }[];
  headings: string[];
  error?: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  query: string;
  results: WebSearchResult[];
  answer?: string;
}

async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VCAnalyzer/1.0; +https://accesslayer.ai)',
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

export async function scrapeWebpage(url: string): Promise<WebPageContent> {
  console.log(`[web-scraper] Scraping: ${url}`);
  
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
    
    $('script, style, noscript, iframe, nav, footer, header').remove();
    
    const title = $('title').text().trim() || $('h1').first().text().trim();
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || '';
    
    const headings: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 200) {
        headings.push(text);
      }
    });
    
    const links: { text: string; href: string }[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          const absoluteUrl = new URL(href, url).toString();
          if (links.length < 50) {
            links.push({ text: text.substring(0, 100), href: absoluteUrl });
          }
        } catch {}
      }
    });
    
    const mainContent = $('main, article, [role="main"], .content, #content, .main')
      .first()
      .text()
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 15000) || 
      $('body').text().trim().replace(/\s+/g, ' ').substring(0, 15000);
    
    console.log(`[web-scraper] Extracted ${mainContent.length} chars from ${url}`);
    
    return {
      url,
      title,
      description,
      mainContent,
      links,
      headings,
    };
  } catch (error: any) {
    console.error(`[web-scraper] Error scraping ${url}:`, error.message);
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

export async function scrapeMultiplePages(baseUrl: string, pagesToScrape: string[] = ['/', '/about', '/pricing', '/product', '/team', '/company']): Promise<WebPageContent[]> {
  console.log(`[web-scraper] Scraping multiple pages from: ${baseUrl}`);
  
  const results: WebPageContent[] = [];
  
  try {
    const baseUrlObj = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
    
    const homePage = await scrapeWebpage(baseUrlObj.toString());
    results.push(homePage);
    
    if (homePage.error) {
      return results;
    }
    
    const internalLinks = homePage.links
      .filter(link => {
        try {
          const linkUrl = new URL(link.href);
          return linkUrl.hostname === baseUrlObj.hostname;
        } catch {
          return false;
        }
      })
      .map(link => link.href);
    
    const priorityPages = pagesToScrape
      .map(path => {
        try {
          return new URL(path, baseUrlObj).toString();
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];
    
    const foundPriorityPages = internalLinks.filter(link => 
      priorityPages.some(priority => link.toLowerCase().includes(priority.toLowerCase().split('/').pop() || ''))
    );
    
    const pagesToFetch = Array.from(new Set([...foundPriorityPages, ...priorityPages])).slice(0, 5);
    
    for (const pageUrl of pagesToFetch) {
      if (pageUrl !== baseUrlObj.toString() && pageUrl !== baseUrlObj.toString() + '/') {
        const pageContent = await scrapeWebpage(pageUrl);
        if (!pageContent.error && pageContent.mainContent.length > 100) {
          results.push(pageContent);
        }
      }
    }
    
    console.log(`[web-scraper] Scraped ${results.length} pages from ${baseUrl}`);
  } catch (error: any) {
    console.error(`[web-scraper] Error in multi-page scrape:`, error.message);
  }
  
  return results;
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  
  if (!apiKey) {
    console.warn('[openai-search] AI_INTEGRATIONS_OPENAI_API_KEY not set');
    return null;
  }
  
  return new OpenAI({
    apiKey,
    baseURL,
  });
}

export async function openaiWebSearch(query: string, options: {
  maxResults?: number;
  excludeDomains?: string[];
} = {}): Promise<TavilySearchResponse> {
  const openai = getOpenAIClient();
  
  if (!openai) {
    console.warn('[openai-search] OpenAI not configured, returning empty results');
    return { query, results: [] };
  }
  
  console.log(`[openai-search] Searching: "${query}"`);
  
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
      console.error('[openai-search] No response ID returned');
      return { query, results: [] };
    }
    
    console.log(`[openai-search] Response created: ${responseId}, status: ${createResponse?.status}`);
    
    // Poll for completion if not already completed
    let response = createResponse;
    const maxPollTime = 120000; // 2 minutes max for search
    const basePollInterval = 1500;
    const startTime = Date.now();
    let pollCount = 0;
    
    // Terminal statuses: completed, failed, incomplete
    const isTerminal = (status: string) => ['completed', 'failed', 'incomplete'].includes(status);
    
    while (!isTerminal(response?.status)) {
      if (Date.now() - startTime > maxPollTime) {
        console.error(`[openai-search] Polling timed out after ${maxPollTime/1000}s`);
        return { query, results: [] };
      }
      
      pollCount++;
      // Exponential backoff with jitter
      const backoff = Math.min(basePollInterval * Math.pow(1.2, pollCount), 8000);
      const jitter = Math.random() * 300;
      await new Promise(resolve => setTimeout(resolve, backoff + jitter));
      response = await (openai as any).responses.retrieve(responseId);
    }
    
    if (response?.status === 'failed') {
      console.error(`[openai-search] Response failed (${response?.error?.type}):`, response?.error?.message);
      return { query, results: [] };
    }
    
    if (response?.status === 'incomplete') {
      console.warn(`[openai-search] Response incomplete, extracting partial results...`);
    }
    
    const results: WebSearchResult[] = [];
    let answer: string | undefined;
    
    for (const item of response.output || []) {
      if (item.type === 'web_search_call') {
        continue;
      } else if (item.type === 'message') {
        for (const content of item.content || []) {
          if (content.type === 'text') {
            answer = content.text;
            const urlMatches = content.text.match(/https?:\/\/[^\s\)]+/g) || [];
            for (const url of urlMatches.slice(0, options.maxResults || 5)) {
              if (!options.excludeDomains?.some(domain => url.includes(domain))) {
                results.push({
                  title: url.split('/').slice(2, 3).join(''),
                  url: url,
                  content: '',
                });
              }
            }
            if (content.annotations) {
              for (const annotation of content.annotations) {
                if (annotation.type === 'url_citation' && annotation.url) {
                  if (!options.excludeDomains?.some(domain => annotation.url.includes(domain))) {
                    if (!results.find(r => r.url === annotation.url)) {
                      results.push({
                        title: annotation.title || annotation.url,
                        url: annotation.url,
                        content: '',
                        score: 0.8,
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`[openai-search] Found ${results.length} results for "${query}"`);
    
    return {
      query,
      results: results.slice(0, options.maxResults || 5),
      answer,
    };
  } catch (error: any) {
    console.error(`[openai-search] Search error:`, error.message);
    return { query, results: [] };
  }
}

export async function tavilySearch(query: string, options: {
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  includeAnswer?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
} = {}): Promise<TavilySearchResponse> {
  return openaiWebSearch(query, {
    maxResults: options.maxResults,
    excludeDomains: options.excludeDomains,
  });
}

// Interface for extracted startup context from deck/website
export interface StartupResearchContext {
  specificMarket: string;        // e.g., "blockchain forensics and crypto asset recovery"
  targetCustomers: string;       // e.g., "government agencies, financial institutions, exchanges"
  productDescription: string;    // e.g., "on-chain attribution platform with API access"
  knownCompetitors: string[];    // e.g., ["Chainalysis", "TRM Labs", "Elliptic"]
  claimedTam: string | null;     // e.g., "$2.5B blockchain analytics market"
  claimedGrowth: string | null;  // e.g., "45% CAGR"
  geographicFocus: string;       // e.g., "US, Europe"
  businessModel: string;         // e.g., "SaaS platform + API + services"
  fundingStage: string;          // e.g., "Series A"
}

// Extract research context from deck content and website using LLM
export async function extractResearchContext(
  companyName: string,
  sector: string,
  deckContent: string,
  websiteContent: WebPageContent[]
): Promise<StartupResearchContext> {
  const openai = getOpenAIClient();
  
  if (!openai) {
    console.log('[research] OpenAI not configured, using basic context');
    return {
      specificMarket: sector,
      targetCustomers: 'technology companies',
      productDescription: companyName,
      knownCompetitors: [],
      claimedTam: null,
      claimedGrowth: null,
      geographicFocus: 'United States',
      businessModel: 'SaaS',
      fundingStage: 'seed',
    };
  }
  
  // Prepare website text
  const websiteText = websiteContent
    .filter(p => !p.error)
    .map(p => `${p.title}: ${p.mainContent.substring(0, 2000)}`)
    .join('\n\n')
    .substring(0, 8000);
  
  const deckExcerpt = deckContent?.substring(0, 12000) || '';
  
  const prompt = `Analyze this startup's pitch deck and website to extract key context for market research.

COMPANY: ${companyName}
SECTOR CATEGORY: ${sector}

=== PITCH DECK CONTENT ===
${deckExcerpt || 'No deck content available'}

=== WEBSITE CONTENT ===
${websiteText || 'No website content available'}

Based on the above, extract the following. Be specific and use exact terms/names from the materials:

1. SPECIFIC MARKET: What exact market/industry does this company operate in? Be specific (e.g., "blockchain forensics for law enforcement" not just "fintech")

2. TARGET CUSTOMERS: Who are the specific customer segments? (e.g., "government agencies, cryptocurrency exchanges, banks")

3. PRODUCT DESCRIPTION: What exactly does the product/service do? One sentence.

4. KNOWN COMPETITORS: List any competitors mentioned or implied. Include both direct competitors and adjacent players mentioned in the materials.

5. CLAIMED TAM: If TAM/market size is mentioned, what is it? Include exact figures.

6. CLAIMED GROWTH: If market growth rate is mentioned, what is it?

7. GEOGRAPHIC FOCUS: What regions/countries are mentioned as target markets?

8. BUSINESS MODEL: What revenue model does the company use? (SaaS, API, marketplace, services, etc.)

9. FUNDING STAGE: What stage is the company at? (pre-seed, seed, Series A, etc.)

Respond in JSON format exactly like this:
{
  "specificMarket": "...",
  "targetCustomers": "...",
  "productDescription": "...",
  "knownCompetitors": ["Company1", "Company2"],
  "claimedTam": "..." or null,
  "claimedGrowth": "..." or null,
  "geographicFocus": "...",
  "businessModel": "...",
  "fundingStage": "..."
}`;

  try {
    console.log('[research] Extracting research context from deck and website...');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_completion_tokens: 1000,
    });
    
    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    
    console.log('[research] Extracted context:', JSON.stringify(parsed, null, 2).substring(0, 500));
    
    return {
      specificMarket: parsed.specificMarket || sector,
      targetCustomers: parsed.targetCustomers || 'technology companies',
      productDescription: parsed.productDescription || companyName,
      knownCompetitors: Array.isArray(parsed.knownCompetitors) ? parsed.knownCompetitors : [],
      claimedTam: parsed.claimedTam || null,
      claimedGrowth: parsed.claimedGrowth || null,
      geographicFocus: parsed.geographicFocus || 'United States',
      businessModel: parsed.businessModel || 'SaaS',
      fundingStage: parsed.fundingStage || 'seed',
    };
  } catch (error: any) {
    console.error('[research] Context extraction failed:', error.message);
    return {
      specificMarket: sector,
      targetCustomers: 'technology companies',
      productDescription: companyName,
      knownCompetitors: [],
      claimedTam: null,
      claimedGrowth: null,
      geographicFocus: 'United States',
      businessModel: 'SaaS',
      fundingStage: 'seed',
    };
  }
}

// Build smart search queries based on extracted context
function buildSmartSearchQueries(companyName: string, context: StartupResearchContext): {
  market: string[];
  competitors: string[];
  news: string[];
} {
  const { specificMarket, targetCustomers, knownCompetitors, claimedTam, geographicFocus, businessModel } = context;
  
  // Market research queries - use specific market terms
  const marketQueries: string[] = [
    `${specificMarket} market size TAM 2025 2026`,
    `${specificMarket} industry growth trends forecast`,
  ];
  
  // Add validation query if TAM was claimed
  if (claimedTam) {
    marketQueries.push(`${specificMarket} total addressable market research report`);
  }
  
  // Competitor queries - use known competitors if available
  const competitorQueries: string[] = [];
  
  if (knownCompetitors.length > 0) {
    // Search for the top known competitors
    for (const competitor of knownCompetitors.slice(0, 3)) {
      competitorQueries.push(`${competitor} funding valuation revenue 2025`);
    }
    competitorQueries.push(`${knownCompetitors[0]} vs alternatives comparison`);
  } else {
    // Fall back to general competitor search
    competitorQueries.push(`${companyName} competitors alternatives`);
    competitorQueries.push(`${specificMarket} startups companies landscape`);
  }
  
  // News queries - be specific
  const newsQueries: string[] = [
    `"${companyName}" funding announcement investment`,
    `"${companyName}" news 2025 2026`,
  ];
  
  // Add industry news
  newsQueries.push(`${specificMarket} recent deals acquisitions 2025`);
  
  return {
    market: marketQueries,
    competitors: competitorQueries,
    news: newsQueries,
  };
}

export async function researchCompany(
  companyName: string, 
  website: string, 
  sector: string,
  deckContent: string,  // Required: deck content for smart context-aware research
  preScrapedWebsite?: WebPageContent[]  // Optional: pre-scraped website content for parallel optimization
): Promise<{
  websiteContent: WebPageContent[];
  marketResearch: TavilySearchResponse[];
  competitorResearch: TavilySearchResponse[];
  newsResearch: TavilySearchResponse[];
  researchContext?: StartupResearchContext;
}> {
  console.log(`[research] Starting comprehensive research for: ${companyName}`);
  
  // Step 1: Use pre-scraped content if available, otherwise scrape now
  const websiteContent = preScrapedWebsite && preScrapedWebsite.length > 0 
    ? preScrapedWebsite 
    : await scrapeMultiplePages(website);
  
  // Step 2: Extract smart research context from deck + website
  const researchContext = await extractResearchContext(
    companyName,
    sector,
    deckContent,
    websiteContent
  );
  
  console.log(`[research] Using specific market: "${researchContext.specificMarket}"`);
  console.log(`[research] Known competitors: ${researchContext.knownCompetitors.join(', ') || 'none identified'}`);
  
  // Step 3: Build smart queries based on extracted context
  const searchQueries = buildSmartSearchQueries(companyName, researchContext);
  
  // Step 4: Run all searches in parallel for speed
  console.log(`[research] Running ${searchQueries.market.length + searchQueries.competitors.length + searchQueries.news.length} searches in parallel...`);
  
  const [marketResults, competitorResults, newsResults] = await Promise.all([
    // Market searches in parallel
    Promise.all(
      searchQueries.market.map(query => tavilySearch(query, { maxResults: 3 }))
    ),
    // Competitor searches in parallel
    Promise.all(
      searchQueries.competitors.map(query => tavilySearch(query, { maxResults: 5 }))
    ),
    // News searches in parallel
    Promise.all(
      searchQueries.news.map(query => tavilySearch(query, { maxResults: 3, excludeDomains: [website] }))
    ),
  ]);
  
  // Filter out empty results
  const marketResearch = marketResults.filter(r => r.results.length > 0);
  const competitorResearch = competitorResults.filter(r => r.results.length > 0);
  const newsResearch = newsResults.filter(r => r.results.length > 0);
  
  console.log(`[research] Completed research: ${websiteContent.length} pages, ${marketResearch.length + competitorResearch.length + newsResearch.length} searches`);
  
  return {
    websiteContent,
    marketResearch,
    competitorResearch,
    newsResearch,
    researchContext,
  };
}

export function isTavilyConfigured(): boolean {
  return !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

export function isWebSearchConfigured(): boolean {
  return !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

export function formatResearchForPrompt(research: Awaited<ReturnType<typeof researchCompany>>): string {
  let formatted = '';
  
  if (research.websiteContent.length > 0) {
    formatted += '=== COMPANY WEBSITE CONTENT ===\n\n';
    for (const page of research.websiteContent) {
      formatted += `--- Page: ${page.url} ---\n`;
      formatted += `Title: ${page.title}\n`;
      formatted += `Description: ${page.description}\n`;
      formatted += `Content:\n${page.mainContent.substring(0, 5000)}\n\n`;
    }
  }
  
  if (research.marketResearch.length > 0) {
    formatted += '\n=== MARKET RESEARCH ===\n\n';
    for (const search of research.marketResearch) {
      formatted += `Query: ${search.query}\n`;
      if (search.answer) {
        formatted += `Summary: ${search.answer}\n`;
      }
      for (const result of search.results) {
        formatted += `- ${result.title} (${result.url})\n  ${result.content.substring(0, 300)}\n`;
      }
      formatted += '\n';
    }
  }
  
  if (research.competitorResearch.length > 0) {
    formatted += '\n=== COMPETITOR RESEARCH ===\n\n';
    for (const search of research.competitorResearch) {
      formatted += `Query: ${search.query}\n`;
      if (search.answer) {
        formatted += `Summary: ${search.answer}\n`;
      }
      for (const result of search.results) {
        formatted += `- ${result.title} (${result.url})\n  ${result.content.substring(0, 300)}\n`;
      }
      formatted += '\n';
    }
  }
  
  if (research.newsResearch.length > 0) {
    formatted += '\n=== RECENT NEWS ===\n\n';
    for (const search of research.newsResearch) {
      formatted += `Query: ${search.query}\n`;
      for (const result of search.results) {
        formatted += `- ${result.title} (${result.url})\n  ${result.content.substring(0, 300)}\n`;
      }
      formatted += '\n';
    }
  }
  
  return formatted;
}
