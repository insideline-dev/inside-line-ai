import { ChatOpenAI } from "@langchain/openai";
import { 
  ChatPromptTemplate, 
  SystemMessagePromptTemplate, 
  HumanMessagePromptTemplate 
} from "@langchain/core/prompts";
import { SystemMessage } from "@langchain/core/messages";
import { StringOutputParser, JsonOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { z } from "zod";
import { storage } from "./storage";
import { computeStartupScore, type SectionScores } from "./score-computation";
import { initializeProgress, updateStage, completeAgent, completeAnalysis, wrapAgentCall, startAllAgents, startDeepResearchAgent, startAllDeepResearchAgents, completeDeepResearchAgent } from "./analysis-progress";
import { normalizeLocationToRegion } from "./investor-agents";
import { fetchLinkedInProfile, searchLinkedInByName, isUnipileConfigured, type LinkedInProfileData } from "./unipile";
import { ObjectStorageService } from "./replit_integrations/object_storage";
import { researchCompany, formatResearchForPrompt, isTavilyConfigured, scrapeMultiplePages, type WebPageContent, type TavilySearchResponse, type StartupResearchContext } from "./web-tools";
import { 
  conductComprehensiveResearch, 
  formatResearchForEvaluation,
  deepScrapeWebsite,
  discoverTeamMembers,
  enrichTeamWithLinkedIn,
  generateResearchParameters,
  runTeamDeepResearch,
  runMarketDeepResearch,
  runProductDeepResearch,
  runNewsSearch,
  checkBackgroundResponseStatus,
  type ComprehensiveResearchResult,
  type ResearchParameters,
  type TeamMemberResearch,
  type MarketResearch,
  type ProductResearch,
  type NewsResearch,
  type ResearchOptions,
  type StageProgressData,
  type BackgroundResearchResponse,
  type BackgroundResponseIds,
} from "./research-orchestrator";
import { PDFParse } from "pdf-parse";

// Source tracking types and class
export interface SourceEntry {
  category: "document" | "website" | "linkedin" | "api" | "database";
  name: string;
  url?: string;
  description?: string;
  agent: string;
  timestamp: string;
  dataExtracted?: string;
}

export class SourceTracker {
  private sources: SourceEntry[] = [];

  logSource(entry: Omit<SourceEntry, "timestamp">) {
    this.sources.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    console.log(`[SourceTracker] Logged source: ${entry.category} - ${entry.name} (${entry.agent})`);
  }

  logDocument(name: string, agent: string, description?: string, url?: string, dataExtracted?: string) {
    this.logSource({ category: "document", name, agent, description, url, dataExtracted });
  }

  logWebsite(url: string, agent: string, description?: string, dataExtracted?: string) {
    this.logSource({ category: "website", name: url, url, agent, description, dataExtracted });
  }

  logLinkedIn(profileUrl: string, memberName: string, agent: string, dataExtracted?: string) {
    this.logSource({ 
      category: "linkedin", 
      name: `LinkedIn: ${memberName}`, 
      url: profileUrl, 
      agent, 
      description: `LinkedIn profile scraping for ${memberName}`,
      dataExtracted 
    });
  }

  logAPI(apiName: string, agent: string, description?: string, dataExtracted?: string) {
    this.logSource({ category: "api", name: apiName, agent, description, dataExtracted });
  }

  logDatabase(tableName: string, agent: string, description?: string, dataExtracted?: string) {
    this.logSource({ category: "database", name: tableName, agent, description, dataExtracted });
  }

  getSources(): SourceEntry[] {
    return [...this.sources];
  }

  clear() {
    this.sources = [];
  }
}

// Check if extracted PDF text has meaningful content (not just page markers)
function hasActualContent(text: string): boolean {
  if (!text || text.length < 100) return false;
  
  // Remove page markers like "-- 1 of 16 --" and whitespace
  const withoutMarkers = text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim();
  // Remove the file header if present
  const withoutHeader = withoutMarkers.replace(/===.*===\n?/g, '').trim();
  
  // Check if remaining content is substantial (at least 200 chars of actual text)
  return withoutHeader.length > 200;
}

// Use OpenAI Vision to extract text from PDF pages when regular extraction fails
async function extractTextWithVision(buffer: Buffer, fileName: string): Promise<string> {
  console.log(`[deck-extraction] Using vision model to extract text from: ${fileName}`);
  
  // Use direct OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  try {
    const parser = new PDFParse({ data: buffer });
    
    // Get screenshots of ALL pages at once - the API returns all pages in the pages array
    console.log(`[deck-extraction] Getting screenshots for all pages...`);
    const screenshot = await parser.getScreenshot({ scale: 2.0 });
    
    if (!screenshot || !screenshot.pages || screenshot.pages.length === 0) {
      throw new Error("No pages returned from getScreenshot");
    }
    
    const pagesToProcess = Math.min(screenshot.pages.length, 20); // Limit to first 20 pages
    console.log(`[deck-extraction] Processing ${pagesToProcess} pages with vision in parallel`);
    
    // Process all pages in parallel
    const pagePromises = screenshot.pages.slice(0, pagesToProcess).map(async (page: any, index: number) => {
      const pageNum = page.pageNumber || (index + 1);
      try {
        if (!page.dataUrl) {
          console.log(`[deck-extraction] No dataUrl for page ${pageNum}`);
          return null;
        }
        
        // Call OpenAI Vision API directly - dataUrl is already a data:image/png;base64,... string
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `This is page ${pageNum} of a startup pitch deck. Extract EVERY piece of text visible on this slide, including:
- All headings, titles, and subtitles
- All body text, paragraphs, and bullet points
- All names of people (founders, team members, advisors)
- All job titles and roles
- All company names mentioned
- All numbers, percentages, and metrics
- All logos with text
- Text in charts, graphs, or diagrams
- Footer and header text
- Any small text or fine print

Be extremely thorough. If this is a team/founders slide, list every person's name and their title/role. Format the output with clear sections and line breaks. Do not skip any text, even if it seems minor.`,
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: page.dataUrl,
                      detail: 'high',
                    },
                  },
                ],
              },
            ],
            max_tokens: 2000,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          const extractedText = data.choices?.[0]?.message?.content || '';
          if (extractedText.trim()) {
            console.log(`[deck-extraction] Vision extracted ${extractedText.length} chars from page ${pageNum}`);
            return { pageNum, text: extractedText };
          }
        } else {
          const errorText = await response.text();
          console.log(`[deck-extraction] Vision API error on page ${pageNum}: ${response.status} - ${errorText.substring(0, 200)}`);
        }
        return null;
      } catch (pageError: any) {
        console.log(`[deck-extraction] Error processing page ${pageNum}: ${pageError.message}`);
        return null;
      }
    });
    
    // Wait for all pages to complete
    const results = await Promise.all(pagePromises);
    
    // Sort by page number and combine
    const validResults = results.filter((r): r is { pageNum: number; text: string } => r !== null);
    validResults.sort((a, b) => a.pageNum - b.pageNum);
    
    const allText = validResults.map(r => `--- Page ${r.pageNum} ---\n${r.text}`);
    const combinedText = allText.join('\n\n');
    console.log(`[deck-extraction] Vision extraction complete: ${combinedText.length} chars from ${allText.length} pages`);
    return combinedText;
    
  } catch (error: any) {
    console.error(`[deck-extraction] Vision extraction failed: ${error.message}`);
    throw error;
  }
}

// Wrapper function to parse PDF buffer using v2 API with vision fallback
async function parsePdf(buffer: Buffer, fileName: string = 'document.pdf'): Promise<{ text: string }> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const extractedText = result.text || "";
  
  // Check if we got meaningful content
  if (hasActualContent(extractedText)) {
    console.log(`[deck-extraction] Text extraction successful: ${extractedText.length} chars`);
    return { text: extractedText };
  }
  
  // Text extraction failed or returned only page markers - try vision
  console.log(`[deck-extraction] Text extraction found no meaningful content, trying vision...`);
  try {
    const visionText = await extractTextWithVision(buffer, fileName);
    if (visionText && visionText.length > 100) {
      return { text: visionText };
    }
  } catch (visionError: any) {
    console.log(`[deck-extraction] Vision fallback failed: ${visionError.message}`);
  }
  
  // Return whatever we got from text extraction as last resort
  return { text: extractedText };
}

const objectStorageService = new ObjectStorageService();

interface ExtractionResult {
  success: boolean;
  content: string;
  filesAttempted: number;
  filesExtracted: number;
  errors: string[];
}

async function extractDeckContent(files: Array<{name: string; path: string; type: string}> | null): Promise<ExtractionResult> {
  if (!files || files.length === 0) {
    console.log("[deck-extraction] No files provided");
    return { success: true, content: "", filesAttempted: 0, filesExtracted: 0, errors: [] };
  }

  const pdfFiles = files.filter(f => 
    f.type === 'application/pdf' || 
    f.name.toLowerCase().endsWith('.pdf') ||
    f.path?.toLowerCase().includes('deck') ||
    f.path?.toLowerCase().includes('pitch')
  );

  if (pdfFiles.length === 0) {
    console.log("[deck-extraction] No PDF files found");
    return { success: true, content: "", filesAttempted: 0, filesExtracted: 0, errors: [] };
  }

  const errors: string[] = [];
  const allContent: string[] = [];
  const filesToProcess = pdfFiles.slice(0, 3);

  try {
    for (const file of filesToProcess) {
      try {
        if (!file.path) {
          const errorMsg = `Missing path for file: ${file.name}`;
          console.log(`[deck-extraction] ${errorMsg}`);
          errors.push(errorMsg);
          continue;
        }
        
        console.log(`[deck-extraction] ===== READING FILE FROM OBJECT STORAGE =====`);
        console.log(`[deck-extraction] File name: ${file.name}`);
        console.log(`[deck-extraction] File path: ${file.path}`);
        
        const gcsFile = await objectStorageService.getObjectEntityFile(file.path);
        const [buffer] = await gcsFile.download();
        
        console.log(`[deck-extraction] Downloaded buffer size: ${buffer?.length || 0} bytes`);
        
        if (buffer && buffer.length > 0) {
          // Check magic bytes to verify it's a valid PDF
          const magicBytes = buffer.slice(0, 5).toString('utf8');
          const magicBytesHex = buffer.slice(0, 10).toString('hex');
          console.log(`[deck-extraction] Magic bytes (utf8): "${magicBytes}"`);
          console.log(`[deck-extraction] Magic bytes (hex): ${magicBytesHex}`);
          
          if (magicBytes === '%PDF-') {
            console.log(`[deck-extraction] VALID PDF - Magic bytes confirmed, proceeding to parse`);
          } else {
            console.error(`[deck-extraction] WARNING: File does not appear to be a valid PDF!`);
            console.error(`[deck-extraction] Expected: "%PDF-", Got: "${magicBytes}"`);
          }
          
          const data = await parsePdf(buffer, file.name);
          if (data.text && data.text.length > 50) {
            allContent.push(`=== ${file.name} ===\n${data.text}`);
            console.log(`[deck-extraction] SUCCESS: Extracted ${data.text.length} chars from ${file.name}`);
          } else {
            const errorMsg = `No extractable text in: ${file.name}`;
            console.log(`[deck-extraction] ${errorMsg}`);
            errors.push(errorMsg);
          }
        } else {
          const errorMsg = `Empty file buffer for: ${file.name}`;
          console.log(`[deck-extraction] ${errorMsg}`);
          errors.push(errorMsg);
        }
      } catch (fileError: any) {
        const errorMsg = `Failed to extract ${file.name}: ${fileError.message || 'Unknown error'}`;
        console.error(`[deck-extraction] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    const combinedContent = allContent.join("\n\n");
    console.log(`[deck-extraction] Total extracted content: ${combinedContent.length} chars from ${allContent.length}/${filesToProcess.length} files`);
    
    return {
      success: allContent.length > 0,
      content: combinedContent,
      filesAttempted: filesToProcess.length,
      filesExtracted: allContent.length,
      errors,
    };
  } catch (error: any) {
    console.error("[deck-extraction] PDF parsing error:", error);
    return {
      success: false,
      content: "",
      filesAttempted: filesToProcess.length,
      filesExtracted: 0,
      errors: [`PDF parsing system error: ${error.message || 'Unknown error'}`],
    };
  }
}

/**
 * Extract missing startup fields from parsed deck content.
 * Only fills fields with high confidence - never makes up data.
 */
interface ExtractedFields {
  website?: string;
  description?: string;
  stage?: string;
  sector?: string;
  location?: string;
  roundSize?: number;
  roundCurrency?: string;
  founderLinkedIns?: string[];
}

async function extractFieldsFromDeckContent(
  deckContent: string, 
  existingStartup: { 
    website?: string | null;
    description?: string | null;
    stage?: string | null;
    sector?: string | null;
    location?: string | null;
    roundSize?: number | null;
    roundCurrency?: string | null;
  }
): Promise<ExtractedFields> {
  if (!deckContent || deckContent.length < 100) {
    console.log("[field-extraction] Deck content too short for extraction");
    return {};
  }
  
  // Identify which fields are missing
  const missingFields: string[] = [];
  if (!existingStartup.website) missingFields.push("website");
  if (!existingStartup.description) missingFields.push("description");
  if (!existingStartup.stage) missingFields.push("stage");
  if (!existingStartup.sector) missingFields.push("sector");
  if (!existingStartup.location) missingFields.push("location");
  if (!existingStartup.roundSize) missingFields.push("roundSize");
  
  if (missingFields.length === 0) {
    console.log("[field-extraction] No missing fields to extract");
    return {};
  }
  
  console.log(`[field-extraction] Extracting missing fields: ${missingFields.join(", ")}`);
  
  const model = getJsonModel();
  
  const extractionPrompt = `Analyze this pitch deck content and extract ONLY the following missing fields. 
  
CRITICAL RULES:
1. Only extract information that is EXPLICITLY stated in the document
2. Do NOT guess or infer - if the information is not clearly present, set the field to null
3. Be conservative - only extract with high confidence

Missing fields to extract: ${missingFields.join(", ")}

Pitch deck content:
${deckContent.slice(0, 15000)}

Respond in JSON format:
{
  "website": "company website URL if explicitly mentioned (e.g., acme.com, www.acme.io) or null",
  "description": "1-2 sentence description of what the company does if clear from the deck, or null",
  "stage": "pre_seed|seed|series_a|series_b|series_c|series_d|series_e|series_f_plus if explicitly mentioned, or null",
  "sector": "primary industry/sector if clear (e.g., fintech, healthcare, AI, SaaS) or null",
  "location": "city, country if explicitly mentioned or null",
  "roundSize": numeric round size if explicitly mentioned (just the number, no currency symbol) or null,
  "roundCurrency": "USD|EUR|GBP|CAD|AUD etc if round size is mentioned, or null",
  "founderLinkedIns": ["array of linkedin profile URLs if mentioned"] or null,
  "confidence": {
    "website": 0-1,
    "description": 0-1,
    "stage": 0-1,
    "sector": 0-1,
    "location": 0-1,
    "roundSize": 0-1
  }
}

Only include fields with confidence >= 0.7. Set others to null.`;

  try {
    const response = await model.invoke([
      new SystemMessage("You extract startup information from pitch decks. Be conservative - only extract what is explicitly stated, never guess or infer."),
      new HumanMessage(extractionPrompt)
    ]);
    
    const jsonStr = response.content.toString().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    
    const result: ExtractedFields = {};
    const confidence = parsed.confidence || {};
    
    // Only include fields with high confidence (>=0.7)
    if (parsed.website && confidence.website >= 0.7 && !existingStartup.website) {
      result.website = parsed.website;
      console.log(`[field-extraction] Extracted website: ${parsed.website} (confidence: ${confidence.website})`);
    }
    if (parsed.description && confidence.description >= 0.7 && !existingStartup.description) {
      result.description = parsed.description;
      console.log(`[field-extraction] Extracted description (confidence: ${confidence.description})`);
    }
    if (parsed.stage && confidence.stage >= 0.7 && !existingStartup.stage) {
      result.stage = parsed.stage;
      console.log(`[field-extraction] Extracted stage: ${parsed.stage} (confidence: ${confidence.stage})`);
    }
    if (parsed.sector && confidence.sector >= 0.7 && !existingStartup.sector) {
      result.sector = parsed.sector;
      console.log(`[field-extraction] Extracted sector: ${parsed.sector} (confidence: ${confidence.sector})`);
    }
    if (parsed.location && confidence.location >= 0.7 && !existingStartup.location) {
      result.location = parsed.location;
      console.log(`[field-extraction] Extracted location: ${parsed.location} (confidence: ${confidence.location})`);
    }
    if (parsed.roundSize && confidence.roundSize >= 0.7 && !existingStartup.roundSize) {
      result.roundSize = parsed.roundSize;
      result.roundCurrency = parsed.roundCurrency || "USD";
      console.log(`[field-extraction] Extracted round: ${parsed.roundSize} ${result.roundCurrency} (confidence: ${confidence.roundSize})`);
    }
    if (parsed.founderLinkedIns && Array.isArray(parsed.founderLinkedIns) && parsed.founderLinkedIns.length > 0) {
      result.founderLinkedIns = parsed.founderLinkedIns;
      console.log(`[field-extraction] Extracted ${parsed.founderLinkedIns.length} LinkedIn URLs`);
    }
    
    const extractedCount = Object.keys(result).length;
    console.log(`[field-extraction] Successfully extracted ${extractedCount} fields`);
    
    return result;
  } catch (error: any) {
    console.error("[field-extraction] Error extracting fields:", error.message);
    return {};
  }
}

/**
 * Discover company website if not provided.
 * First tries to extract from deck content, then does a web search.
 */
async function discoverWebsite(companyName: string, deckContent?: string): Promise<string | null> {
  console.log(`[website-discovery] Searching for website for: ${companyName}`);
  
  // First, try to extract from deck content if available
  if (deckContent && deckContent.length > 100) {
    // Look for URL patterns in the deck
    const urlPatterns = [
      /(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/gi,
      /https?:\/\/([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/gi,
    ];
    
    const foundUrls: string[] = [];
    for (const pattern of urlPatterns) {
      const matches = deckContent.match(pattern);
      if (matches) {
        foundUrls.push(...matches);
      }
    }
    
    // Filter out common non-company URLs and file extensions
    const excludePatterns = [
      /linkedin\.com/i, /twitter\.com/i, /facebook\.com/i, /instagram\.com/i,
      /github\.com/i, /youtube\.com/i, /medium\.com/i, /crunchbase\.com/i,
      /google\.com/i, /apple\.com/i, /amazon\.com/i, /microsoft\.com/i,
      /gmail\.com/i, /outlook\.com/i, /yahoo\.com/i,
    ];
    
    // Common file extensions that are NOT valid TLDs
    const fileExtensions = [
      /\.pdf$/i, /\.doc$/i, /\.docx$/i, /\.ppt$/i, /\.pptx$/i,
      /\.xls$/i, /\.xlsx$/i, /\.png$/i, /\.jpg$/i, /\.jpeg$/i,
      /\.gif$/i, /\.svg$/i, /\.zip$/i, /\.rar$/i, /\.txt$/i,
    ];
    
    const potentialWebsites = foundUrls.filter(url => {
      const lowerUrl = url.toLowerCase();
      // Exclude social media and common sites
      if (excludePatterns.some(pattern => pattern.test(lowerUrl))) {
        return false;
      }
      // Exclude file extensions (not real websites)
      if (fileExtensions.some(pattern => pattern.test(lowerUrl))) {
        console.log(`[website-discovery] Ignoring file extension as URL: ${url}`);
        return false;
      }
      return true;
    });
    
    if (potentialWebsites.length > 0) {
      // Prefer URLs that contain parts of the company name
      const companyNameLower = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchingUrl = potentialWebsites.find(url => {
        const urlLower = url.toLowerCase().replace(/[^a-z0-9.]/g, '');
        return urlLower.includes(companyNameLower) || companyNameLower.includes(urlLower.split('.')[0]);
      });
      
      if (matchingUrl) {
        const website = matchingUrl.startsWith('http') ? matchingUrl : `https://${matchingUrl}`;
        console.log(`[website-discovery] Found website in deck: ${website}`);
        return website;
      }
      
      // Otherwise use the first non-excluded URL
      const firstUrl = potentialWebsites[0];
      const website = firstUrl.startsWith('http') ? firstUrl : `https://${firstUrl}`;
      console.log(`[website-discovery] Using first URL from deck: ${website}`);
      return website;
    }
  }
  
  // If not found in deck, do a real web search
  console.log(`[website-discovery] Website not found in deck, performing web search...`);
  
  try {
    // Import the web search and scraping functions
    const { openaiWebSearch, scrapeWebpage } = await import('./web-tools');
    
    // Simple search with just the company name
    const searchResults = await openaiWebSearch(companyName, {
      maxResults: 5,
      excludeDomains: ['linkedin.com', 'twitter.com', 'facebook.com', 'instagram.com', 'github.com', 'youtube.com', 'medium.com', 'crunchbase.com', 'wikipedia.org', 'bloomberg.com', 'reuters.com', 'techcrunch.com', 'forbes.com']
    });
    
    if (searchResults.results.length > 0) {
      // Try each result until we find one that matches the company
      for (const result of searchResults.results) {
        console.log(`[website-discovery] Checking website: ${result.url}`);
        
        try {
          // Actually visit the website and check if it's about this company
          const pageContent = await scrapeWebpage(result.url);
          
          if (pageContent.error) {
            console.log(`[website-discovery] Could not access ${result.url}: ${pageContent.error}`);
            continue;
          }
          
          // Check if the page title or content contains the company name
          const companyNameLower = companyName.toLowerCase();
          const titleLower = (pageContent.title || '').toLowerCase();
          const descriptionLower = (pageContent.description || '').toLowerCase();
          const contentLower = (pageContent.mainContent || '').toLowerCase().slice(0, 5000);
          
          // Look for company name in title, description, or main content
          const foundInTitle = titleLower.includes(companyNameLower);
          const foundInDescription = descriptionLower.includes(companyNameLower);
          const foundInContent = contentLower.includes(companyNameLower);
          
          if (foundInTitle || foundInDescription || foundInContent) {
            console.log(`[website-discovery] Verified website ${result.url} - company name found in ${foundInTitle ? 'title' : foundInDescription ? 'description' : 'content'}`);
            return result.url;
          } else {
            console.log(`[website-discovery] Website ${result.url} doesn't mention "${companyName}" - skipping`);
          }
        } catch (scrapeError: any) {
          console.log(`[website-discovery] Error checking ${result.url}: ${scrapeError.message}`);
          continue;
        }
      }
    }
    
    console.log(`[website-discovery] No verified website found for "${companyName}"`);
    return null;
  } catch (error: any) {
    console.error("[website-discovery] Error performing web search:", error.message);
    return null;
  }
}

function getModel() {
  // Use direct OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  // Use GPT-4o for all agent analyses
  return new ChatOpenAI({
    modelName: "gpt-4o",
    openAIApiKey: apiKey,
  });
}

function getJsonModel() {
  // Use direct OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  // Use GPT-5.2 for structured JSON outputs - all Stage 4 evaluation agents
  return new ChatOpenAI({
    modelName: "gpt-5.2-2025-12-11",
    openAIApiKey: apiKey,
    modelKwargs: {
      response_format: { type: "json_object" },
    },
  });
}

function getDeepResearchModel() {
  // Use direct OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  // Use gpt-4o for deep competitive analysis and market research
  return new ChatOpenAI({
    modelName: "gpt-4o",
    openAIApiKey: apiKey,
    modelKwargs: {
      response_format: { type: "json_object" },
    },
  });
}

interface TeamMemberInput {
  name: string;
  role: string;
  linkedinUrl: string;
  // Enriched LinkedIn data
  headline?: string;
  summary?: string;
  location?: string;
  profilePictureUrl?: string;
  skills?: string[];
  experience?: {
    title: string;
    company: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    isCurrent?: boolean;
  }[];
  education?: {
    school: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
  }[];
}

interface WebResearchData {
  websiteContent: WebPageContent[];
  marketResearch: TavilySearchResponse[];
  competitorResearch: TavilySearchResponse[];
  newsResearch: TavilySearchResponse[];
  formattedForPrompt: string;
  researchContext?: StartupResearchContext;  // Smart context extracted from deck/website
}

function truncateWebResearch(research: WebResearchData | undefined, maxChars: number = 8000): string {
  if (!research) return "No web research available.";
  
  let result = "";
  let remaining = maxChars;
  
  // Add website content (priority 1)
  if (research.websiteContent && research.websiteContent.length > 0) {
    result += "=== WEBSITE CONTENT ===\n";
    for (const page of research.websiteContent) {
      if (remaining <= 0) break;
      const pageContent = `${page.title}: ${page.mainContent.substring(0, Math.min(2000, remaining))}\n`;
      result += pageContent;
      remaining -= pageContent.length;
    }
  }
  
  // Add market research (priority 2)
  if (remaining > 0 && research.marketResearch && research.marketResearch.length > 0) {
    result += "\n=== MARKET RESEARCH ===\n";
    for (const search of research.marketResearch) {
      if (remaining <= 0) break;
      let searchContent = `Query: ${search.query}\n`;
      if (search.answer) searchContent += `Summary: ${search.answer.substring(0, 500)}\n`;
      result += searchContent;
      remaining -= searchContent.length;
    }
  }
  
  // Add competitor research (priority 3)
  if (remaining > 0 && research.competitorResearch && research.competitorResearch.length > 0) {
    result += "\n=== COMPETITOR RESEARCH ===\n";
    for (const search of research.competitorResearch) {
      if (remaining <= 0) break;
      let searchContent = `${search.query}: `;
      searchContent += search.results.slice(0, 3).map(r => r.title).join(", ") + "\n";
      result += searchContent;
      remaining -= searchContent.length;
    }
  }
  
  // Add news (priority 4)
  if (remaining > 0 && research.newsResearch && research.newsResearch.length > 0) {
    result += "\n=== RECENT NEWS ===\n";
    for (const search of research.newsResearch) {
      if (remaining <= 0) break;
      let newsContent = search.results.slice(0, 2).map(r => `- ${r.title}`).join("\n") + "\n";
      result += newsContent;
      remaining -= newsContent.length;
    }
  }
  
  return result || "No web research available.";
}

interface StartupContext {
  name: string;
  website: string;
  description: string;
  productDescription?: string | null; // Detailed product description from founder
  teamMembers: TeamMemberInput[];
  stage: string;
  sector: string;
  sectorIndustryGroup?: string | null;
  sectorIndustry?: string | null;
  location: string;
  roundSize: number | string | null;
  roundCurrency?: string | null;
  valuation: number | string | null;
  valuationKnown?: boolean | null; // Whether founder has determined target valuation
  valuationType?: string | null; // "pre_money" | "post_money"
  raiseType?: string | null; // "safe" | "convertible_note" | "equity" | "safe_equity" | "undecided"
  leadSecured?: boolean | null;
  leadInvestorName?: string | null;
  hasPreviousFunding?: boolean | null;
  previousFundingAmount?: number | string | null;
  previousFundingCurrency?: string | null;
  previousInvestors?: string | null;
  previousRoundType?: string | null;
  deckContent?: string;
  webResearch?: WebResearchData;
  adminFeedback?: string; // Optional admin comment to guide agent analysis
  cachedTeamMemberEvaluations?: any[]; // Cached LinkedIn data from previous evaluations to avoid redundant API calls
  // Comprehensive research data from new Research Orchestrator
  comprehensiveResearch?: ComprehensiveResearchResult;
  teamDeepResearch?: TeamMemberResearch[];
  marketDeepResearch?: MarketResearch;
  productDeepResearch?: ProductResearch;
  newsResearch?: NewsResearch;
}

/**
 * Helper function to extract score from agent data structures.
 * Agents may return scores in different locations - this function checks all known paths.
 * Uses nullish coalescing (??) to properly handle 0 as a valid score.
 */
function extractAgentScore(agentData: any, agentType: 'team' | 'market' | 'product' | 'traction' | 'businessModel' | 'gtm' | 'financials' | 'competitiveAdvantage' | 'legal' | 'dealTerms' | 'exitPotential'): number {
  if (!agentData) return 50;
  
  // Check direct overallScore first (standard format)
  if (typeof agentData.overallScore === 'number') {
    return agentData.overallScore;
  }
  
  // Check nested scores structure (newer agent format)
  if (agentData.scores) {
    // Team agent uses weighted_team_score_0_100
    if (agentType === 'team' && typeof agentData.scores.weighted_team_score_0_100 === 'number') {
      return Math.round(agentData.scores.weighted_team_score_0_100);
    }
    // Generic overall_score in scores object
    if (typeof agentData.scores.overall_score === 'number') {
      return agentData.scores.overall_score;
    }
    if (typeof agentData.scores.overallScore === 'number') {
      return agentData.scores.overallScore;
    }
  }
  
  // Check score field (some agents use this)
  if (typeof agentData.score === 'number') {
    return agentData.score;
  }
  
  // Default to 50 if no score found
  return 50;
}

const teamAnalysisPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are an elite VC Team Analyst Agent with deep expertise in founder evaluation. You analyze teams with the rigor of top-tier VCs like Sequoia, a16z, and Benchmark.

=== EVALUATION FRAMEWORK (Weight: 20% of total score) ===

**1. FOUNDER-MARKET FIT (40% of team score)**
Score based on direct domain expertise alignment:
- 90-100: Founders previously built/scaled a company in same space OR held C-level/VP roles at market leaders in this exact domain
- 75-89: Deep operational experience (5+ years) in adjacent space with transferable expertise
- 60-74: Relevant industry experience but not in core problem domain; strong general entrepreneurial background
- 40-59: Limited direct domain experience but strong technical/business fundamentals
- 0-39: No relevant domain experience; pure generalists

**2. TRACK RECORD (25% of team score)**
Evaluate prior achievements:
- Previous successful exits (acquisition $10M+, IPO)
- Tenure at tier-1 companies (FAANG, top startups, industry leaders)
- Previously raised institutional VC funding
- Built and scaled teams (10+ to 100+)
- Published patents, research, or industry recognition

**3. TEAM COMPOSITION (20% of team score)**
Assess role coverage and balance:
- CEO/Business Leader: Vision, fundraising, GTM, partnerships
- CTO/Technical Leader: Architecture, product development, technical hiring
- Industry Expert: Domain knowledge, customer relationships, market credibility
- CRITICAL: At {stage} stage, which roles are essential vs nice-to-have?

**4. EXECUTION CAPABILITY (15% of team score)**
Signals of ability to execute:
- Have they worked together before? (co-founder history reduces risk)
- Full-time commitment vs part-time/advisors
- Complementary skill sets (avoid overlap gaps)
- Speed indicators: How fast did they ship MVP? Raise funding?

=== SCORING GUIDELINES ===
- Be CRITICAL and data-driven. VCs reject 99% of deals.
- Adjust expectations by stage: Seed teams can have gaps; Series B should be complete
- Red flags: Solo non-technical founder in deep-tech, all-advisor team, no one with startup experience
- Green flags: Repeat founders, worked together before, domain expertise + execution track record

You will receive real LinkedIn profile data for ALL team members. Analyze ONLY what is evidenced in the data. Flag when data is missing.

IMPORTANT: You MUST evaluate EVERY team member provided in the input. Do not skip anyone. Each person should get their own entry in the "members" array with a tailored relevantExperience assessment explaining why their background matters for THIS specific company.

Return a JSON object with:
{{
  "members": [
    {{
      "name": "string - MUST match the name exactly as provided in input",
      "role": "string - their role at this startup",
      "background": "string - 2-3 sentence professional summary based on their LinkedIn data",
      "relevantExperience": "string - 2-3 sentences explaining WHY this person's specific experience matters for THIS startup's mission/market. Reference their actual past roles, companies, and achievements. Be specific about how their background applies to the company's problem domain.",
      "trackRecord": "string - notable achievements, exits, companies",
      "founderMarketFit": number 0-100,
      "fmfJustification": "string - specific reasons for FMF score",
      "strengths": ["array of this person's key strengths for this venture"],
      "concerns": ["array of gaps or risks for this person"]
    }}
  ],
  "teamComposition": {{
    "hasBusinessLeader": boolean,
    "hasTechnicalLeader": boolean,
    "hasIndustryExpert": boolean,
    "hasOperationsLeader": boolean,
    "teamBalance": "string - assessment of team balance and dynamics",
    "gapsIdentified": ["array of critical hiring needs with priority"],
    "stageAppropriate": boolean - "is this team complete enough for their stage?"
  }},
  "cofounderDynamics": {{
    "workedTogetherBefore": boolean or null if unknown,
    "complementarySkills": boolean,
    "potentialConflicts": ["array of potential issues"]
  }},
  "founderMarketFit": number 0-100,
  "executionRiskNotes": ["array of specific execution risks with severity"],
  "overallScore": number 0-100,
  "scoreBreakdown": {{
    "founderMarketFitScore": number 0-100,
    "trackRecordScore": number 0-100,
    "teamCompositionScore": number 0-100,
    "executionCapabilityScore": number 0-100
  }},
  "keyStrengths": ["array of team strengths - be specific"],
  "keyRisks": ["array of team risks - be specific"],
  "hiringRecommendations": ["array of roles to hire and why"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze this startup's founding team with VC-level rigor:

=== COMPANY CONTEXT ===
Company: {companyName}
Sector: {sector}
Stage: {stage}

Company Description:
{companyDescription}

=== PITCH DECK / BUSINESS CONTEXT ===
{deckContext}

=== TEAM MEMBERS WITH LINKEDIN DATA ===
{teamMembersData}

{adminGuidance}

=== EVALUATION INSTRUCTIONS ===
1. For each founder, assess their SPECIFIC relevance to this company's problem and market
2. Consider what skills/experience are CRITICAL for success in {sector} at {stage} stage
3. Identify gaps that could derail execution
4. Be rigorous - most startups fail due to team issues

Provide your comprehensive team evaluation.`),
]);

// Team Memo Synthesis Prompt - generates narrative writeup from scoring data
const teamMemoSynthesisPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a senior VC investment memo writer. Your task is to synthesize all team analysis data into a compelling, professional narrative for the Team section of an investment memo.

=== WRITING GUIDELINES ===

**TONE & STYLE:**
- Write in the third person, professional VC memo style
- Be direct and analytical, not promotional
- Balance strengths with honest assessment of risks
- Use specific evidence from LinkedIn data and track records
- Avoid generic platitudes - every sentence should convey real information

**STRUCTURE (2-3 paragraphs, 200-350 words total):**

**Paragraph 1 - Team Overview & Founder-Market Fit:**
- Lead with the strongest founder credentials relevant to THIS specific opportunity
- Highlight domain expertise, previous companies, and relevant experience
- Explain WHY these founders are uniquely positioned to solve this problem
- Reference specific roles, companies, and achievements from their backgrounds

**Paragraph 2 - Team Dynamics & Composition:**
- Assess the balance of skills (technical, business, industry)
- Note co-founder history and complementary capabilities
- Identify any critical hires needed and their priority
- Mention execution signals (speed to market, previous collaboration)

**Paragraph 3 - Risks & Considerations (if significant):**
- Only include if there are material concerns
- Frame constructively with mitigating factors where possible
- Be specific about what would derail execution

**KEY PRINCIPLES:**
- Lead with signal, not noise
- Every claim should reference specific evidence
- Calibrate language to the actual strength (don't oversell weak teams)
- VCs read thousands of memos - make every word count

Return a JSON object with:
{{
  "teamMemoNarrative": "string - the complete 2-3 paragraph narrative",
  "oneLineSummary": "string - single sentence capturing the team's key strength or positioning",
  "investorHighlights": ["array of 3-4 bullet points for quick scanning"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Generate a professional VC memo narrative for the Team section based on all available data:

=== COMPANY CONTEXT ===
Company: {companyName}
Sector: {sector}
Stage: {stage}
Description: {companyDescription}

=== TEAM SCORING RESULTS ===
Overall Team Score: {overallScore}/100
Founder-Market Fit Score: {fmfScore}/100
Track Record Score: {trackRecordScore}/100
Team Composition Score: {compositionScore}/100
Execution Capability Score: {executionScore}/100

=== INDIVIDUAL FOUNDER EVALUATIONS ===
{founderDetails}

=== TEAM COMPOSITION ANALYSIS ===
{teamComposition}

=== CO-FOUNDER DYNAMICS ===
{cofounderDynamics}

=== LINKEDIN ENRICHMENT DATA ===
{linkedinData}

=== KEY STRENGTHS IDENTIFIED ===
{keyStrengths}

=== KEY RISKS IDENTIFIED ===
{keyRisks}

=== HIRING RECOMMENDATIONS ===
{hiringRecommendations}

Synthesize all of the above into a cohesive, professional Team section narrative that a VC partner would include in their investment memo.`),
]);

const marketAnalysisPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Market Research Agent specializing in market analysis for investment memos.

Your role is to analyze:
1. TAM/SAM/SOM: Validate market size claims using bottom-up calculations
2. Market Growth (CAGR): Is the market expanding or contracting?
3. Why Now: Regulatory changes, technology shifts, or market timing
4. Competitive Landscape: Key players, positioning, and differentiation
5. Market Dynamics: Barriers to entry, network effects, winner-take-all dynamics

Use your knowledge of market data sources like Gartner, Statista, Census data, and industry reports.

**CLAIM VALIDATION IS CRITICAL:**
- Compare any TAM, growth rate, or market size claims from the pitch deck against the web research findings
- If the deck claims a specific TAM (e.g., "$50B market"), verify this against independent research
- If the deck claims a growth rate (e.g., "40% CAGR"), validate against industry reports
- Flag any discrepancies between company claims and external data in the "claimValidation" field
- Rate the credibility of market claims (inflated, accurate, conservative)

CRITICAL: You must generate a "narrativeSummary" field containing a 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Market size and opportunity - TAM/SAM/SOM analysis, growth trajectory, market dynamics
- Paragraph 2: Why now - Market timing, regulatory shifts, technology enablers, macro tailwinds
- Paragraph 3: Claim validation - Compare deck claims vs research findings, highlight discrepancies
- Paragraph 4: Market risks and investment implications

**Writing Style:**
- Write as an experienced VC analyst presenting to investment committee
- Use specific data points and cite sources where applicable
- Be analytical, not promotional - acknowledge both opportunities and concerns
- Use professional prose, not bullet points

Return a JSON object with:
{{
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "statedTAM": "string or null - TAM claimed by company",
  "validatedTAM": "string or null - your validated estimate from research",
  "tamSource": "string - actual sources used to validate",
  "claimValidation": {{
    "tamAccuracy": "inflated | accurate | conservative | unable_to_verify",
    "growthRateAccuracy": "inflated | accurate | conservative | unable_to_verify",
    "discrepancies": ["array of specific discrepancies between claims and research"],
    "verifiedClaims": ["array of claims that were verified as accurate"]
  }},
  "marketCredibility": number 0-100,
  "marketDynamics": "string describing growth and dynamics",
  "competitiveLandscape": "string describing key competitors",
  "whyNow": "string explaining market timing",
  "marketGrowthRate": "string - estimated CAGR from research",
  "overallScore": number 0-100,
  "keyStrengths": ["array of market strengths"],
  "keyRisks": ["array of market risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze the market opportunity for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}
Location: {location}

=== EXTRACTED CONTEXT FROM DECK/WEBSITE ===
{researchContext}

Additional context from pitch materials:
{deckContext}

=== LIVE WEB RESEARCH ===
{webResearch}

{adminGuidance}

IMPORTANT: Compare the company's claims from the pitch deck against the web research findings. Flag any TAM, growth rate, or market position claims that don't match external data. Provide a comprehensive market analysis with claim validation.`),
]);

const tractionAnalysisPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Traction Analyst Agent specializing in growth metrics for investment memos.

Your role is to analyze:
1. Revenue Stage: Pre-revenue, early-revenue, scaling, or mature
2. Growth Velocity: Month-over-month growth rates
3. User Quality: Active users vs signups, engagement metrics
4. Retention: Churn rates and cohort analysis
5. Momentum Credibility: How believable are the traction claims?

Cross-reference claimed metrics against typical benchmarks for the sector and stage.

CRITICAL: You must generate a "narrativeSummary" field containing a 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Current traction state - Revenue stage, key metrics, user/customer base
- Paragraph 2: Growth trajectory - Month-over-month trends, velocity, acceleration indicators
- Paragraph 3: Credibility assessment - How verifiable are claims, benchmark comparisons, red flags
- Paragraph 4 (optional): Momentum outlook - Where is growth heading, inflection points

**Writing Style:**
- Write as an experienced VC analyst presenting to investment committee
- Use specific metrics and benchmarks where available
- Be analytical and skeptical - validate claims against industry norms
- Use professional prose, not bullet points

Return a JSON object with:
{{
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "revenueStage": "pre-revenue | early-revenue | scaling | mature",
  "growthSignals": ["array of positive growth indicators"],
  "momentum": number 0-100,
  "credibility": number 0-100,
  "overallScore": number 0-100,
  "estimatedMRR": "string or null",
  "userMetrics": {{
    "claimed": "string describing claimed metrics",
    "assessment": "string - your assessment of credibility"
  }},
  "keyStrengths": ["array of traction strengths"],
  "keyRisks": ["array of traction risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze traction and growth signals for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}
Stage: {stage}

Additional context:
{deckContext}

Assess growth momentum and credibility of traction claims.

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}`),
]);

const financialsAnalysisPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Financial Analyst Agent specializing in unit economics and capital efficiency for investment memos.

Your role is to analyze:
1. Unit Economics: CAC vs LTV, payback period
2. Margins: Gross margin profile (SaaS should be 70-80%)
3. Burn Rate: Net burn and runway analysis
4. Burn Multiple: Cash burned per $1 of ARR
5. Valuation: Is the asking valuation reasonable for the stage and traction?

CRITICAL: You must generate a "narrativeSummary" field containing a 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Capital structure - Current raise, runway, burn rate, capital efficiency
- Paragraph 2: Valuation analysis - Asking price vs comparables, multiples, reasonableness
- Paragraph 3: Financial trajectory - Path to profitability, funding needs, milestones
- Paragraph 4 (optional): Financial risks - Burn rate concerns, dilution, dependency on future raises

**Writing Style:**
- Write as an experienced VC analyst presenting to investment committee
- Use specific multiples and benchmarks where available
- Be analytical, not promotional - acknowledge both strengths and concerns
- Use professional prose, not bullet points

Return a JSON object with:
{{
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "unitEconomics": {{
    "estimatedCAC": "string or null",
    "estimatedLTV": "string or null",
    "ltvCacRatio": "string assessment",
    "paybackPeriod": "string assessment"
  }},
  "margins": {{
    "estimatedGrossMargin": "string percentage or null",
    "assessment": "string - healthy or concerning"
  }},
  "capitalEfficiency": {{
    "burnMultiple": "string assessment",
    "runwayEstimate": "string or null"
  }},
  "valuationAssessment": {{
    "askingValuation": "string or null",
    "comparable": "string - how this compares to similar companies",
    "assessment": "string - fair, aggressive, or conservative"
  }},
  "overallScore": number 0-100,
  "keyStrengths": ["array of financial strengths"],
  "keyRisks": ["array of financial risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze financials and unit economics for:

Company: {companyName}
Sector: {sector}
Stage: {stage}
Round Size: {roundSize} {roundCurrency}
Valuation: {valuation} ({valuationType})
Raise Type: {raiseType}
Lead Investor Secured: {leadSecured} {leadInvestorName}
Previous Funding: {hasPreviousFunding} - {previousFundingAmount} {previousFundingCurrency} from {previousInvestors} ({previousRoundType})
Description: {companyDescription}

Additional context:
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Assess unit economics, capital efficiency, and valuation reasonableness using available data.`),
]);

const productAnalysisPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Product Analyst Agent specializing in product and technology evaluation for investment memos.

Your role is to analyze:
1. Product Differentiation: Proprietary tech vs wrapper around existing APIs
2. Technology Readiness Level (TRL): Idea, MVP, or scaling
3. Competitive Moat: Network effects, data moats, switching costs, IP
4. UX/UI Quality: Based on website/product descriptions
5. Defensibility: How hard is this to replicate?

CRITICAL: You must generate TWO key text fields:

1. "productSummary" - A concise 2-3 sentence summary (50-80 words) that clearly explains:
   - What the product/service IS (not analysis, just description)
   - The core value proposition and what problem it solves
   - Who the target users are
   This should be written for someone who has never heard of the company. Example: "Acme is a cloud-based project management platform that helps remote teams coordinate work across time zones. The product combines task tracking, real-time collaboration, and automated workflows to reduce coordination overhead for distributed engineering teams."

2. "narrativeSummary" - A 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Product overview - What they've built, core technology, differentiation
- Paragraph 2: Technology depth - TRL assessment, proprietary vs commodity tech, innovation level
- Paragraph 3: Defensibility and moat - Network effects, data advantages, switching costs, IP
- Paragraph 4 (optional): Product roadmap implications - Scalability, technical debt, future development needs

**Writing Style:**
- Write as an experienced VC analyst presenting to investment committee
- Be specific about technology claims and their validity
- Be analytical, not promotional - acknowledge both strengths and concerns
- Use professional prose, not bullet points

IMPORTANT: Also extract concrete product information from the deck and website:
- Key product features mentioned (actual features, not marketing fluff)
- Technologies/frameworks mentioned (programming languages, databases, APIs, cloud services, etc.)
- Demo video URLs if found on website or mentioned in deck

Return a JSON object with:
{{
  "productSummary": "string - 2-3 sentence clear description of what the product/service does (50-80 words)",
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "productDifferentiation": {{
    "assessment": "string describing uniqueness",
    "score": number 0-100
  }},
  "technologyReadiness": {{
    "stage": "idea | mvp | scaling | mature",
    "assessment": "string"
  }},
  "competitiveMoat": {{
    "moatType": "string - network effects, data, IP, brand, switching costs, or none",
    "strength": number 0-100,
    "assessment": "string"
  }},
  "defensibility": {{
    "assessment": "string",
    "timeToReplicate": "string estimate"
  }},
  "extractedFeatures": [
    {{ "name": "feature name", "description": "brief description of the feature", "source": "deck | website" }}
  ],
  "extractedTechStack": [
    {{ "technology": "tech name", "category": "frontend | backend | database | infrastructure | ai_ml | other", "source": "deck | website" }}
  ],
  "extractedDemoVideos": [
    {{ "url": "video URL if found", "source": "youtube | vimeo | website", "title": "video title if known" }}
  ],
  "overallScore": number 0-100,
  "keyStrengths": ["array of product strengths"],
  "keyRisks": ["array of product risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze product and technology for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}
Stage: {stage}

Pitch Deck Context:
{deckContext}

=== SCRAPED WEBSITE CONTENT ===
{websiteContent}

{adminGuidance}

Use the actual website content above to evaluate product features, UX quality, technology claims, and competitive positioning. Assess product differentiation, technology readiness, and competitive moat.`),
]);

const businessModelPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Business Model Analyst Agent specializing in unit economics and revenue models.

Your role is to analyze:
1. Unit Economics: CAC (Customer Acquisition Cost) vs. LTV (Lifetime Value)
2. Margins: Gross margin profile (Software should be 70-80%; E-commerce lower)
3. Pricing Strategy: Is pricing aligned with market and value delivered?
4. Revenue Model: Subscription, transaction-based, freemium, enterprise
5. Payback Period: How long to recover customer acquisition costs

CRITICAL: You must generate a "narrativeSummary" field containing a 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Revenue model overview - How they make money, pricing strategy, recurring vs one-time
- Paragraph 2: Unit economics - CAC/LTV analysis, payback period, margin profile
- Paragraph 3: Scalability of model - Operating leverage, efficiency at scale, path to profitability
- Paragraph 4 (optional): Model risks and considerations - Concentration, pricing pressure, margin erosion

**Writing Style:**
- Write as an experienced VC analyst presenting to investment committee
- Use specific metrics and benchmarks where available
- Be analytical, not promotional - acknowledge both strengths and concerns
- Use professional prose, not bullet points

Return a JSON object with:
{{
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "unitEconomics": {{
    "estimatedCAC": "string or null",
    "estimatedLTV": "string or null",
    "ltvCacRatio": "string assessment",
    "paybackPeriod": "string assessment"
  }},
  "revenueModel": {{
    "type": "string - subscription, transaction, freemium, enterprise, hybrid",
    "recurringRevenue": boolean,
    "assessment": "string"
  }},
  "margins": {{
    "estimatedGrossMargin": "string percentage or null",
    "industryBenchmark": "string",
    "assessment": "string - healthy or concerning"
  }},
  "pricing": {{
    "strategy": "string",
    "competitorComparison": "string",
    "assessment": "string"
  }},
  "overallScore": number 0-100,
  "keyStrengths": ["array of business model strengths"],
  "keyRisks": ["array of business model risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze business model and unit economics for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}
Stage: {stage}

Additional context:
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Evaluate unit economics, revenue model, pricing strategy, and margin profile using website content.`),
]);

const gtmPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Go-To-Market Strategy Analyst Agent specializing in growth and distribution for investment memos.

Your role is to analyze:
1. Channel Strategy: SEO vs. Paid Ads vs. Direct Sales vs. Partnerships
2. Sales Cycle: Length and complexity of the sales process
3. Virality: Referral coefficients and organic growth potential
4. Customer Acquisition: Inbound vs outbound, content marketing effectiveness
5. Sales Motion: Product-led growth, sales-led, hybrid

CRITICAL: You must generate a "narrativeSummary" field containing a 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Go-to-market approach - Channel strategy, sales motion, target customer segments
- Paragraph 2: Growth mechanics - Virality potential, organic growth, paid acquisition efficiency
- Paragraph 3: Sales process - Cycle length, complexity, conversion funnel, customer journey
- Paragraph 4 (optional): GTM risks and scalability - Bottlenecks, channel dependencies, expansion challenges

**Writing Style:**
- Write as an experienced VC analyst presenting to investment committee
- Use specific examples from the company's actual GTM approach
- Be analytical, not promotional - acknowledge both strengths and concerns
- Use professional prose, not bullet points

Return a JSON object with:
{{
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "channelStrategy": {{
    "primaryChannels": ["array of main channels"],
    "channelMix": "string description",
    "assessment": "string"
  }},
  "salesMotion": {{
    "type": "product-led | sales-led | hybrid",
    "salesCycleLength": "string estimate",
    "complexity": "low | medium | high",
    "assessment": "string"
  }},
  "viralityPotential": {{
    "hasNetworkEffects": boolean,
    "referralMechanics": "string",
    "organicGrowthPotential": number 0-100
  }},
  "contentStrategy": {{
    "hasContentMarketing": boolean,
    "quality": "string assessment",
    "seoPresence": "string"
  }},
  "scalability": {{
    "assessment": "string",
    "bottlenecks": ["potential scaling challenges"]
  }},
  "overallScore": number 0-100,
  "keyStrengths": ["array of GTM strengths"],
  "keyRisks": ["array of GTM risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze go-to-market strategy for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}
Stage: {stage}

Additional context:
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Evaluate channel strategy, sales motion, virality potential, and scalability using website content.`),
]);

const competitiveAdvantagePrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Competitive Advantage Analyst Agent specializing in moat analysis and competitive landscape assessment.

Your role is to analyze:
1. Defensibility: Network effects, high switching costs, data moats, brand
2. Positioning: Blue ocean vs. Red ocean strategy
3. Competitor Analysis: Direct and indirect competitors, their strengths
4. Barriers to Entry: What prevents competition?
5. Sustainable Advantage: Will this moat strengthen or weaken over time?

CRITICAL: You must generate a "narrativeSummary" field containing a 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Market landscape and key competitors - who the main players are and the competitive dynamics
- Paragraph 2: How the company differentiates - specific advantages vs competitors and positioning strategy
- Paragraph 3: Moat assessment - defensibility, barriers to entry, and sustainability of advantages
- Paragraph 4 (optional): Key competitive risks and what to watch

Return a JSON object with:
{{
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "keyCompetitors": ["array of 3-5 most important competitor names"],
  "primaryDifferentiator": "One sentence describing the main competitive advantage",
  "biggestCompetitiveThreat": "One sentence describing the biggest competitive risk",
  "moatStrengthAssessment": "weak | moderate | strong | very_strong",
  "moatAnalysis": {{
    "primaryMoat": "string - network effects, data, IP, brand, switching costs, economies of scale, or none",
    "moatStrength": number 0-100,
    "sustainability": "string assessment",
    "timeToReplicate": "string estimate"
  }},
  "positioning": {{
    "strategy": "blue ocean | red ocean | niche",
    "differentiation": "string",
    "uniqueValueProp": "string"
  }},
  "competitorLandscape": {{
    "directCompetitors": ["array of direct competitors"],
    "indirectCompetitors": ["array of indirect competitors"],
    "competitiveAdvantages": ["what startup does better"],
    "competitiveDisadvantages": ["where competitors are stronger"]
  }},
  "barriersToEntry": {{
    "technical": "string assessment",
    "regulatory": "string assessment",
    "capital": "string assessment",
    "network": "string assessment"
  }},
  "overallScore": number 0-100,
  "keyStrengths": ["array of competitive strengths"],
  "keyRisks": ["array of competitive risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze competitive advantage and moat for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}

Additional context:
{deckContext}

=== COMPETITOR RESEARCH ===
{competitorResearch}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Use the competitor research above to identify direct and indirect competitors, assess moat strength and sustainability, and evaluate competitive positioning. Write a compelling narrative that captures the competitive dynamics and the company's positioning.`),
]);

// CompetitiveLandscapeSynthesis is now merged into CompetitiveAdvantageAgent for cleaner architecture

const legalRegulatoryPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Legal & Regulatory Analyst Agent specializing in compliance and IP assessment for investment memos.

Your role is to analyze:
1. Compliance: GDPR, HIPAA, Fintech licenses, industry regulations
2. IP Ownership: Patents, trademarks, trade secrets
3. Regulatory Risk: Upcoming regulations that could impact the business
4. Legal Structure: Corporate structure, jurisdiction considerations
5. Cap Table Concerns: Potential issues with equity distribution

CRITICAL: You must generate a "narrativeSummary" field containing a 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Regulatory landscape - Key regulations, compliance requirements, licensing needs
- Paragraph 2: IP position - Patents, trademarks, trade secrets, defensibility
- Paragraph 3: Regulatory trajectory - Upcoming regulations, policy shifts, impact on business
- Paragraph 4 (optional): Legal risks - Structural concerns, jurisdictional issues, cap table problems

**Writing Style:**
- Write as an experienced VC analyst presenting to investment committee
- Be specific about regulatory requirements and IP status
- Be analytical, not promotional - acknowledge both strengths and concerns
- Use professional prose, not bullet points

Return a JSON object with:
{{
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "complianceAssessment": {{
    "applicableRegulations": ["array of relevant regulations"],
    "complianceStatus": "string assessment",
    "riskLevel": "low | medium | high",
    "requiredLicenses": ["array of required licenses"]
  }},
  "ipAnalysis": {{
    "hasPatents": boolean,
    "hasTrademarks": boolean,
    "ipStrength": "string assessment",
    "potentialIpRisks": ["array of IP risks"]
  }},
  "regulatoryOutlook": {{
    "upcomingRegulations": ["relevant upcoming regulations"],
    "impactAssessment": "string",
    "riskLevel": "low | medium | high"
  }},
  "legalStructure": {{
    "jurisdiction": "string or null",
    "concerns": ["any structural concerns"]
  }},
  "capTableRisks": {{
    "concerns": ["any cap table concerns identified"],
    "assessment": "string"
  }},
  "overallScore": number 0-100,
  "keyStrengths": ["array of legal/regulatory strengths"],
  "keyRisks": ["array of legal/regulatory risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze legal, regulatory, and IP aspects for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}
Location: {location}

Additional context:
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Evaluate compliance requirements, IP position, and regulatory risks based on available data.`),
]);

const dealTermsPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Deal Terms & Valuation Analyst Agent specializing in investment structuring for investment memos.

Your role is to analyze:
1. Valuation: Pre-money valuation relative to stage and traction
2. Deal Structure: SAFE vs. Convertible Note vs. Priced Round
3. Dilution Impact: Option pool and pro-rata rights considerations
4. Comparable Analysis: How valuation compares to similar companies
5. Terms Assessment: Are the terms founder-friendly or investor-friendly?

CRITICAL: You must generate a "narrativeSummary" field containing a 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Deal structure - Round size, instrument type, key terms, use of funds
- Paragraph 2: Valuation assessment - Asking price, comparables, multiples, reasonableness
- Paragraph 3: Dilution and protections - Option pool, pro-rata rights, investor protections
- Paragraph 4 (optional): Deal risks - Concerning terms, structural issues, red flags

**Writing Style:**
- Write as an experienced VC analyst presenting to investment committee
- Use specific multiples and comparable deals where available
- Be analytical, not promotional - acknowledge both strengths and concerns
- Use professional prose, not bullet points

Return a JSON object with:
{{
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "valuationAnalysis": {{
    "askingValuation": "string or null",
    "stageAppropriate": boolean,
    "revenueMultiple": "string or null",
    "comparableValuations": "string comparison to similar companies",
    "assessment": "fair | aggressive | conservative"
  }},
  "dealStructure": {{
    "instrumentType": "SAFE | convertible note | priced round | unknown",
    "keyTerms": ["notable terms identified"],
    "assessment": "string"
  }},
  "dilutionAnalysis": {{
    "optionPoolSize": "string or null",
    "proRataRights": "string assessment",
    "dilutionImpact": "string"
  }},
  "roundContext": {{
    "roundSize": "string or null",
    "useOfFunds": ["how capital will be deployed"],
    "runway": "string estimate"
  }},
  "investorProtections": {{
    "standard": boolean,
    "concerns": ["any concerning terms"]
  }},
  "overallScore": number 0-100,
  "keyStrengths": ["array of deal term strengths"],
  "keyRisks": ["array of deal term risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze deal terms and valuation for:

Company: {companyName}
Sector: {sector}
Stage: {stage}
Round Size: {roundSize} {roundCurrency}
Valuation: {valuation} ({valuationType})
Raise Type: {raiseType}
Lead Investor Secured: {leadSecured} {leadInvestorName}
Previous Funding: {hasPreviousFunding} - {previousFundingAmount} {previousFundingCurrency} from {previousInvestors} ({previousRoundType})
Description: {companyDescription}

Additional context:
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Evaluate valuation appropriateness, deal structure, and term fairness. Use news data for comparable deals.`),
]);

const exitPotentialPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Exit Potential Analyst Agent specializing in exit strategy assessment for investment memos.

Your role is to analyze:
1. M&A Activity: Who buys companies in this space? Recent acquisitions
2. IPO Feasibility: Is the TAM large enough for a public listing?
3. Strategic Acquirers: Potential buyers and their "build vs buy" strategies
4. Exit Timeline: Realistic timeframe for liquidity
5. Exit Multiples: What multiples are typical for this sector?

CRITICAL: You must generate a "narrativeSummary" field containing a 3-4 paragraph VC memo-style narrative (250-350 words total).

**Narrative Structure:**
- Paragraph 1: Exit landscape - M&A activity in the sector, recent acquisitions, active buyers
- Paragraph 2: Strategic acquirers - Who would buy this company and why, strategic fit
- Paragraph 3: IPO feasibility - Market size, path to public offering, timeline considerations
- Paragraph 4 (optional): Exit multiples and timeline - Expected returns, valuation benchmarks, liquidity timeline

**Writing Style:**
- Write as an experienced VC analyst presenting to investment committee
- Reference specific acquirers and comparable exits where available
- Be analytical, not promotional - acknowledge both opportunities and concerns
- Use professional prose, not bullet points

Return a JSON object with:
{{
  "narrativeSummary": "string - 3-4 paragraph VC memo narrative (250-350 words)",
  "maActivity": {{
    "recentAcquisitions": ["notable acquisitions in the space"],
    "activeAcquirers": ["companies actively acquiring"],
    "averageMultiples": "string or null",
    "activityLevel": "low | medium | high"
  }},
  "ipoFeasibility": {{
    "tamSufficient": boolean,
    "pathToIPO": "string assessment",
    "timelineEstimate": "string",
    "feasibility": "low | medium | high"
  }},
  "strategicAcquirers": {{
    "potentialBuyers": ["top 5 potential acquirers"],
    "strategicFit": "string explanation",
    "likelihood": "string assessment"
  }},
  "exitTimeline": {{
    "estimatedYears": "string range",
    "factors": ["key factors affecting timeline"]
  }},
  "exitMultiples": {{
    "revenueMultiple": "string typical range",
    "ebitdaMultiple": "string typical range or N/A",
    "comparables": "string"
  }},
  "overallScore": number 0-100,
  "keyStrengths": ["array of exit potential strengths"],
  "keyRisks": ["array of exit potential risks"]
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Analyze exit potential for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}
Stage: {stage}
Location: {location}

Additional context:
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Evaluate M&A landscape, IPO feasibility, potential acquirers, and exit timeline using market research data.`),
]);

const synthesisPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are a VC Investment Committee Synthesis Agent generating a comprehensive Executive Summary.

Your role is to synthesize all 11 sub-agent narratives into a final investment recommendation with a polished Executive Summary.

NOTE: The overall weighted score will be computed separately using configurable stage-specific weights. 
Focus on qualitative synthesis and section score normalization only.

CRITICAL: Generate an "executiveSummary" field containing a 5-6 paragraph comprehensive executive summary (400-500 words total).

**Executive Summary Structure:**
- Paragraph 1: Company overview - What they do, stage, sector, and investment opportunity thesis
- Paragraph 2: Team and execution capability - Founder-market fit, team strengths, ability to execute
- Paragraph 3: Market and traction - Market opportunity, current traction, growth trajectory
- Paragraph 4: Business model and competitive position - How they make money, defensibility, moat
- Paragraph 5: Deal assessment - Valuation, terms, capital efficiency, use of funds
- Paragraph 6: Investment recommendation - Final verdict with clear rationale and key risks

**Writing Style:**
- Write as an experienced VC partner presenting to investment committee
- This is the FIRST thing readers will see - make it compelling and comprehensive
- Synthesize insights from ALL 11 section narratives into a cohesive story
- Be balanced - acknowledge both opportunities and risks
- Use professional prose, not bullet points

Return a JSON object with:
{{
  "executiveSummary": "string - 5-6 paragraph comprehensive executive summary (400-500 words)",
  "percentileRank": number 0-100 (estimated percentile among startups),
  "sectionScores": {{
    "team": number,
    "market": number,
    "product": number,
    "traction": number,
    "businessModel": number,
    "gtm": number,
    "financials": number,
    "competitiveAdvantage": number,
    "legal": number,
    "dealTerms": number,
    "exitPotential": number
  }},
  "keyStrengths": ["top 5-7 strengths across all dimensions"],
  "keyRisks": ["top 5-7 risks across all dimensions"],
  "recommendations": ["5-7 actionable recommendations for improvement"],
  "investorMemo": {{
    "dealHighlights": ["5 most important bullet points about this deal - the 2-minute pitch summary covering what makes this opportunity compelling, key metrics, team, market, and differentiation"],
    "summary": "2-3 sentence overall deal thesis",
    "keyDueDiligenceAreas": ["areas requiring further investigation"]
  }},
  "founderReport": {{
    "summary": "3-4 paragraph summary for founders",
    "strengths": ["what's working well across all dimensions"],
    "improvements": ["prioritized areas for improvement"],
    "milestones": ["suggested milestones for next fundraise"]
  }}
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Synthesize the following 11 sub-agent analyses and narratives into a final evaluation with comprehensive Executive Summary:

Company: {companyName}
Stage: {stage}
Sector: {sector}

=== SECTION NARRATIVES ===
The following narratives have been generated by specialized agents. Use these to create a cohesive Executive Summary.

1. TEAM ANALYSIS:
{teamAnalysis}

2. MARKET ANALYSIS:
{marketAnalysis}

3. PRODUCT/TECHNOLOGY ANALYSIS:
{productAnalysis}

4. TRACTION ANALYSIS:
{tractionAnalysis}

5. BUSINESS MODEL & UNIT ECONOMICS ANALYSIS:
{businessModelAnalysis}

6. GO-TO-MARKET ANALYSIS:
{gtmAnalysis}

7. FINANCIALS & CAPITAL EFFICIENCY ANALYSIS:
{financialsAnalysis}

8. COMPETITIVE ADVANTAGE/MOAT ANALYSIS:
{competitiveAdvantageAnalysis}

9. LEGAL, REGULATORY & IP ANALYSIS:
{legalAnalysis}

10. DEAL TERMS & VALUATION ANALYSIS:
{dealTermsAnalysis}

11. EXIT POTENTIAL ANALYSIS:
{exitPotentialAnalysis}

Generate a comprehensive Executive Summary that synthesizes all 11 section narratives into a cohesive investment thesis. The Executive Summary should be the first thing readers see and should capture the essence of the entire evaluation.`),
]);

const teamExtractionPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are an expert at extracting LEADERSHIP TEAM member information from pitch deck content.

Analyze the provided text and identify the TOP 10 most impactful leadership team members.

INCLUDE (in order of priority):
1. Founders and Co-founders
2. C-suite executives (CEO, CTO, CFO, COO, CMO, CRO, CPO, etc.)
3. VPs (VP of Engineering, VP of Sales, VP of Product, etc.)
4. Directors (Director of Engineering, Director of Marketing, etc.)

LIMIT: Return only the TOP 10 most senior/impactful people. Prioritize founders and C-level first.

EXCLUDE from extraction:
- Advisors, board members, investors, mentors
- Regular employees below Director level
- Watermark text (emails like help@gamma.app, made with gamma, etc.)
- Generic template text or placeholder content
- Anyone listed under "Advisors", "Advisory Board", "Board of Directors", "Investors" sections

For each person found, extract:
- name: Full name (must be a real person name, not email or website)
- role: Their title/position (CEO, CTO, COO, Founder, Co-founder, VP, Director, etc.)
- linkedinUrl: If a LinkedIn URL is mentioned, include it. Otherwise leave empty.
- memberType: "team" for leadership team or "advisor" if they're an advisor/board member

Important:
- Look for "Team" slides, "About Us" sections, "Leadership" sections
- Focus on founders, C-level, VPs, and Directors
- LIMIT to TOP 10 most impactful people
- IGNORE emails, URLs, or watermarks that look like names
- Do NOT include advisors or investors in the team list
- Do NOT make up information - only extract what's actually in the content

Return JSON format:
{{
  "extractedMembers": [
    {{"name": "Full Name", "role": "Title/Position", "linkedinUrl": "URL if found or empty string", "memberType": "team"}}
  ],
  "teamSlideFound": true/false,
  "confidence": "high/medium/low"
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Company: {companyName}

Pitch Deck Content:
{deckContent}

Extract ONLY core team members (founders, executives). Do NOT include advisors, investors, or watermark text.`),
]);

// Patterns to filter out watermarks, emails, and non-person content
const WATERMARK_PATTERNS = [
  // Presentation/deck creation tools
  /gamma\.app/i,
  /canva\.com/i,
  /canva/i,
  /pitch\.com/i,
  /beautiful\.ai/i,
  /prezi\.com/i,
  /prezi/i,
  /slidebean/i,
  /docsend/i,
  /doc\.send/i,
  /pitchbook/i,
  /slideshare/i,
  /google slides/i,
  /powerpoint/i,
  /microsoft/i,
  /dropbox/i,
  /notion\.so/i,
  /figma\.com/i,
  /figma/i,
  /visme/i,
  /piktochart/i,
  /venngage/i,
  /lucidpress/i,
  /zoho/i,
  /keynote/i,
  /slides\.com/i,
  /genially/i,
  /powtoon/i,
  /haiku deck/i,
  /emaze/i,
  /swipe\.to/i,
  /ludus\.one/i,
  /pitch deck/i,
  /deckrobot/i,
  /storydoc/i,
  /tome\.app/i,
  /tome/i,
  // Generic email patterns that are not personal
  /help@/i,
  /support@/i,
  /info@/i,
  /contact@/i,
  /sales@/i,
  /hello@/i,
  /team@/i,
  /admin@/i,
  /noreply@/i,
  /no-reply@/i,
  /notifications@/i,
  /billing@/i,
  /legal@/i,
  /privacy@/i,
  /security@/i,
  /feedback@/i,
  /careers@/i,
  /jobs@/i,
  /hr@/i,
  /press@/i,
  /media@/i,
  /marketing@/i,
  /partnerships@/i,
  // Watermark phrases
  /made with/i,
  /created with/i,
  /powered by/i,
  /built with/i,
  /designed with/i,
  /presented by/i,
  /confidential/i,
  /proprietary/i,
  /all rights reserved/i,
  /copyright/i,
  /©/i,
  // Personal email domains (likely not team members)
  /@gmail\.com/i,
  /@yahoo\.com/i,
  /@hotmail\.com/i,
  /@outlook\.com/i,
  /@icloud\.com/i,
  /@aol\.com/i,
  /@live\.com/i,
  /@msn\.com/i,
  /@protonmail\.com/i,
  /@proton\.me/i,
  // Domain-only entries
  /\.com$/i,
  /\.io$/i,
  /\.ai$/i,
  /\.co$/i,
  /\.org$/i,
  /\.net$/i,
  // URLs
  /^https?:/i,
  /^www\./i,
];

// Email domains that are watermarks/tool providers (not company team members)
const WATERMARK_EMAIL_DOMAINS = [
  'docsend.com',
  'gamma.app',
  'canva.com',
  'pitch.com',
  'beautiful.ai',
  'prezi.com',
  'slidebean.com',
  'pitchbook.com',
  'slideshare.net',
  'figma.com',
  'notion.so',
  'dropbox.com',
  'google.com',
  'microsoft.com',
  'apple.com',
  'zoho.com',
  'slides.com',
  'tome.app',
  'visme.co',
  'piktochart.com',
  'lucidpress.com',
  'genial.ly',
  'powtoon.com',
  'emaze.com',
  'storydoc.com',
];

function isWatermarkEmail(email: string): boolean {
  if (!email) return false;
  const emailLower = email.toLowerCase().trim();
  
  // Check if email is from a watermark domain
  for (const domain of WATERMARK_EMAIL_DOMAINS) {
    if (emailLower.endsWith('@' + domain)) {
      console.log(`[team-extraction] Filtering out watermark email: "${email}"`);
      return true;
    }
  }
  
  // Check generic email prefixes that are not personal
  const genericPrefixes = [
    'help', 'support', 'info', 'contact', 'sales', 'hello', 'team',
    'admin', 'noreply', 'no-reply', 'notifications', 'billing', 'legal',
    'privacy', 'security', 'feedback', 'careers', 'jobs', 'hr', 'press',
    'media', 'marketing', 'partnerships', 'office', 'general', 'mail'
  ];
  
  const atIndex = emailLower.indexOf('@');
  if (atIndex > 0) {
    const prefix = emailLower.substring(0, atIndex);
    if (genericPrefixes.includes(prefix)) {
      console.log(`[team-extraction] Filtering out generic email: "${email}"`);
      return true;
    }
  }
  
  return false;
}

// Advisor role patterns to identify non-core team
const ADVISOR_ROLE_PATTERNS = [
  /^advisor$/i,
  /^advisory board/i,
  /^board member$/i,
  /^board director$/i,
  /^investor$/i,
  /^mentor$/i,
  /^consultant$/i,
  /^venture partner/i,
  /^angel investor/i,
];

// Core team role patterns - these override advisor detection
const CORE_TEAM_PATTERNS = [
  /founder/i,
  /co-founder/i,
  /cofounder/i,
  /ceo/i,
  /cto/i,
  /coo/i,
  /cfo/i,
  /chief/i,
  /president/i,
  /head of/i,
  /vp of/i,
  /vice president/i,
  /director of/i,
  /lead/i,
];

function isCoreTeamRole(role: string): boolean {
  if (!role) return false;
  for (const pattern of CORE_TEAM_PATTERNS) {
    if (pattern.test(role)) {
      return true;
    }
  }
  return false;
}

function isWatermarkOrInvalid(name: string): boolean {
  if (!name || name.length < 2) return true;
  if (name.length > 50) return true; // Too long to be a real name
  
  // Check if name looks like an email address
  if (name.includes('@')) {
    console.log(`[team-extraction] Filtering out email as name: "${name}"`);
    return true;
  }
  
  // Check if name looks like a URL
  if (name.includes('://') || name.startsWith('www.')) {
    console.log(`[team-extraction] Filtering out URL as name: "${name}"`);
    return true;
  }
  
  // Check against watermark patterns
  for (const pattern of WATERMARK_PATTERNS) {
    if (pattern.test(name)) {
      console.log(`[team-extraction] Filtering out watermark/invalid: "${name}"`);
      return true;
    }
  }
  
  // Check against watermark email domains in case name contains domain
  for (const domain of WATERMARK_EMAIL_DOMAINS) {
    if (name.toLowerCase().includes(domain)) {
      console.log(`[team-extraction] Filtering out watermark domain in name: "${name}"`);
      return true;
    }
  }
  
  // Must contain at least one space (first + last name) or be a single known name
  if (!name.includes(" ") && name.length < 15) {
    // Single word names are suspicious unless very short
    return false; // Allow single names for now
  }
  
  return false;
}

function isAdvisorRole(role: string): boolean {
  if (!role) return false;
  
  // If they have a core team role (founder, CEO, etc.), they're NOT an advisor
  // even if they also have "Board" in their title
  if (isCoreTeamRole(role)) {
    return false;
  }
  
  // Check if their ONLY role is advisory
  for (const pattern of ADVISOR_ROLE_PATTERNS) {
    if (pattern.test(role)) {
      return true;
    }
  }
  return false;
}

async function extractTeamFromDeck(companyName: string, deckContent: string): Promise<TeamMemberInput[]> {
  if (!deckContent || deckContent.length < 50) {
    console.log("[team-extraction] No substantial deck content to extract from");
    return [];
  }

  try {
    console.log("[team-extraction] Extracting team members from deck content...");
    
    const extractionChain = RunnableSequence.from([
      teamExtractionPrompt,
      getJsonModel(),
      new JsonOutputParser(),
    ]);

    const result = await extractionChain.invoke({
      companyName,
      deckContent: deckContent.slice(0, 15000),
    });

    const extracted = (result as any).extractedMembers || [];
    console.log(`[team-extraction] Found ${extracted.length} potential team members in deck, confidence: ${(result as any).confidence}`);
    
    // Filter and categorize members
    const filtered = extracted
      .map((m: any) => ({
        name: (m.name || "").trim(),
        role: (m.role || "").trim(),
        linkedinUrl: m.linkedinUrl || "",
        memberType: m.memberType || (isAdvisorRole(m.role) ? "advisor" : "team"),
      }))
      .filter((m: any) => {
        // Filter out watermarks and invalid entries
        if (isWatermarkOrInvalid(m.name)) return false;
        // Filter out advisors - we only want core team
        if (m.memberType === "advisor" || isAdvisorRole(m.role)) {
          console.log(`[team-extraction] Excluding advisor: ${m.name} (${m.role})`);
          return false;
        }
        return m.name.length > 0;
      });
    
    console.log(`[team-extraction] After filtering: ${filtered.length} core team members`);
    return filtered;
  } catch (error) {
    console.error("[team-extraction] Failed to extract team from deck:", error);
    return [];
  }
}

function mergeTeamMembers(manualMembers: TeamMemberInput[], deckMembers: TeamMemberInput[]): TeamMemberInput[] {
  // Filter out advisors and watermarks from manual members too
  const filteredManual = manualMembers.filter(m => {
    if (isWatermarkOrInvalid(m.name)) {
      console.log(`[team-merge] Filtering out invalid manual member: ${m.name}`);
      return false;
    }
    if (isAdvisorRole(m.role)) {
      console.log(`[team-merge] Excluding advisor from manual members: ${m.name} (${m.role})`);
      return false;
    }
    return true;
  });
  
  const merged = [...filteredManual];
  const existingNames = new Set(filteredManual.map(m => m.name.toLowerCase().trim()));

  for (const deckMember of deckMembers) {
    const normalizedName = deckMember.name.toLowerCase().trim();
    const nameParts = normalizedName.split(" ");
    
    const alreadyExists = existingNames.has(normalizedName) || 
      Array.from(existingNames).some(existing => {
        const existingParts = existing.split(" ");
        return nameParts.some(part => existingParts.some(ep => 
          part.length > 2 && ep.length > 2 && (part === ep || part.includes(ep) || ep.includes(part))
        ));
      });

    if (!alreadyExists) {
      console.log(`[team-merge] Adding deck-discovered member: ${deckMember.name} (${deckMember.role})`);
      merged.push(deckMember);
      existingNames.add(normalizedName);
    }
  }

  return merged;
}

async function fetchTeamLinkedInData(
  teamMembers: TeamMemberInput[],
  companyName?: string,
  website?: string
): Promise<{ formattedData: string; enrichedMembers: TeamMemberInput[] }> {
  if (!teamMembers || teamMembers.length === 0) {
    return { formattedData: "No team members provided.", enrichedMembers: [] };
  }

  if (!isUnipileConfigured()) {
    console.log("[team-agent] Unipile not configured, using limited team data");
    return {
      formattedData: teamMembers.map(m => 
        `- ${m.name} (${m.role}): LinkedIn profile data not accessible.`
      ).join("\n"),
      enrichedMembers: teamMembers
    };
  }

  const results: string[] = [];
  const enrichedMembers: TeamMemberInput[] = [];
  
  for (const member of teamMembers) {
    let profileData: LinkedInProfileData | null = null;
    let linkedinUrl = member.linkedinUrl;
    
    if (member.linkedinUrl) {
      console.log(`[team-agent] Fetching LinkedIn data for ${member.name} via URL...`);
      profileData = await fetchLinkedInProfile(member.linkedinUrl);
    } else {
      console.log(`[team-agent] Searching LinkedIn for ${member.name} by name...`);
      profileData = await searchLinkedInByName(member.name, companyName, website);
    }
    
    if (profileData) {
      // Map LinkedIn data to the UI-expected format
      enrichedMembers.push({
        ...member,
        linkedinUrl: linkedinUrl || `https://linkedin.com/in/${profileData.name.toLowerCase().replace(/\s+/g, '-')}`,
        headline: profileData.headline,
        summary: profileData.summary,
        location: profileData.location,
        profilePictureUrl: profileData.profilePictureUrl,
        skills: profileData.skills,
        experience: profileData.experienceDetails.map(exp => ({
          title: exp.position,
          company: exp.company,
          location: exp.location,
          startDate: exp.startDate,
          endDate: exp.endDate,
          description: exp.description,
          isCurrent: exp.isCurrent,
        })),
        education: profileData.educationDetails,
      });
      
      results.push(`
## ${member.name} - ${member.role}
- Full Name: ${profileData.name}
- Headline: ${profileData.headline || "Not provided"}
- Location: ${profileData.location || "Not provided"}
- Current Position: ${profileData.currentPosition || "Not specified"} at ${profileData.currentCompany || "Unknown"}
- Years of Experience: ${profileData.yearsExperience || "Unknown"}
- Summary: ${profileData.summary || "Not provided"}
- Skills: ${profileData.skills.slice(0, 10).join(", ") || "None listed"}
- Education: ${profileData.education.join("; ") || "None listed"}
- Previous Companies: ${profileData.previousCompanies.slice(0, 5).join(", ") || "None listed"}
- Experience Details:
${profileData.experienceDetails.slice(0, 5).map(exp => 
  `  * ${exp.position} at ${exp.company} (${exp.duration})`
).join("\n")}
`);
    } else {
      enrichedMembers.push(member);
      results.push(`- ${member.name} (${member.role}): LinkedIn profile could not be retrieved.`);
    }
  }

  return { formattedData: results.join("\n"), enrichedMembers };
}

class TeamAgent {
  private scoringChain: RunnableSequence | null = null;
  private synthesisChain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getScoringChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("team");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("team");
      if (chatPrompt) {
        console.log("[TeamAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.scoringChain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.scoringChain;
      }
    }
    
    if (!this.scoringChain) {
      this.scoringChain = RunnableSequence.from([teamAnalysisPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.scoringChain;
  }

  private async getSynthesisChain() {
    if (!this.synthesisChain) {
      this.synthesisChain = RunnableSequence.from([teamMemoSynthesisPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.synthesisChain;
  }

  async analyze(context: StartupContext) {
    console.log("[TeamAgent] Starting team analysis...");
    
    let allTeamMembers = context.teamMembers || [];
    
    if (context.deckContent && context.deckContent.length > 50) {
      console.log("[TeamAgent] Extracting additional team members from deck content...");
      const deckExtractedMembers = await extractTeamFromDeck(context.name, context.deckContent);
      
      if (deckExtractedMembers.length > 0) {
        const originalCount = allTeamMembers.length;
        allTeamMembers = mergeTeamMembers(allTeamMembers, deckExtractedMembers);
        console.log(`[TeamAgent] Team members: ${originalCount} manual + ${deckExtractedMembers.length} deck-extracted = ${allTeamMembers.length} total (after dedup)`);
      }
    }
    
    // Check for cached LinkedIn data from previous evaluations to avoid redundant API calls
    let teamMembersData: string;
    let enrichedMembers: any[];
    
    if (context.cachedTeamMemberEvaluations && context.cachedTeamMemberEvaluations.length > 0) {
      console.log("[TeamAgent] Using cached LinkedIn data from previous evaluation (skipping Unipile API calls)");
      
      // Reconstruct enrichedMembers from cached data
      // Handle BOTH new format (linkedinData object) AND legacy format (bio, imageUrl fields)
      enrichedMembers = context.cachedTeamMemberEvaluations.map((cached: any) => ({
        name: cached.name || "Unknown",
        role: cached.role || "Team Member",
        linkedinUrl: cached.linkedinUrl,
        headline: cached.linkedinData?.headline || cached.headline || "",
        summary: cached.linkedinData?.summary || cached.summary || cached.bio || "",
        profilePictureUrl: cached.linkedinData?.profilePictureUrl || cached.profilePictureUrl || cached.imageUrl || "",
        location: cached.linkedinData?.location || cached.location || "",
        experience: cached.linkedinData?.experienceDetails || cached.linkedinData?.experience || cached.experience || [],
        education: cached.linkedinData?.educationDetails || cached.linkedinData?.education || cached.education || [],
        skills: cached.linkedinData?.skills || cached.skills || [],
        fmfScore: cached.fmfScore,
        relevantExperience: cached.relevantExperience,
        background: cached.background,
      }));
      
      // Format cached data for the scoring prompt
      teamMembersData = enrichedMembers.map((m: any) => {
        let info = `**${m.name}** (${m.role})\n`;
        if (m.headline) info += `Headline: ${m.headline}\n`;
        if (m.summary) info += `Summary: ${m.summary}\n`;
        if (m.experience && m.experience.length > 0) {
          info += `Experience: ${m.experience.slice(0, 5).map((e: any) => `${e.title || 'Role'} at ${e.company || 'Company'}`).join("; ")}\n`;
        }
        if (m.education && m.education.length > 0) {
          info += `Education: ${m.education.slice(0, 3).map((e: any) => `${e.degree || e.field || 'Degree'} from ${e.school || 'Institution'}`).join("; ")}\n`;
        }
        if (m.skills && m.skills.length > 0) {
          info += `Skills: ${m.skills.slice(0, 10).join(", ")}\n`;
        }
        return info;
      }).join("\n---\n");
    } else {
      // No cached data, fetch fresh LinkedIn data
      const result = await fetchTeamLinkedInData(allTeamMembers, context.name, context.website);
      teamMembersData = result.formattedData;
      enrichedMembers = result.enrichedMembers;
    }
    
    // Prepare deck context - extract key business info for team evaluation
    let deckContext = "No pitch deck provided.";
    if (context.deckContent && context.deckContent.length > 100) {
      deckContext = context.deckContent.slice(0, 4000);
      if (context.deckContent.length > 4000) {
        deckContext += "\n\n[Deck content truncated for team analysis context]";
      }
    }
    
    // Prepare admin guidance if provided
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";

    // Format deep research team data (patents, exits, accomplishments)
    let deepResearchTeamContext = "";
    if (context.teamDeepResearch && context.teamDeepResearch.length > 0) {
      console.log(`[TeamAgent] Incorporating deep research for ${context.teamDeepResearch.length} team members`);
      deepResearchTeamContext = "\n\n=== DEEP RESEARCH FINDINGS ===\n";
      for (const member of context.teamDeepResearch) {
        deepResearchTeamContext += `\n**${member.name}** (${member.role})\n`;
        deepResearchTeamContext += `Confidence Score: ${member.confidenceScore}/100\n`;
        if (member.pastAccomplishments?.length) {
          deepResearchTeamContext += `Notable Accomplishments: ${member.pastAccomplishments.join('; ')}\n`;
        }
        if (member.patents?.length) {
          deepResearchTeamContext += `Patents: ${member.patents.map(p => `${p.title} (${p.year})`).join('; ')}\n`;
        }
        if (member.previousExits?.length) {
          deepResearchTeamContext += `Previous Exits: ${member.previousExits.map(e => `${e.company} - ${e.type} (${e.year}, ${e.value || 'value unknown'})`).join('; ')}\n`;
        }
        if (member.notableAchievements?.length) {
          deepResearchTeamContext += `Achievements: ${member.notableAchievements.join('; ')}\n`;
        }
        if (member.educationHighlights?.length) {
          deepResearchTeamContext += `Education: ${member.educationHighlights.join('; ')}\n`;
        }
        if (member.sources?.length) {
          deepResearchTeamContext += `Sources: ${member.sources.slice(0, 3).join(', ')}\n`;
        }
      }
    }

    // Step 1: Run the scoring chain
    console.log("[TeamAgent] Running team scoring analysis...");
    const scoringChain = await this.getScoringChain();
    const scoringResult = await scoringChain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      stage: context.stage,
      teamMembersData: teamMembersData + deepResearchTeamContext,
      deckContext,
      adminGuidance,
    }) as any;
    
    console.log("[TeamAgent] Scoring complete, generating memo narrative...");
    
    // Step 2: Prepare data for synthesis
    const founderDetails = (scoringResult.members || scoringResult.founders || []).map((f: any) => 
      `**${f.name}** (${f.role})\n` +
      `Background: ${f.background}\n` +
      `Relevant Experience: ${f.relevantExperience}\n` +
      `Track Record: ${f.trackRecord}\n` +
      `Founder-Market Fit: ${f.founderMarketFit}/100 - ${f.fmfJustification}`
    ).join("\n\n");

    const teamComposition = scoringResult.teamComposition ? 
      `Business Leader: ${scoringResult.teamComposition.hasBusinessLeader ? "Yes" : "No"}\n` +
      `Technical Leader: ${scoringResult.teamComposition.hasTechnicalLeader ? "Yes" : "No"}\n` +
      `Industry Expert: ${scoringResult.teamComposition.hasIndustryExpert ? "Yes" : "No"}\n` +
      `Team Balance: ${scoringResult.teamComposition.teamBalance}\n` +
      `Gaps Identified: ${(scoringResult.teamComposition.gapsIdentified || []).join(", ")}\n` +
      `Stage Appropriate: ${scoringResult.teamComposition.stageAppropriate ? "Yes" : "No"}`
      : "No team composition data available";

    const cofounderDynamics = scoringResult.cofounderDynamics ?
      `Worked Together Before: ${scoringResult.cofounderDynamics.workedTogetherBefore ?? "Unknown"}\n` +
      `Complementary Skills: ${scoringResult.cofounderDynamics.complementarySkills ? "Yes" : "No"}\n` +
      `Potential Conflicts: ${(scoringResult.cofounderDynamics.potentialConflicts || []).join(", ") || "None identified"}`
      : "No co-founder dynamics data available";

    const linkedinData = enrichedMembers.map((m: any) => {
      let info = `**${m.name}** (${m.role})\n`;
      if (m.headline) info += `Headline: ${m.headline}\n`;
      if (m.experience && m.experience.length > 0) {
        info += `Experience: ${m.experience.slice(0, 3).map((e: any) => `${e.title} at ${e.company}`).join("; ")}\n`;
      }
      if (m.education && m.education.length > 0) {
        info += `Education: ${m.education.slice(0, 2).map((e: any) => `${e.degree || e.field || "Degree"} from ${e.school}`).join("; ")}\n`;
      }
      return info;
    }).join("\n");

    // Step 3: Run the synthesis chain
    const synthesisChain = await this.getSynthesisChain();
    const synthesisResult = await synthesisChain.invoke({
      companyName: context.name,
      sector: context.sector,
      stage: context.stage,
      companyDescription: context.description || "No description provided",
      overallScore: scoringResult.overallScore || 0,
      fmfScore: scoringResult.scoreBreakdown?.founderMarketFitScore || scoringResult.founderMarketFit || 0,
      trackRecordScore: scoringResult.scoreBreakdown?.trackRecordScore || 0,
      compositionScore: scoringResult.scoreBreakdown?.teamCompositionScore || 0,
      executionScore: scoringResult.scoreBreakdown?.executionCapabilityScore || 0,
      founderDetails: founderDetails || "No founder details available",
      teamComposition,
      cofounderDynamics,
      linkedinData: linkedinData || "No LinkedIn data available",
      keyStrengths: (scoringResult.keyStrengths || []).join("\n- "),
      keyRisks: (scoringResult.keyRisks || []).join("\n- "),
      hiringRecommendations: (scoringResult.hiringRecommendations || []).join("\n- "),
    }) as any;
    
    console.log("[TeamAgent] Memo synthesis complete");
    
    // Combine scoring results with synthesis
    return { 
      ...scoringResult, 
      enrichedMembers,
      // Add the synthesized memo content
      memoNarrative: synthesisResult.teamMemoNarrative,
      oneLineSummary: synthesisResult.oneLineSummary,
      investorHighlights: synthesisResult.investorHighlights,
    };
  }
}

class MarketAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    // Check if we need to reload from database
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("market");
    
    // If database prompt exists and version changed, recreate chain
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("market");
      if (chatPrompt) {
        console.log("[MarketAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([
          chatPrompt,
          getJsonModel(),
          new JsonOutputParser(),
        ]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    // Fallback to hardcoded prompt
    if (!this.chain) {
      this.chain = RunnableSequence.from([
        marketAnalysisPrompt,
        getJsonModel(),
        new JsonOutputParser(),
      ]);
    }
    return this.chain;
  }

  async analyze(context: StartupContext) {
    console.log("[MarketAgent] Starting market analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    // Use truncated web research with market-focused content
    const webResearchContext = truncateWebResearch(context.webResearch, 10000);
    
    // Format research context for the prompt
    const researchContextStr = context.webResearch?.researchContext 
      ? `Specific Market: ${context.webResearch.researchContext.specificMarket}
Target Customers: ${context.webResearch.researchContext.targetCustomers}
Known Competitors: ${context.webResearch.researchContext.knownCompetitors.join(', ') || 'None identified'}
Claimed TAM: ${context.webResearch.researchContext.claimedTam || 'Not specified'}
Claimed Growth: ${context.webResearch.researchContext.claimedGrowth || 'Not specified'}
Geographic Focus: ${context.webResearch.researchContext.geographicFocus}
Business Model: ${context.webResearch.researchContext.businessModel}`
      : "No extracted context available";

    // Format deep research market data (TAM validation, trends, drivers)
    let deepResearchMarketContext = "";
    if (context.marketDeepResearch) {
      console.log("[MarketAgent] Incorporating deep research market data");
      const mr = context.marketDeepResearch;
      deepResearchMarketContext = "\n\n=== DEEP RESEARCH MARKET DATA ===\n";
      
      if (mr.totalAddressableMarket) {
        deepResearchMarketContext += `\n**TAM Analysis:**\n`;
        deepResearchMarketContext += `Validated TAM: ${mr.totalAddressableMarket.value} (${mr.totalAddressableMarket.year})\n`;
        deepResearchMarketContext += `Source: ${mr.totalAddressableMarket.source}\n`;
        deepResearchMarketContext += `Confidence: ${mr.totalAddressableMarket.confidence}\n`;
      }
      if (mr.serviceableAddressableMarket) {
        deepResearchMarketContext += `SAM: ${mr.serviceableAddressableMarket.value} (Source: ${mr.serviceableAddressableMarket.source})\n`;
      }
      if (mr.marketGrowthRate) {
        deepResearchMarketContext += `\n**Growth Rate:**\n`;
        deepResearchMarketContext += `CAGR: ${mr.marketGrowthRate.cagr} (${mr.marketGrowthRate.period})\n`;
        deepResearchMarketContext += `Source: ${mr.marketGrowthRate.source}\n`;
      }
      if (mr.tamValidation) {
        deepResearchMarketContext += `\n**TAM Claim Validation:**\n`;
        deepResearchMarketContext += `Accuracy: ${mr.tamValidation.claimAccuracy}\n`;
        deepResearchMarketContext += `Analysis: ${mr.tamValidation.explanation}\n`;
      }
      if (mr.marketTrends?.length) {
        deepResearchMarketContext += `\n**Market Trends:**\n`;
        mr.marketTrends.forEach(t => {
          deepResearchMarketContext += `- ${t.trend} (${t.impact} impact, ${t.timeframe})\n`;
        });
      }
      if (mr.marketDrivers?.length) {
        deepResearchMarketContext += `\n**Market Drivers:** ${mr.marketDrivers.join('; ')}\n`;
      }
      if (mr.marketChallenges?.length) {
        deepResearchMarketContext += `**Market Challenges:** ${mr.marketChallenges.join('; ')}\n`;
      }
      if (mr.forecasts?.length) {
        deepResearchMarketContext += `\n**Forecasts:**\n`;
        mr.forecasts.forEach(f => {
          deepResearchMarketContext += `- ${f.metric}: ${f.value} by ${f.year} (${f.source})\n`;
        });
      }
      if (mr.regulatoryLandscape) {
        deepResearchMarketContext += `\n**Regulatory Landscape:** ${mr.regulatoryLandscape}\n`;
      }
      if (mr.sources?.length) {
        deepResearchMarketContext += `\n**Sources:** ${mr.sources.slice(0, 5).join(', ')}\n`;
      }
    }
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      website: context.website,
      location: context.location || "Not specified",
      deckContext: context.deckContent || "No pitch deck content available",
      webResearch: webResearchContext + deepResearchMarketContext,
      researchContext: researchContextStr,
      adminGuidance,
    });
    
    console.log("[MarketAgent] Analysis complete");
    return result;
  }
}

class ProductAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("product");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("product");
      if (chatPrompt) {
        console.log("[ProductAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    if (!this.chain) {
      this.chain = RunnableSequence.from([productAnalysisPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.chain;
  }

  async analyze(context: StartupContext) {
    console.log("[ProductAgent] Starting product analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    let websiteContent = "No website content available.";
    if (context.webResearch?.websiteContent && context.webResearch.websiteContent.length > 0) {
      websiteContent = context.webResearch.websiteContent
        .map(page => `=== ${page.title} (${page.url}) ===\n${page.mainContent.substring(0, 3000)}`)
        .join("\n\n");
    }
    
    // Format research context for product analysis (target customers, competitors)
    const researchContextStr = context.webResearch?.researchContext 
      ? `Target Customers: ${context.webResearch.researchContext.targetCustomers}
Product Description (from web research): ${context.webResearch.researchContext.productDescription}
Known Competitors: ${context.webResearch.researchContext.knownCompetitors.join(', ') || 'None identified'}
Business Model: ${context.webResearch.researchContext.businessModel}`
      : "";

    // Format deep research product data (competitive position, reviews, strengths/weaknesses)
    let deepResearchProductContext = "";
    if (context.productDeepResearch) {
      console.log("[ProductAgent] Incorporating deep research product data");
      const pr = context.productDeepResearch;
      deepResearchProductContext = "\n\n=== DEEP RESEARCH PRODUCT DATA ===\n";
      
      if (pr.productDescription) {
        deepResearchProductContext += `\n**Product Overview:** ${pr.productDescription}\n`;
      }
      if (pr.coreFeatures?.length) {
        deepResearchProductContext += `**Core Features:** ${pr.coreFeatures.join('; ')}\n`;
      }
      if (pr.technicalStack?.length) {
        deepResearchProductContext += `**Technical Stack:** ${pr.technicalStack.join(', ')}\n`;
      }
      if (pr.reviews?.length) {
        deepResearchProductContext += `\n**Product Reviews:**\n`;
        pr.reviews.forEach(r => {
          deepResearchProductContext += `- ${r.source}: ${r.rating} - ${r.summary}\n`;
        });
      }
      if (pr.strengths?.length) {
        deepResearchProductContext += `\n**Product Strengths:** ${pr.strengths.join('; ')}\n`;
      }
      if (pr.weaknesses?.length) {
        deepResearchProductContext += `**Product Weaknesses:** ${pr.weaknesses.join('; ')}\n`;
      }
      if (pr.competitivePosition) {
        deepResearchProductContext += `\n**Competitive Position:** ${pr.competitivePosition}\n`;
      }
      if (pr.marketDynamics) {
        deepResearchProductContext += `\n**Market Dynamics:**\n`;
        deepResearchProductContext += `- Entry Barriers: ${pr.marketDynamics.entryBarriers}\n`;
        deepResearchProductContext += `- Substitutes: ${pr.marketDynamics.substitutes?.join(', ') || 'None identified'}\n`;
        deepResearchProductContext += `- Buyer Power: ${pr.marketDynamics.buyerPower}\n`;
        deepResearchProductContext += `- Supplier Power: ${pr.marketDynamics.supplierPower}\n`;
      }
      if (pr.sources?.length) {
        deepResearchProductContext += `\n**Sources:** ${pr.sources.slice(0, 5).join(', ')}\n`;
      }
    }
    
    // Combine founder-submitted product description with one-liner
    const fullProductDescription = context.productDescription 
      ? `FOUNDER-SUBMITTED PRODUCT DESCRIPTION:\n${context.productDescription}\n\nONE-LINER: ${context.description || "Not provided"}`
      : context.description || "No description provided";
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      companyDescription: fullProductDescription,
      sector: context.sector,
      stage: context.stage,
      website: context.website,
      deckContext: context.deckContent || "No pitch deck content available",
      websiteContent: websiteContent + (researchContextStr ? `\n\n=== EXTRACTED CONTEXT ===\n${researchContextStr}` : "") + deepResearchProductContext,
      adminGuidance,
    });
    
    console.log("[ProductAgent] Analysis complete");
    return result;
  }
}

class TractionAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("traction");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("traction");
      if (chatPrompt) {
        console.log("[TractionAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    if (!this.chain) {
      this.chain = RunnableSequence.from([tractionAnalysisPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.chain;
  }

  async analyze(context: StartupContext) {
    console.log("[TractionAgent] Starting traction analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    // Include website content and news for traction validation
    const webResearchContext = truncateWebResearch(context.webResearch, 6000);
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      stage: context.stage,
      website: context.website,
      deckContext: context.deckContent || "No pitch deck content available",
      webResearch: webResearchContext,
      adminGuidance,
    });
    
    console.log("[TractionAgent] Analysis complete");
    return result;
  }
}

class BusinessModelAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("businessModel");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("businessModel");
      if (chatPrompt) {
        console.log("[BusinessModelAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    if (!this.chain) {
      this.chain = RunnableSequence.from([businessModelPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.chain;
  }

  async analyze(context: StartupContext) {
    console.log("[BusinessModelAgent] Starting business model analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    // Include pricing page content for business model analysis
    const webResearchContext = truncateWebResearch(context.webResearch, 6000);
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      stage: context.stage,
      website: context.website,
      deckContext: context.deckContent || "No pitch deck content available",
      webResearch: webResearchContext,
      adminGuidance,
    });
    
    console.log("[BusinessModelAgent] Analysis complete");
    return result;
  }
}

class GTMAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("gtm");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("gtm");
      if (chatPrompt) {
        console.log("[GTMAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    if (!this.chain) {
      this.chain = RunnableSequence.from([gtmPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.chain;
  }

  async analyze(context: StartupContext) {
    console.log("[GTMAgent] Starting go-to-market analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    // Include website content for GTM strategy analysis
    const webResearchContext = truncateWebResearch(context.webResearch, 6000);
    
    // Format research context for GTM analysis (target customers, geographic focus)
    const researchContextStr = context.webResearch?.researchContext 
      ? `\n\n=== EXTRACTED CONTEXT ===
Target Customers: ${context.webResearch.researchContext.targetCustomers}
Geographic Focus: ${context.webResearch.researchContext.geographicFocus}
Business Model: ${context.webResearch.researchContext.businessModel}
Known Competitors: ${context.webResearch.researchContext.knownCompetitors.join(', ') || 'None identified'}`
      : "";
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      stage: context.stage,
      website: context.website,
      deckContext: context.deckContent || "No pitch deck content available",
      webResearch: webResearchContext + researchContextStr,
      adminGuidance,
    });
    
    console.log("[GTMAgent] Analysis complete");
    return result;
  }
}

class FinancialsAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("financials");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("financials");
      if (chatPrompt) {
        console.log("[FinancialsAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    if (!this.chain) {
      this.chain = RunnableSequence.from([financialsAnalysisPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.chain;
  }

  async analyze(context: StartupContext) {
    console.log("[FinancialsAgent] Starting financials analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    // Include news for funding/financial context
    const webResearchContext = truncateWebResearch(context.webResearch, 4000);
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      stage: context.stage,
      roundSize: context.roundSize || "Not specified",
      roundCurrency: context.roundCurrency || "USD",
      valuation: context.valuationKnown === false ? "Not yet determined by founder" : (context.valuation || "Not specified"),
      valuationType: context.valuationKnown === false ? "N/A" : (context.valuationType || "pre_money"),
      raiseType: context.raiseType || "Not specified",
      leadSecured: context.leadSecured ? "Yes" : "No",
      leadInvestorName: context.leadInvestorName || "",
      hasPreviousFunding: context.hasPreviousFunding ? "Yes" : "No",
      previousFundingAmount: context.previousFundingAmount || "N/A",
      previousFundingCurrency: context.previousFundingCurrency || "",
      previousInvestors: context.previousInvestors || "N/A",
      previousRoundType: context.previousRoundType || "N/A",
      deckContext: context.deckContent || "No pitch deck content available",
      webResearch: webResearchContext,
      adminGuidance,
    });
    
    console.log("[FinancialsAgent] Analysis complete");
    return result;
  }
}

// Deep research prompt for competitive analysis - used by o3-deep-research
const competitiveDeepResearchPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`You are an expert competitive intelligence researcher with access to comprehensive market data. Your task is to conduct deep research on the competitive landscape.

=== STEP 1: PRODUCT/SERVICE DEFINITION ===
First, clearly define what this startup offers:
- Core product/service and its primary function
- Key features and capabilities
- Target customer segments (SMB, Enterprise, Consumer, etc.)
- Value proposition and how it differs from alternatives
- Pricing model (if known)
- Category/market it competes in

=== STEP 2: COMPETITOR IDENTIFICATION ===
Based on the product definition, identify competitors:

**Direct Competitors** - Companies solving the SAME problem for the SAME customer segment:
- Must offer substantially similar product/service
- Target the same buyers
- Would be mentioned in the same analyst reports

**Indirect Competitors** - Companies solving the same problem differently OR adjacent solutions:
- Alternative approaches to solving the customer's core problem
- Point solutions that address part of the value prop
- Platforms that could expand into this space

=== STEP 3: DEEP COMPETITOR PROFILES ===
For each competitor, research:
- Company overview: founding year, HQ location, employee count
- Funding: total raised, last round, key investors
- Product: key features, pricing tiers, target segment
- Market position: estimated revenue, customer base, market share
- Recent activity: product launches, acquisitions, partnerships (last 12 months)
- Strengths: what they do better than the startup
- Weaknesses: where the startup has an advantage

=== STEP 4: SOURCE CITATIONS ===
CRITICAL: Cite sources for all claims. Include:
- News articles with publication and date
- Crunchbase/PitchBook for funding data
- Company websites for product info
- Press releases for announcements
- Industry reports for market data

Provide comprehensive research findings in JSON format:
{{
  "productDefinition": {{
    "coreOffering": "string - what the product/service actually does",
    "keyFeatures": ["array of main features/capabilities"],
    "targetCustomers": "string - primary customer segment",
    "valueProposition": "string - unique value vs alternatives",
    "pricingModel": "string - freemium, subscription, usage-based, etc. or 'Unknown'",
    "marketCategory": "string - the category this competes in"
  }},
  "directCompetitors": [
    {{
      "name": "string",
      "website": "string",
      "description": "string - 2-3 sentence overview",
      "foundingYear": "number or null",
      "headquarters": "string or null",
      "employeeCount": "string estimate or null",
      "funding": {{
        "totalRaised": "string or null",
        "lastRound": "string or null",
        "lastRoundDate": "string or null",
        "keyInvestors": ["array or empty"]
      }},
      "product": {{
        "keyFeatures": ["array of main features"],
        "pricingTiers": "string description or null",
        "targetSegment": "string"
      }},
      "marketPosition": {{
        "estimatedRevenue": "string or null",
        "customerBase": "string description or null",
        "marketShare": "string or null"
      }},
      "recentActivity": ["array of recent news/launches/partnerships"],
      "strengths": ["array - what they do better"],
      "weaknesses": ["array - where startup has advantage"],
      "sources": ["array of source URLs or citations"]
    }}
  ],
  "indirectCompetitors": [
    {{
      "name": "string",
      "website": "string",
      "description": "string - how they relate to the startup's space",
      "threatLevel": "high | medium | low",
      "whyIndirect": "string - why not direct competitor",
      "funding": "string total or null",
      "strengths": ["array"],
      "sources": ["array of source URLs or citations"]
    }}
  ],
  "marketLandscape": {{
    "totalMarketPlayers": "string estimate of total competitors",
    "marketConcentration": "fragmented | consolidating | concentrated",
    "dominantPlayers": ["array of market leaders if any"],
    "marketTrends": ["array of key trends affecting competition"],
    "recentMnA": [
      {{"acquirer": "string", "target": "string", "date": "string", "value": "string or null", "source": "string"}}
    ],
    "emergingThreats": ["array of emerging competitive threats"],
    "barrierAnalysis": "string - how hard is it for new entrants"
  }},
  "competitivePositioning": {{
    "startupAdvantages": ["array - where startup wins vs competitors"],
    "startupDisadvantages": ["array - where competitors are stronger"],
    "differentiationStrength": "strong | moderate | weak",
    "positioningRecommendation": "string - strategic advice"
  }},
  "sourceSummary": {{
    "primarySources": ["array of main sources used"],
    "dataFreshness": "string - how recent is the data",
    "researchConfidence": "high | medium | low",
    "dataGaps": ["array - what information was not found"]
  }}
}}`),
  HumanMessagePromptTemplate.fromTemplate(`Conduct comprehensive competitive research for:

=== COMPANY BEING EVALUATED ===
Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}

=== PITCH DECK CONTEXT ===
{deckContext}

=== PRELIMINARY COMPETITOR RESEARCH ===
{competitorResearch}

=== INSTRUCTIONS ===
1. First, clearly define what {companyName} offers based on the description and pitch deck
2. Based on that product definition, identify the MOST RELEVANT direct competitors (aim for 4-6)
3. Identify 2-4 indirect competitors that pose real threats
4. Research each competitor deeply - funding, products, market position
5. Cite sources for all factual claims
6. Be rigorous - only include verified information, flag uncertainties

Provide your comprehensive competitive intelligence report.`),
]);

class CompetitiveAdvantageAgent {
  private deepResearchChain: RunnableSequence | null = null;
  private analysisChain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private getDeepResearchChain() {
    if (!this.deepResearchChain) {
      this.deepResearchChain = RunnableSequence.from([competitiveDeepResearchPrompt, getDeepResearchModel(), new JsonOutputParser()]);
    }
    return this.deepResearchChain;
  }

  private async getAnalysisChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("competitiveAdvantage");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("competitiveAdvantage");
      if (chatPrompt) {
        console.log("[CompetitiveAdvantageAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.analysisChain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.analysisChain;
      }
    }
    
    if (!this.analysisChain) {
      this.analysisChain = RunnableSequence.from([competitiveAdvantagePrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.analysisChain;
  }

  async analyze(context: StartupContext) {
    console.log("[CompetitiveAdvantageAgent] Starting layered competitive advantage analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    let competitorResearch = "No competitor research available.";
    if (context.webResearch?.competitorResearch && context.webResearch.competitorResearch.length > 0) {
      competitorResearch = context.webResearch.competitorResearch
        .map(search => {
          let formatted = `Query: ${search.query}\n`;
          if (search.answer) formatted += `Summary: ${search.answer}\n`;
          formatted += search.results.map(r => `- ${r.title}: ${r.content.substring(0, 300)}`).join("\n");
          return formatted;
        })
        .join("\n\n");
    }
    
    // Add extracted research context (known competitors from deck/website)
    const researchContextStr = context.webResearch?.researchContext 
      ? `\n\n=== EXTRACTED CONTEXT ===
Known Competitors: ${context.webResearch.researchContext.knownCompetitors.join(', ') || 'None identified'}
Specific Market: ${context.webResearch.researchContext.specificMarket}
Target Customers: ${context.webResearch.researchContext.targetCustomers}
Business Model: ${context.webResearch.researchContext.businessModel}`
      : "";
    
    // Use deep research product data for competitor analysis
    console.log("[CompetitiveAdvantageAgent] Running competitive advantage analysis...");
    
    // Format deep research competitor data
    let deepResearchCompetitorContext = "";
    if (context.productDeepResearch?.competitors && context.productDeepResearch.competitors.length > 0) {
      console.log(`[CompetitiveAdvantageAgent] Incorporating ${context.productDeepResearch.competitors.length} competitors from deep research`);
      deepResearchCompetitorContext = "\n\n=== DEEP RESEARCH COMPETITOR PROFILES ===\n";
      
      for (const comp of context.productDeepResearch.competitors) {
        deepResearchCompetitorContext += `\n**${comp.name}**\n`;
        if (comp.website) deepResearchCompetitorContext += `Website: ${comp.website}\n`;
        if (comp.description) deepResearchCompetitorContext += `Description: ${comp.description}\n`;
        if (comp.marketShare) deepResearchCompetitorContext += `Market Share: ${comp.marketShare}\n`;
        if (comp.funding) {
          deepResearchCompetitorContext += `Funding: ${comp.funding.totalRaised || 'Unknown'}`;
          if (comp.funding.lastRound) deepResearchCompetitorContext += ` (${comp.funding.lastRound}, ${comp.funding.lastRoundDate})`;
          if (comp.funding.keyInvestors?.length) deepResearchCompetitorContext += ` - Investors: ${comp.funding.keyInvestors.join(', ')}`;
          deepResearchCompetitorContext += `\n`;
        }
        if (comp.strengths?.length) deepResearchCompetitorContext += `Strengths: ${comp.strengths.join('; ')}\n`;
        if (comp.weaknesses?.length) deepResearchCompetitorContext += `Weaknesses: ${comp.weaknesses.join('; ')}\n`;
        if (comp.productFeatures?.length) deepResearchCompetitorContext += `Features: ${comp.productFeatures.join('; ')}\n`;
        if (comp.pricing) deepResearchCompetitorContext += `Pricing: ${comp.pricing}\n`;
        if (comp.targetCustomers) deepResearchCompetitorContext += `Target Customers: ${comp.targetCustomers}\n`;
        if (comp.differentiators?.length) deepResearchCompetitorContext += `Differentiators: ${comp.differentiators.join('; ')}\n`;
        if (comp.recentNews?.length) deepResearchCompetitorContext += `Recent News: ${comp.recentNews.slice(0, 2).join('; ')}\n`;
        if (comp.sources?.length) deepResearchCompetitorContext += `Sources: ${comp.sources.slice(0, 2).join(', ')}\n`;
      }
      
      // Add market dynamics from product research
      if (context.productDeepResearch.marketDynamics) {
        const md = context.productDeepResearch.marketDynamics;
        deepResearchCompetitorContext += `\n**Market Dynamics:**\n`;
        deepResearchCompetitorContext += `Entry Barriers: ${md.entryBarriers}\n`;
        deepResearchCompetitorContext += `Substitutes: ${md.substitutes?.join(', ') || 'None identified'}\n`;
        deepResearchCompetitorContext += `Buyer Power: ${md.buyerPower}\n`;
        deepResearchCompetitorContext += `Supplier Power: ${md.supplierPower}\n`;
      }
      
      if (context.productDeepResearch.competitivePosition) {
        deepResearchCompetitorContext += `\n**Overall Competitive Position:** ${context.productDeepResearch.competitivePosition}\n`;
      }
    }
    
    // Enhance competitor research with deep research results and extracted context
    let enhancedResearch = competitorResearch + researchContextStr + deepResearchCompetitorContext;
    
    // Format web research for context
    let webResearchContext = "No web research available.";
    if (context.webResearch?.formattedForPrompt) {
      webResearchContext = context.webResearch.formattedForPrompt.substring(0, 6000);
    }

    const analysisChain = await this.getAnalysisChain();
    const result = await analysisChain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      website: context.website,
      deckContext: context.deckContent || "No pitch deck content available",
      competitorResearch: enhancedResearch,
      webResearch: webResearchContext,
      adminGuidance,
    });
    
    console.log("[CompetitiveAdvantageAgent] Analysis complete");
    
    // Return combined results including deep research competitor profiles for the UI
    const competitorProfiles = context.productDeepResearch?.competitors || [];
    return {
      ...result,
      // Include detailed competitor research for the Competitors tab
      competitorProfiles,
      indirectCompetitorProfiles: [],
      productDefinition: context.productDeepResearch?.productDescription || null,
      marketLandscape: context.productDeepResearch?.marketDynamics || null,
      competitivePositioning: context.productDeepResearch?.competitivePosition || null,
      sourceSummary: context.productDeepResearch?.sources?.slice(0, 10) || null,
    };
  }
}

// CompetitiveLandscapeSynthesisAgent removed - functionality merged into CompetitiveAdvantageAgent

class LegalRegulatoryAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("legal");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("legal");
      if (chatPrompt) {
        console.log("[LegalRegulatoryAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    if (!this.chain) {
      this.chain = RunnableSequence.from([legalRegulatoryPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.chain;
  }

  async analyze(context: StartupContext) {
    console.log("[LegalRegulatoryAgent] Starting legal/regulatory analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    // Include website and news for regulatory context
    const webResearchContext = truncateWebResearch(context.webResearch, 4000);
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      website: context.website,
      location: context.location || "Not specified",
      deckContext: context.deckContent || "No pitch deck content available",
      webResearch: webResearchContext,
      adminGuidance,
    });
    
    console.log("[LegalRegulatoryAgent] Analysis complete");
    return result;
  }
}

class DealTermsAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("dealTerms");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("dealTerms");
      if (chatPrompt) {
        console.log("[DealTermsAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    if (!this.chain) {
      this.chain = RunnableSequence.from([dealTermsPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.chain;
  }

  async analyze(context: StartupContext) {
    console.log("[DealTermsAgent] Starting deal terms analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    // Include news for comparable deal context
    const webResearchContext = truncateWebResearch(context.webResearch, 4000);
    
    // Include competitor funding research for valuation benchmarks
    let competitorFundingContext = "";
    if (context.webResearch?.competitorResearch && context.webResearch.competitorResearch.length > 0) {
      competitorFundingContext = "\n\n=== COMPETITOR FUNDING DATA ===\n" + 
        context.webResearch.competitorResearch
          .map(search => {
            let formatted = `Query: ${search.query}\n`;
            if (search.answer) formatted += `Summary: ${search.answer}\n`;
            formatted += search.results.map(r => `- ${r.title}: ${r.content.substring(0, 250)}`).join("\n");
            return formatted;
          })
          .join("\n\n");
    }
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      stage: context.stage,
      roundSize: context.roundSize || "Not specified",
      roundCurrency: context.roundCurrency || "USD",
      valuation: context.valuationKnown === false ? "Not yet determined by founder" : (context.valuation || "Not specified"),
      valuationType: context.valuationKnown === false ? "N/A" : (context.valuationType || "pre_money"),
      raiseType: context.raiseType || "Not specified",
      leadSecured: context.leadSecured ? "Yes" : "No",
      leadInvestorName: context.leadInvestorName || "",
      hasPreviousFunding: context.hasPreviousFunding ? "Yes" : "No",
      previousFundingAmount: context.previousFundingAmount || "N/A",
      previousFundingCurrency: context.previousFundingCurrency || "",
      previousInvestors: context.previousInvestors || "N/A",
      previousRoundType: context.previousRoundType || "N/A",
      deckContext: context.deckContent || "No pitch deck content available",
      webResearch: webResearchContext + competitorFundingContext,
      adminGuidance,
    });
    
    console.log("[DealTermsAgent] Analysis complete");
    return result;
  }
}

class ExitPotentialAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("exitPotential");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("exitPotential");
      if (chatPrompt) {
        console.log("[ExitPotentialAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    if (!this.chain) {
      this.chain = RunnableSequence.from([exitPotentialPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.chain;
  }

  async analyze(context: StartupContext) {
    console.log("[ExitPotentialAgent] Starting exit potential analysis...");
    
    const adminGuidance = context.adminFeedback 
      ? `\n=== ADMIN GUIDANCE ===\nPlease consider this specific feedback from the reviewing analyst:\n${context.adminFeedback}\n`
      : "";
    
    // Include M&A news and competitor research for exit analysis
    const webResearchContext = truncateWebResearch(context.webResearch, 4000);
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      companyDescription: context.description || "No description provided",
      sector: context.sector,
      stage: context.stage,
      website: context.website,
      location: context.location || "Not specified",
      deckContext: context.deckContent || "No pitch deck content available",
      webResearch: webResearchContext,
      adminGuidance,
    });
    
    console.log("[ExitPotentialAgent] Analysis complete");
    return result;
  }
}

class SynthesisAgent {
  private chain: RunnableSequence | null = null;
  private promptVersion: number = 0;

  private async getChain() {
    const { getAgentPrompt, createChatPromptFromDB } = await import("./agent-prompt-loader");
    const dbPrompt = await getAgentPrompt("synthesis");
    
    if (dbPrompt && dbPrompt.version !== this.promptVersion) {
      const chatPrompt = await createChatPromptFromDB("synthesis");
      if (chatPrompt) {
        console.log("[SynthesisAgent] Using database prompt (version " + dbPrompt.version + ")");
        this.chain = RunnableSequence.from([chatPrompt, getJsonModel(), new JsonOutputParser()]);
        this.promptVersion = dbPrompt.version || 0;
        return this.chain;
      }
    }
    
    if (!this.chain) {
      this.chain = RunnableSequence.from([synthesisPrompt, getJsonModel(), new JsonOutputParser()]);
    }
    return this.chain;
  }

  async synthesize(
    context: StartupContext,
    analyses: {
      team: any;
      market: any;
      product: any;
      traction: any;
      businessModel: any;
      gtm: any;
      financials: any;
      competitiveAdvantage: any;
      legal: any;
      dealTerms: any;
      exitPotential: any;
    }
  ) {
    console.log("[SynthesisAgent] Synthesizing all 11 analyses...");
    
    const chain = await this.getChain();
    const result = await chain.invoke({
      companyName: context.name,
      stage: context.stage,
      sector: context.sector,
      teamAnalysis: JSON.stringify(analyses.team, null, 2),
      marketAnalysis: JSON.stringify(analyses.market, null, 2),
      productAnalysis: JSON.stringify(analyses.product, null, 2),
      tractionAnalysis: JSON.stringify(analyses.traction, null, 2),
      businessModelAnalysis: JSON.stringify(analyses.businessModel, null, 2),
      gtmAnalysis: JSON.stringify(analyses.gtm, null, 2),
      financialsAnalysis: JSON.stringify(analyses.financials, null, 2),
      competitiveAdvantageAnalysis: JSON.stringify(analyses.competitiveAdvantage, null, 2),
      legalAnalysis: JSON.stringify(analyses.legal, null, 2),
      dealTermsAnalysis: JSON.stringify(analyses.dealTerms, null, 2),
      exitPotentialAnalysis: JSON.stringify(analyses.exitPotential, null, 2),
    });
    
    console.log("[SynthesisAgent] Synthesis complete");
    return result;
  }
}

export class StartupEvaluationOrchestrator {
  private teamAgent: TeamAgent;
  private marketAgent: MarketAgent;
  private tractionAgent: TractionAgent;
  private financialsAgent: FinancialsAgent;
  private productAgent: ProductAgent;
  private businessModelAgent: BusinessModelAgent;
  private gtmAgent: GTMAgent;
  private competitiveAdvantageAgent: CompetitiveAdvantageAgent;
  private legalRegulatoryAgent: LegalRegulatoryAgent;
  private dealTermsAgent: DealTermsAgent;
  private exitPotentialAgent: ExitPotentialAgent;
  private synthesisAgent: SynthesisAgent;
  private autoApprove: boolean;
  private fromStage: number;

  constructor(options?: { autoApprove?: boolean; fromStage?: number }) {
    this.teamAgent = new TeamAgent();
    this.marketAgent = new MarketAgent();
    this.tractionAgent = new TractionAgent();
    this.financialsAgent = new FinancialsAgent();
    this.productAgent = new ProductAgent();
    this.businessModelAgent = new BusinessModelAgent();
    this.gtmAgent = new GTMAgent();
    this.competitiveAdvantageAgent = new CompetitiveAdvantageAgent();
    this.legalRegulatoryAgent = new LegalRegulatoryAgent();
    this.dealTermsAgent = new DealTermsAgent();
    this.exitPotentialAgent = new ExitPotentialAgent();
    this.synthesisAgent = new SynthesisAgent();
    this.autoApprove = options?.autoApprove ?? false;
    this.fromStage = options?.fromStage ?? 1; // Default to running all stages
  }

  async evaluate(startupId: number): Promise<void> {
    const stageNames: Record<number, string> = {
      1: "Data Extraction",
      2: "LinkedIn Research",
      3: "Deep Research",
      4: "Evaluation Pipeline"
    };
    console.log(`[Orchestrator] Starting evaluation for startup ${startupId} from Stage ${this.fromStage} (${stageNames[this.fromStage] || 'Unknown'})`);
    
    // Initialize source tracker for this evaluation
    const sourceTracker = new SourceTracker();
    
    try {
      await storage.updateStartup(startupId, { status: "analyzing" });
      
      // Initialize analysis progress tracking
      await initializeProgress(startupId);
      
      const startup = await storage.getStartup(startupId);
      if (!startup) {
        throw new Error("Startup not found");
      }

      // Log startup data source
      sourceTracker.logDatabase("startups", "Orchestrator", `Retrieved startup record: ${startup.name}`, `ID: ${startupId}, Name: ${startup.name}`);

      // Normalize location to region code for investor matching (only if not already done)
      if (startup.location && !startup.normalizedRegion) {
        console.log(`[Orchestrator] Normalizing location "${startup.location}" to region code...`);
        const normalizedRegion = await normalizeLocationToRegion(startup.location);
        if (normalizedRegion) {
          await storage.updateStartup(startupId, { normalizedRegion });
          console.log(`[Orchestrator] Location normalized to: ${normalizedRegion}`);
        }
      }

      const files = startup.files as Array<{name: string; path: string; type: string}> | null;
      
      // Check for existing evaluation with cached data
      const existingEvaluation = await storage.getEvaluation(startupId);
      
      // ========================================================================
      // STAGE 1: EXTRACT DECK CONTENT (use cached if same files)
      // ========================================================================
      let extractionResult: { content: string; success: boolean; filesAttempted: number; errors: string[] };
      
      // Check if we can use cached deck content (same files as before)
      // Skip cache if fromStage is 1 (force re-extraction)
      const existingFilesHash = existingEvaluation?.deckFilesHash as string | null;
      const currentFilesHash = files ? JSON.stringify(files.map(f => f.path).sort()) : null;
      const forceStage1 = this.fromStage <= 1;
      
      if (!forceStage1 && existingEvaluation?.deckContent && existingFilesHash === currentFilesHash && currentFilesHash !== null) {
        console.log(`[Orchestrator] STAGE 1: Using cached deck content (${existingEvaluation.deckContent.length} chars)`);
        extractionResult = {
          content: existingEvaluation.deckContent,
          success: true,
          filesAttempted: files?.length || 0,
          errors: [],
        };
      } else {
        console.log(`[Orchestrator] STAGE 1: Extracting deck content (${files?.length || 0} files)${forceStage1 ? ' [FORCED by fromStage]' : ''}`);
        extractionResult = await extractDeckContent(files);
        console.log(`[Orchestrator] Deck extraction complete: ${extractionResult.content.length} chars`);
      }
      
      // Log each document source
      if (files && files.length > 0) {
        for (const file of files) {
          sourceTracker.logDocument(
            file.name, 
            "Orchestrator", 
            `Pitch deck document: ${file.type}`,
            file.path,
            extractionResult.success ? `Extracted ${extractionResult.content.length} characters` : "Failed to extract"
          );
        }
      }
      
      // Log website if available
      if (startup.website) {
        sourceTracker.logWebsite(startup.website, "Orchestrator", "Company website", "Used for company information and context");
      }

      // ========================================================================
      // STAGE 1.5: EXTRACT MISSING FIELDS FROM DECK CONTENT & DISCOVER WEBSITE
      // This fills in any missing startup fields from the parsed deck content
      // and discovers the website if not provided
      // ========================================================================
      if (extractionResult.success && extractionResult.content.length > 100) {
        console.log(`[Orchestrator] STAGE 1.5: Extracting missing fields from deck content...`);
        
        // Extract missing fields from deck content
        const extractedFields = await extractFieldsFromDeckContent(extractionResult.content, {
          website: startup.website,
          description: startup.description,
          stage: startup.stage,
          sector: startup.sector,
          location: startup.location,
          roundSize: startup.roundSize,
          roundCurrency: startup.roundCurrency,
        });
        
        // Prepare updates for the startup record
        const startupUpdates: Record<string, any> = {};
        
        if (extractedFields.description) startupUpdates.description = extractedFields.description;
        if (extractedFields.stage) startupUpdates.stage = extractedFields.stage;
        if (extractedFields.sector) startupUpdates.sector = extractedFields.sector;
        if (extractedFields.location) startupUpdates.location = extractedFields.location;
        if (extractedFields.roundSize) startupUpdates.roundSize = extractedFields.roundSize;
        if (extractedFields.roundCurrency) startupUpdates.roundCurrency = extractedFields.roundCurrency;
        
        // Handle website - first check extracted fields, then try discovery
        let discoveredWebsite = extractedFields.website;
        if (!startup.website && !discoveredWebsite) {
          console.log(`[Orchestrator] Website not found in fields extraction, trying discovery...`);
          discoveredWebsite = await discoverWebsite(startup.name, extractionResult.content);
        }
        
        if (discoveredWebsite && !startup.website) {
          startupUpdates.website = discoveredWebsite;
          console.log(`[Orchestrator] Discovered website: ${discoveredWebsite}`);
          sourceTracker.logWebsite(discoveredWebsite, "Orchestrator", "Discovered company website", "Extracted from pitch deck or inferred");
        }
        
        // Update startup record with extracted fields
        if (Object.keys(startupUpdates).length > 0) {
          console.log(`[Orchestrator] Updating startup with ${Object.keys(startupUpdates).length} extracted fields:`, Object.keys(startupUpdates));
          await storage.updateStartup(startupId, startupUpdates);
          
          // Refresh startup data for subsequent stages
          const updatedStartup = await storage.getStartup(startupId);
          if (updatedStartup) {
            // Update the startup reference for subsequent stages
            Object.assign(startup, updatedStartup);
          }
        } else {
          console.log(`[Orchestrator] No new fields to extract from deck content`);
        }
      }

      // ========================================================================
      // STAGE 2: RUN COMPREHENSIVE RESEARCH ORCHESTRATOR (use cached if available)
      // This includes: deep website scraping, team discovery, LinkedIn enrichment,
      // and 4 deep research agents (team, market, product/competitors, news)
      // ========================================================================
      await updateStage(startupId, 2);
      
      let comprehensiveResearch: ComprehensiveResearchResult | undefined;
      let webResearchData: WebResearchData | undefined;
      let usedCachedResearch = false;
      
      // Check if we can use cached comprehensive research (same website)
      // Stage mapping:
      // - fromStage=1: Re-run everything (deck extraction + website scraping + LinkedIn + deep research)
      // - fromStage=2: Re-run LinkedIn enrichment + deep research (use cached website content)
      // - fromStage=3: Re-run deep research only (use cached website content + LinkedIn data)
      // - fromStage=4: Use all cached data (only re-run evaluation)
      const cachedComprehensiveResearch = existingEvaluation?.comprehensiveResearchData as ComprehensiveResearchResult | null;
      const cachedWebsite = existingEvaluation?.websiteScraped as string | null;
      
      // Build research options based on fromStage
      const researchOptions: ResearchOptions = {};
      
      // Validate cached data is usable (website must match and data must exist)
      const cachedWebsiteContentValid = 
        cachedComprehensiveResearch?.extractedData?.websiteContent?.length &&
        cachedWebsite === startup.website &&
        startup.website;
        
      const cachedTeamMembersValid = 
        cachedComprehensiveResearch?.extractedData?.teamMembers?.length &&
        cachedWebsite === startup.website;
      
      // fromStage >= 2: Skip website scraping if we have valid cached data
      if (this.fromStage >= 2 && cachedWebsiteContentValid) {
        researchOptions.skipWebsiteScraping = true;
        researchOptions.cachedWebsiteContent = cachedComprehensiveResearch!.extractedData.websiteContent;
        console.log(`[Orchestrator] Will use cached website content (${researchOptions.cachedWebsiteContent.length} pages, fromStage=${this.fromStage})`);
      } else if (this.fromStage >= 2) {
        console.log(`[Orchestrator] Cannot use cached website content (invalid/missing), will re-scrape`);
      }
      
      // fromStage >= 3: Skip LinkedIn enrichment if we have valid cached team data
      if (this.fromStage >= 3 && cachedTeamMembersValid) {
        researchOptions.skipLinkedInEnrichment = true;
        researchOptions.cachedTeamMembers = cachedComprehensiveResearch!.extractedData.teamMembers;
        console.log(`[Orchestrator] Will use cached LinkedIn data (${researchOptions.cachedTeamMembers.length} members, fromStage=${this.fromStage})`);
      } else if (this.fromStage >= 3) {
        console.log(`[Orchestrator] Cannot use cached LinkedIn data (invalid/missing), will re-enrich`);
      }
      
      // fromStage >= 4: Use entire cached research (no re-research needed)
      const useFullCache = this.fromStage >= 4;
      
      if (useFullCache && cachedComprehensiveResearch && cachedWebsite === startup.website && startup.website) {
        console.log(`[Orchestrator] STAGE 2/3: Using cached comprehensive research for: ${startup.name}`);
        comprehensiveResearch = cachedComprehensiveResearch;
        usedCachedResearch = true;
        
        // Reconstruct webResearchData from cached comprehensive research
        const cached = existingEvaluation?.webResearchData as WebResearchData | null;
        if (cached) {
          webResearchData = {
            ...cached,
            formattedForPrompt: cached.formattedForPrompt || formatResearchForPrompt(cached),
          };
        }
      } else if (!useFullCache) {
        console.log(`[Orchestrator] STAGE 2/3: Running research for: ${startup.name} [fromStage=${this.fromStage}]`);
      }
      
      // Callback to incrementally save research progress after each stage
      const saveStageProgress = async (progressData: StageProgressData): Promise<void> => {
        // Note: UI Stage 3 transition is now handled by onDeepResearchStart callback
        // This callback only handles data saving, not UI stage updates
        
        const existingEval = await storage.getEvaluation(startupId);
        const existingResearchData = existingEval?.comprehensiveResearchData as ComprehensiveResearchResult | null;
        
        // For Stage 4 (complete), save the full comprehensive research directly
        // For earlier stages, merge partial data with existing
        let researchDataToSave: Partial<ComprehensiveResearchResult>;
        
        if (progressData.stage === 4 && progressData.comprehensiveResearch) {
          // Stage 4: Save full comprehensive research result
          researchDataToSave = progressData.comprehensiveResearch;
        } else {
          // Stages 1-3: Merge with existing data instead of overwriting
          // This preserves any existing research (team, market, product, news) while updating extractedData
          researchDataToSave = {
            // Preserve existing research if it exists
            ...(existingResearchData || {}),
            extractedData: {
              companyName: startup.name,
              website: startup.website || "",
              sector: startup.sector || "technology",
              // Preserve existing websiteContent if not provided in this stage update
              websiteContent: progressData.websiteContent || existingResearchData?.extractedData?.websiteContent || [],
              deckContent: extractionResult.content || existingResearchData?.extractedData?.deckContent || "",
              documentContent: existingResearchData?.extractedData?.documentContent || [],
              // Preserve existing teamMembers if not provided in this stage update
              teamMembers: progressData.teamMembers || existingResearchData?.extractedData?.teamMembers || [],
            },
          };
        }
        
        if (existingEval) {
          // Update existing evaluation with data
          await storage.updateEvaluation(existingEval.id, {
            comprehensiveResearchData: researchDataToSave as any,
            websiteScraped: startup.website || null,
          });
        } else {
          // Create new evaluation with initial stage data
          await storage.createEvaluation({
            startupId,
            overallScore: 0,
            percentileRank: 0,
            keyStrengths: [],
            keyRisks: [],
            recommendations: [],
            dataConfidenceNotes: `Stage ${progressData.stage} in progress`,
            sectionScores: {
              team: 0, market: 0, product: 0, traction: 0,
              businessModel: 0, gtm: 0, financials: 0,
              competitiveAdvantage: 0, legal: 0, dealTerms: 0, exitPotential: 0,
            },
            comprehensiveResearchData: researchDataToSave as any,
            websiteScraped: startup.website || null,
          });
        }
        
      };
      
      // Add the callback to research options
      researchOptions.onStageComplete = saveStageProgress;
      
      // Callback when deep research is about to start - update UI to Stage 3 and mark all agents as running
      researchOptions.onDeepResearchStart = async () => {
        await updateStage(startupId, 3);
        // Mark all deep research agents as running at once (avoids race condition when starting in parallel)
        await startAllDeepResearchAgents(startupId);
      };
      
      // Individual agent start callback (kept for compatibility, but agents are pre-marked as running)
      researchOptions.onDeepResearchAgentStart = async (agentId: string) => {
        // No-op: agents are already marked as running by startAllDeepResearchAgents
      };
      
      researchOptions.onDeepResearchAgentComplete = async (agentId: string) => {
        await completeDeepResearchAgent(startupId, agentId);
      };
      
      try {
        if (startup.website && !usedCachedResearch) {
          // Run comprehensive research with options to skip cached stages
          comprehensiveResearch = await conductComprehensiveResearch(
            startup.name,
            startup.website,
            startup.sector || "technology",
            extractionResult.content,
            [], // Additional documents
            researchOptions
          );
          
          // Log all sources from comprehensive research
          for (const page of comprehensiveResearch.extractedData.websiteContent) {
            if (!page.error) {
              sourceTracker.logWebsite(page.url, "DeepScraper", `Scraped page: ${page.title}`, `${page.mainContent.length} characters extracted`);
            }
          }
          
          // Log team research sources
          for (const member of comprehensiveResearch.teamResearch) {
            for (const source of member.sources || []) {
              sourceTracker.logWebsite(source, "TeamDeepResearch", `Team research: ${member.name}`, `Patents: ${member.patents?.length || 0}, Exits: ${member.previousExits?.length || 0}`);
            }
          }
          
          // Log market research sources
          for (const source of comprehensiveResearch.marketResearch.sources || []) {
            sourceTracker.logWebsite(source, "MarketDeepResearch", "Market research", `TAM: ${comprehensiveResearch.marketResearch.totalAddressableMarket?.value}`);
          }
          
          // Log product/competitor research sources
          for (const source of comprehensiveResearch.productResearch.sources || []) {
            sourceTracker.logWebsite(source, "ProductDeepResearch", "Product/Competitor research", `Competitors: ${comprehensiveResearch.productResearch.competitors?.length || 0}`);
          }
          
          // Log news research sources
          for (const source of comprehensiveResearch.newsResearch.sources || []) {
            sourceTracker.logWebsite(source, "NewsSearch", "News research", `Total mentions: ${comprehensiveResearch.newsResearch.totalMentions}`);
          }
          
          console.log(`[Orchestrator] Comprehensive research complete:`);
          console.log(`  - Website pages: ${comprehensiveResearch.extractedData.websiteContent.length}`);
          console.log(`  - Team members: ${comprehensiveResearch.extractedData.teamMembers.length}`);
          console.log(`  - Competitors: ${comprehensiveResearch.productResearch.competitors?.length || 0}`);
          console.log(`  - News items: ${comprehensiveResearch.newsResearch.totalMentions}`);
          console.log(`  - Total sources: ${comprehensiveResearch.researchSummary.totalSources}`);
          
          // Convert comprehensive research to legacy WebResearchData format for backward compatibility
          // This ensures downstream agents can still use competitorResearch/newsResearch arrays
          
          // Convert market research to TavilySearchResponse format
          const marketSearchResults: TavilySearchResponse[] = [];
          if (comprehensiveResearch.marketResearch) {
            marketSearchResults.push({
              query: `Market analysis: ${comprehensiveResearch.marketResearch.specificMarket}`,
              results: (comprehensiveResearch.marketResearch.sources || []).map(source => ({
                title: `Market Research: ${comprehensiveResearch.marketResearch.totalAddressableMarket?.value || 'Unknown'}`,
                url: source,
                content: `TAM: ${comprehensiveResearch.marketResearch.totalAddressableMarket?.value || 'Unknown'} (${comprehensiveResearch.marketResearch.totalAddressableMarket?.confidence || 0}% confidence). Growth Rate: ${comprehensiveResearch.marketResearch.marketGrowthRate?.value || 'Unknown'}. Key Trends: ${(comprehensiveResearch.marketResearch.keyTrends || []).map(t => t.trend).join('; ')}`,
              })),
              answer: `Market Size: ${comprehensiveResearch.marketResearch.totalAddressableMarket?.value || 'Unknown'}, Growth: ${comprehensiveResearch.marketResearch.marketGrowthRate?.value || 'Unknown'}. Confidence: ${comprehensiveResearch.marketResearch.overallConfidence}%.`,
            });
          }
          
          // Convert product/competitor research to TavilySearchResponse format
          const competitorSearchResults: TavilySearchResponse[] = [];
          if (comprehensiveResearch.productResearch) {
            for (const competitor of comprehensiveResearch.productResearch.competitors || []) {
              competitorSearchResults.push({
                query: `Competitor analysis: ${competitor.name}`,
                results: (competitor.sources || []).map(source => ({
                  title: competitor.name,
                  url: source,
                  content: `${competitor.description}. Market position: ${competitor.marketPosition}. Funding: ${competitor.funding || 'Unknown'}. Strengths: ${(competitor.strengths || []).join(', ')}. Weaknesses: ${(competitor.weaknesses || []).join(', ')}.`,
                })),
                answer: `${competitor.name} (${competitor.marketPosition}): ${competitor.description}`,
              });
            }
          }
          
          // Convert news research to TavilySearchResponse format
          const newsSearchResults: TavilySearchResponse[] = [];
          if (comprehensiveResearch.newsResearch && comprehensiveResearch.newsResearch.mentions) {
            newsSearchResults.push({
              query: `News about ${startup.name}`,
              results: comprehensiveResearch.newsResearch.mentions.map(mention => ({
                title: mention.headline,
                url: mention.source,
                content: `${mention.summary}. Date: ${mention.date}. Sentiment: ${mention.sentiment}.`,
              })),
              answer: `Found ${comprehensiveResearch.newsResearch.totalMentions} mentions. Sentiment: ${comprehensiveResearch.newsResearch.overallSentiment}.`,
            });
          }
          
          webResearchData = {
            websiteContent: comprehensiveResearch.extractedData.websiteContent,
            marketResearch: marketSearchResults,
            competitorResearch: competitorSearchResults,
            newsResearch: newsSearchResults,
            formattedForPrompt: formatResearchForEvaluation(comprehensiveResearch),
            researchContext: comprehensiveResearch.researchParameters ? {
              specificMarket: comprehensiveResearch.researchParameters.specificMarket,
              targetCustomers: comprehensiveResearch.researchParameters.targetCustomers,
              productDescription: comprehensiveResearch.researchParameters.productDescription,
              knownCompetitors: comprehensiveResearch.researchParameters.knownCompetitors,
              claimedTam: comprehensiveResearch.researchParameters.claimedMetrics.tam || null,
              claimedGrowth: comprehensiveResearch.researchParameters.claimedMetrics.growthRate || null,
              geographicFocus: comprehensiveResearch.researchParameters.geographicFocus,
              businessModel: comprehensiveResearch.researchParameters.businessModel,
              fundingStage: comprehensiveResearch.researchParameters.fundingStage,
            } : undefined,
          };
        }
      } catch (researchError: any) {
        console.error(`[Orchestrator] Comprehensive research failed (non-fatal):`, researchError.message);
        
        // Fallback to basic web scraping
        try {
          const preScrapedWebsite = startup.website ? await scrapeMultiplePages(startup.website) : [];
          if (preScrapedWebsite.length > 0) {
            const research = await researchCompany(
              startup.name, 
              startup.website || "", 
              startup.sector || "technology",
              extractionResult.content,
              preScrapedWebsite
            );
            webResearchData = {
              ...research,
              formattedForPrompt: formatResearchForPrompt(research),
            };
          }
        } catch (fallbackError: any) {
          console.error(`[Orchestrator] Fallback research also failed:`, fallbackError.message);
        }
      }

      // If files were uploaded but none could be extracted, fail early with an error
      if (extractionResult.filesAttempted > 0 && !extractionResult.success) {
        const errorMessage = `Document processing failed: Could not extract content from uploaded files. ${extractionResult.errors.join('; ')}`;
        console.error(`[Orchestrator] ${errorMessage}`);
        
        // Create a failed evaluation record with error details
        await storage.createEvaluation({
          startupId,
          overallScore: 0,
          percentileRank: 0,
          keyStrengths: [],
          keyRisks: ["Document processing failed - unable to analyze uploaded files"],
          recommendations: ["Please re-upload your documents and try again"],
          dataConfidenceNotes: errorMessage,
          founderReport: { error: errorMessage },
          investorMemo: { error: errorMessage },
          sectionScores: {
            team: 0,
            market: 0,
            product: 0,
            traction: 0,
            businessModel: 0,
            gtm: 0,
            financials: 0,
            competitiveAdvantage: 0,
            legal: 0,
            dealTerms: 0,
            exitPotential: 0,
          },
          teamData: null,
          marketData: null,
          productData: null,
          tractionData: null,
          businessModelData: null,
          gtmData: null,
          financialsData: null,
          competitiveAdvantageData: null,
          legalData: null,
          dealTermsData: null,
          exitPotentialData: null,
        });
        
        // Update startup status to indicate failure
        await storage.updateStartup(startupId, { 
          status: "submitted",
          overallScore: null,
          percentileRank: null,
        });
        
        throw new Error(errorMessage);
      }

      // Update to Stage 3: Research completed, preparing for evaluation
      await updateStage(startupId, 3);
      
      // Merge team members from startup + discovered team members from comprehensive research
      const discoveredTeamMembers = comprehensiveResearch?.extractedData.teamMembers || [];
      const existingTeamMembers = (startup.teamMembers as TeamMemberInput[]) || [];
      const mergedTeamMembers = existingTeamMembers.length > 0 ? existingTeamMembers : 
        discoveredTeamMembers.map(tm => ({
          name: tm.name,
          role: tm.role,
          linkedinUrl: tm.linkedinUrl || '',
        }));

      // Convert discovered team members (with enriched LinkedIn data from Stage 2) to cachedTeamMemberEvaluations format
      // This prevents TeamAgent from calling Unipile again
      // Handle BOTH new format (linkedinData object) AND legacy format (bio, imageUrl fields)
      const cachedTeamFromResearch = discoveredTeamMembers.map((tm: any) => ({
        name: tm.name,
        role: tm.role,
        linkedinUrl: tm.linkedinUrl,
        linkedinData: tm.linkedinData, // Contains all enriched LinkedIn profile data from Stage 2
        // Use linkedinData fields first, then fall back to legacy field names
        headline: tm.linkedinData?.headline || tm.headline || "",
        summary: tm.linkedinData?.summary || tm.bio || "",
        profilePictureUrl: tm.linkedinData?.profilePictureUrl || tm.imageUrl || "",
        location: tm.linkedinData?.location || tm.location || "",
        experience: tm.linkedinData?.experienceDetails || tm.linkedinData?.experience || [],
        education: tm.linkedinData?.educationDetails || tm.linkedinData?.education || [],
        skills: tm.linkedinData?.skills || [],
        // Preserve legacy fields for backwards compatibility
        bio: tm.bio,
        imageUrl: tm.imageUrl,
      }));

      const context: StartupContext = {
        name: startup.name,
        website: startup.website || "",
        description: startup.description || "",
        productDescription: startup.productDescription,
        teamMembers: mergedTeamMembers,
        stage: startup.stage || "unknown",
        sector: startup.sectorIndustry || startup.sector || "unknown",
        sectorIndustryGroup: startup.sectorIndustryGroup,
        sectorIndustry: startup.sectorIndustry,
        location: startup.location || "unknown",
        roundSize: startup.roundSize,
        roundCurrency: startup.roundCurrency,
        valuation: startup.valuation,
        valuationKnown: startup.valuationKnown,
        valuationType: startup.valuationType,
        raiseType: startup.raiseType,
        leadSecured: startup.leadSecured,
        leadInvestorName: startup.leadInvestorName,
        hasPreviousFunding: startup.hasPreviousFunding,
        previousFundingAmount: startup.previousFundingAmount,
        previousFundingCurrency: startup.previousFundingCurrency,
        previousInvestors: startup.previousInvestors,
        previousRoundType: startup.previousRoundType,
        deckContent: extractionResult.content,
        webResearch: webResearchData,
        // Include comprehensive research results for all agents
        comprehensiveResearch: comprehensiveResearch,
        teamDeepResearch: comprehensiveResearch?.teamResearch,
        marketDeepResearch: comprehensiveResearch?.marketResearch,
        productDeepResearch: comprehensiveResearch?.productResearch,
        newsResearch: comprehensiveResearch?.newsResearch,
        // Pass enriched team data from Stage 2 to prevent duplicate Unipile calls
        cachedTeamMemberEvaluations: cachedTeamFromResearch.length > 0 ? cachedTeamFromResearch : undefined,
      };

      // Update to Stage 4: AI Evaluation
      await updateStage(startupId, 4);
      
      // Mark all agents as running before starting parallel execution
      await startAllAgents(startupId);
      
      console.log(`[Orchestrator] Dispatching to all 11 sub-agents for: ${context.name} (deck content: ${extractionResult.content.length} chars)`);

      const [
        teamAnalysis,
        marketAnalysis,
        productAnalysis,
        tractionAnalysis,
        businessModelAnalysis,
        gtmAnalysis,
        financialsAnalysis,
        competitiveAdvantageAnalysis,
        legalAnalysis,
        dealTermsAnalysis,
        exitPotentialAnalysis,
      ] = await Promise.all([
        wrapAgentCall(startupId, "team", this.teamAgent.analyze(context)),
        wrapAgentCall(startupId, "market", this.marketAgent.analyze(context)),
        wrapAgentCall(startupId, "product", this.productAgent.analyze(context)),
        wrapAgentCall(startupId, "traction", this.tractionAgent.analyze(context)),
        wrapAgentCall(startupId, "businessModel", this.businessModelAgent.analyze(context)),
        wrapAgentCall(startupId, "gtm", this.gtmAgent.analyze(context)),
        wrapAgentCall(startupId, "financials", this.financialsAgent.analyze(context)),
        wrapAgentCall(startupId, "competitiveAdvantage", this.competitiveAdvantageAgent.analyze(context)),
        wrapAgentCall(startupId, "legal", this.legalRegulatoryAgent.analyze(context)),
        wrapAgentCall(startupId, "dealTerms", this.dealTermsAgent.analyze(context)),
        wrapAgentCall(startupId, "exitPotential", this.exitPotentialAgent.analyze(context)),
      ]);

      console.log("[Orchestrator] All 11 sub-agents complete, starting synthesis...");

      // Build competitor research string for synthesis
      let competitorResearchStr = "No competitor research available.";
      if (context.webResearch?.competitorResearch && context.webResearch.competitorResearch.length > 0) {
        competitorResearchStr = context.webResearch.competitorResearch
          .map(search => {
            let formatted = `Query: ${search.query}\n`;
            if (search.answer) formatted += `Summary: ${search.answer}\n`;
            formatted += search.results.map(r => `- ${r.title}: ${r.content.substring(0, 300)}`).join("\n");
            return formatted;
          })
          .join("\n\n");
      }

      // Update to Stage 5: Synthesis
      await updateStage(startupId, 5);
      
      // Run final synthesis with all 11 agent outputs
      console.log("[Orchestrator] Starting final synthesis...");
      const synthesis = await this.synthesisAgent.synthesize(context, {
        team: teamAnalysis,
        market: marketAnalysis,
        product: productAnalysis,
        traction: tractionAnalysis,
        businessModel: businessModelAnalysis,
        gtm: gtmAnalysis,
        financials: financialsAnalysis,
        competitiveAdvantage: competitiveAdvantageAnalysis,
        legal: legalAnalysis,
        dealTerms: dealTermsAnalysis,
        exitPotential: exitPotentialAnalysis,
      });

      console.log("[Orchestrator] Final synthesis complete");
      
      // Debug logging for score extraction
      console.log("[Orchestrator] Synthesis sectionScores:", JSON.stringify((synthesis as any).sectionScores));
      console.log("[Orchestrator] Agent overallScores - Team:", (teamAnalysis as any).overallScore, 
        "Market:", (marketAnalysis as any).overallScore, 
        "Product:", (productAnalysis as any).overallScore);
      console.log("[Orchestrator] Extracted scores - Team:", extractAgentScore(teamAnalysis, 'team'),
        "Market:", extractAgentScore(marketAnalysis, 'market'),
        "Product:", extractAgentScore(productAnalysis, 'product'));

      // Helper function to generate background from LinkedIn data
      const generateBackground = (member: any): string => {
        if (!member) return "";
        const parts: string[] = [];
        
        // Get current position
        if (member.headline) {
          parts.push(member.headline);
        } else if (member.experience?.[0]) {
          const exp = member.experience[0];
          parts.push(`${exp.title || exp.position || "Professional"} at ${exp.company || "current company"}`);
        }
        
        // Add education if available
        if (member.education?.[0]) {
          const edu = member.education[0];
          const degree = edu.degree || edu.fieldOfStudy || "";
          if (edu.school) {
            parts.push(`${degree ? degree + " from " : ""}${edu.school}`);
          }
        }
        
        // Add experience summary
        if (member.experience && member.experience.length > 1) {
          const companies = member.experience.slice(0, 3).map((e: any) => e.company).filter(Boolean);
          if (companies.length > 0) {
            parts.push(`Previously at ${companies.join(", ")}`);
          }
        }
        
        return parts.length > 0 ? parts.join(". ") + "." : "";
      };

      // Helper function to generate relevant experience assessment
      const generateRelevantExperience = (member: any, ctx: StartupContext): string => {
        if (!member) return "";
        const sector = ctx.sector || "this industry";
        const companyName = ctx.name || "the company";
        
        // Check for relevant experience in their history
        const experiences = member.experience || [];
        const relevantRoles: string[] = [];
        
        for (const exp of experiences) {
          const title = (exp.title || exp.position || "").toLowerCase();
          const company = (exp.company || "").toLowerCase();
          const desc = (exp.description || "").toLowerCase();
          
          // Check for relevant keywords
          if (title.includes("founder") || title.includes("ceo") || title.includes("cto") || 
              title.includes("director") || title.includes("head") || title.includes("vp") ||
              title.includes("manager") || title.includes("lead")) {
            relevantRoles.push(`${exp.title || exp.position} at ${exp.company || "previous company"}`);
          }
        }
        
        if (relevantRoles.length > 0) {
          return `Brings experience from ${relevantRoles.slice(0, 2).join(" and ")}, which may contribute to ${companyName}'s growth in ${sector}.`;
        }
        
        // Generic assessment based on role
        const role = (member.role || "").toLowerCase();
        if (role.includes("sales") || role.includes("partnership")) {
          return `Sales and partnership experience supporting ${companyName}'s go-to-market efforts.`;
        } else if (role.includes("marketing")) {
          return `Marketing expertise supporting ${companyName}'s brand and customer acquisition.`;
        } else if (role.includes("operation")) {
          return `Operational experience supporting ${companyName}'s scaling and efficiency.`;
        } else if (role.includes("engineer") || role.includes("tech") || role.includes("developer")) {
          return `Technical expertise supporting ${companyName}'s product development.`;
        }
        
        return `Team member contributing to ${companyName}'s mission in the ${sector} space.`;
      };

      const enrichedMembers = (teamAnalysis as any).enrichedMembers || context.teamMembers || [];
      // Get founder evaluations - check members (new format), teamEvaluation.members (legacy), or founders (legacy)
      const founderEvaluations = (teamAnalysis as any).members || (teamAnalysis as any).teamEvaluation?.members || (teamAnalysis as any).founders || [];
      const teamMemberEvaluations = enrichedMembers.map((member: any) => {
        const founderData = founderEvaluations.find(
          (f: any) => f.name?.toLowerCase().includes(member.name?.toLowerCase()) || 
                      member.name?.toLowerCase().includes(f.name?.toLowerCase())
        );
        return {
          name: member.name,
          role: member.role,
          linkedinUrl: member.linkedinUrl,
          // Enriched LinkedIn data from Unipile
          headline: member.headline || founderData?.headline || "",
          summary: member.summary || founderData?.summary || "",
          location: member.location || founderData?.location || "",
          profilePictureUrl: member.profilePictureUrl || "",
          // Experience & Education arrays for UI timelines
          experience: member.experience || [],
          education: member.education || [],
          skills: member.skills || founderData?.skills || [],
          // Legacy fields for compatibility
          currentPosition: founderData?.currentPosition || member.experience?.[0]?.title || "",
          currentCompany: founderData?.currentCompany || member.experience?.[0]?.company || "",
          yearsExperience: founderData?.yearsExperience || null,
          previousCompanies: founderData?.previousCompanies || [],
          // AI-generated analysis
          fmfScore: founderData?.fmfScore || founderData?.founderMarketFitScore || null,
          relevantExperience: founderData?.relevantExperience || generateRelevantExperience(member, context),
          background: founderData?.background || generateBackground(member),
        };
      });

      // Log LinkedIn sources for each team member
      for (const member of enrichedMembers) {
        if (member.linkedinUrl) {
          sourceTracker.logLinkedIn(
            member.linkedinUrl,
            member.name,
            "TeamAgent",
            `Profile data retrieved for ${member.role}`
          );
        }
      }

      // Log each AI agent analysis
      sourceTracker.logAPI("OpenAI GPT-5.2", "TeamAgent", "Team composition and founder-market fit analysis", `Score: ${(teamAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "MarketAgent", "Market opportunity and TAM/SAM/SOM analysis", `Score: ${(marketAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "ProductAgent", "Product differentiation and technology analysis", `Score: ${(productAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "TractionAgent", "Traction metrics and growth analysis", `Score: ${(tractionAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "BusinessModelAgent", "Business model and unit economics analysis", `Score: ${(businessModelAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "GTMAgent", "Go-to-market strategy analysis", `Score: ${(gtmAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "FinancialsAgent", "Financial health and capital efficiency analysis", `Score: ${(financialsAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "CompetitiveAdvantageAgent", "Competitive moat and positioning analysis", `Score: ${(competitiveAdvantageAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "LegalRegulatoryAgent", "Legal, regulatory and IP analysis", `Score: ${(legalAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "DealTermsAgent", "Deal terms and valuation analysis", `Score: ${(dealTermsAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "ExitPotentialAgent", "Exit potential and M&A analysis", `Score: ${(exitPotentialAnalysis as any).overallScore}`);
      sourceTracker.logAPI("OpenAI GPT-5.2", "SynthesisAgent", "Final synthesis and investor memo generation", `Percentile: ${(synthesis as any).percentileRank}`);

      console.log(`[Orchestrator] Sources tracked: ${sourceTracker.getSources().length} entries`);

      await storage.upsertEvaluation({
        startupId,
        websiteData: {
          companyDescription: context.description,
          productDescription: (productAnalysis as any).productDifferentiation?.assessment || "",
          targetMarket: (marketAnalysis as any).marketDynamics || "",
          keyFeatures: [],
          messagingClarity: (productAnalysis as any).productDifferentiation?.score || 50,
          overallScore: (productAnalysis as any).overallScore || 50,
        } as any,
        websiteScore: (productAnalysis as any).overallScore || 50,
        messagingClarityScore: (productAnalysis as any).productDifferentiation?.score || 50,
        deckData: {
          hasTeamSlide: true,
          hasMarketSlide: true,
          hasTractionSlide: true,
          hasBusinessModelSlide: true,
          hasCompetitionSlide: true,
          hasFinancialsSlide: false,
          missingSlides: [],
          overallScore: 70,
        } as any,
        deckScore: 70,
        missingSlideFlags: [] as any,
        marketData: marketAnalysis as any,
        marketScore: (synthesis as any).sectionScores?.market ?? extractAgentScore(marketAnalysis, 'market'),
        tamValidation: {
          stated: (marketAnalysis as any).statedTAM,
          validated: (marketAnalysis as any).validatedTAM,
          source: (marketAnalysis as any).tamSource,
        } as any,
        marketCredibility: (marketAnalysis as any).marketCredibility ?? 50,
        teamData: teamAnalysis as any,
        teamMemberEvaluations: teamMemberEvaluations as any,
        teamScore: (synthesis as any).sectionScores?.team ?? extractAgentScore(teamAnalysis, 'team'),
        founderMarketFit: (teamAnalysis as any).founderMarketFit ?? 50,
        executionRiskNotes: Array.isArray((teamAnalysis as any).executionRiskNotes) 
          ? (teamAnalysis as any).executionRiskNotes.join("; ")
          : (teamAnalysis as any).executionRiskNotes || "",
        teamComposition: (teamAnalysis as any).teamComposition as any,
        tractionData: tractionAnalysis as any,
        tractionScore: (synthesis as any).sectionScores?.traction ?? extractAgentScore(tractionAnalysis, 'traction'),
        momentumScore: (tractionAnalysis as any).momentum ?? 50,
        tractionCredibility: (tractionAnalysis as any).credibility ?? 50,
        productData: productAnalysis as any,
        productScore: (synthesis as any).sectionScores?.product ?? extractAgentScore(productAnalysis, 'product'),
        productSummary: (productAnalysis as any).productSummary || null,
        extractedFeatures: (productAnalysis as any).extractedFeatures || null,
        extractedTechStack: (productAnalysis as any).extractedTechStack || null,
        extractedDemoVideos: (productAnalysis as any).extractedDemoVideos || null,
        businessModelData: businessModelAnalysis as any,
        businessModelScore: (synthesis as any).sectionScores?.businessModel ?? extractAgentScore(businessModelAnalysis, 'businessModel'),
        gtmData: gtmAnalysis as any,
        gtmScore: (synthesis as any).sectionScores?.gtm ?? extractAgentScore(gtmAnalysis, 'gtm'),
        financialsData: financialsAnalysis as any,
        financialsScore: (synthesis as any).sectionScores?.financials ?? extractAgentScore(financialsAnalysis, 'financials'),
        competitiveAdvantageData: competitiveAdvantageAnalysis as any,
        competitiveAdvantageScore: (synthesis as any).sectionScores?.competitiveAdvantage ?? extractAgentScore(competitiveAdvantageAnalysis, 'competitiveAdvantage'),
        legalData: legalAnalysis as any,
        legalScore: (synthesis as any).sectionScores?.legal ?? extractAgentScore(legalAnalysis, 'legal'),
        dealTermsData: dealTermsAnalysis as any,
        dealTermsScore: (synthesis as any).sectionScores?.dealTerms ?? extractAgentScore(dealTermsAnalysis, 'dealTerms'),
        exitPotentialData: exitPotentialAnalysis as any,
        exitPotentialScore: (synthesis as any).sectionScores?.exitPotential ?? extractAgentScore(exitPotentialAnalysis, 'exitPotential'),
        // Store computed section scores (uses synthesis if valid, else extracts from agents)
        sectionScores: {
          team: (synthesis as any).sectionScores?.team ?? extractAgentScore(teamAnalysis, 'team'),
          market: (synthesis as any).sectionScores?.market ?? extractAgentScore(marketAnalysis, 'market'),
          product: (synthesis as any).sectionScores?.product ?? extractAgentScore(productAnalysis, 'product'),
          traction: (synthesis as any).sectionScores?.traction ?? extractAgentScore(tractionAnalysis, 'traction'),
          businessModel: (synthesis as any).sectionScores?.businessModel ?? extractAgentScore(businessModelAnalysis, 'businessModel'),
          gtm: (synthesis as any).sectionScores?.gtm ?? extractAgentScore(gtmAnalysis, 'gtm'),
          financials: (synthesis as any).sectionScores?.financials ?? extractAgentScore(financialsAnalysis, 'financials'),
          competitiveAdvantage: (synthesis as any).sectionScores?.competitiveAdvantage ?? extractAgentScore(competitiveAdvantageAnalysis, 'competitiveAdvantage'),
          legal: (synthesis as any).sectionScores?.legal ?? extractAgentScore(legalAnalysis, 'legal'),
          dealTerms: (synthesis as any).sectionScores?.dealTerms ?? extractAgentScore(dealTermsAnalysis, 'dealTerms'),
          exitPotential: (synthesis as any).sectionScores?.exitPotential ?? extractAgentScore(exitPotentialAnalysis, 'exitPotential'),
        } as any,
        overallScore: 0, // Placeholder - will be computed with stage-specific weights below
        percentileRank: (synthesis as any).percentileRank || 50,
        keyStrengths: (synthesis as any).keyStrengths as any,
        keyRisks: (synthesis as any).keyRisks as any,
        recommendations: (synthesis as any).recommendations as any,
        executiveSummary: (synthesis as any).executiveSummary || null,
        investorMemo: (synthesis as any).investorMemo as any,
        founderReport: (synthesis as any).founderReport as any,
        dataConfidenceNotes: `Full 11-section analysis performed by multi-agent system with ${isUnipileConfigured() ? 'real LinkedIn data' : 'limited LinkedIn data'}`,
        sources: sourceTracker.getSources() as any,
        // Cache web research and deck content to avoid re-scraping on re-analysis
        webResearchData: webResearchData as any,
        deckContent: extractionResult.content || null,
        deckFilesHash: currentFilesHash,
        // Cache comprehensive research to avoid re-scraping website
        comprehensiveResearchData: comprehensiveResearch as any,
        websiteScraped: startup.website || null,
      });

      // Compute weighted overall score using stage-specific weights from database
      // Use nullish coalescing (??) to properly handle 0 as a valid score
      const sectionScores: SectionScores = {
        team: (synthesis as any).sectionScores?.team ?? extractAgentScore(teamAnalysis, 'team'),
        market: (synthesis as any).sectionScores?.market ?? extractAgentScore(marketAnalysis, 'market'),
        product: (synthesis as any).sectionScores?.product ?? extractAgentScore(productAnalysis, 'product'),
        traction: (synthesis as any).sectionScores?.traction ?? extractAgentScore(tractionAnalysis, 'traction'),
        businessModel: (synthesis as any).sectionScores?.businessModel ?? extractAgentScore(businessModelAnalysis, 'businessModel'),
        gtm: (synthesis as any).sectionScores?.gtm ?? extractAgentScore(gtmAnalysis, 'gtm'),
        financials: (synthesis as any).sectionScores?.financials ?? extractAgentScore(financialsAnalysis, 'financials'),
        competitiveAdvantage: (synthesis as any).sectionScores?.competitiveAdvantage ?? extractAgentScore(competitiveAdvantageAnalysis, 'competitiveAdvantage'),
        legal: (synthesis as any).sectionScores?.legal ?? extractAgentScore(legalAnalysis, 'legal'),
        dealTerms: (synthesis as any).sectionScores?.dealTerms ?? extractAgentScore(dealTermsAnalysis, 'dealTerms'),
        exitPotential: (synthesis as any).sectionScores?.exitPotential ?? extractAgentScore(exitPotentialAnalysis, 'exitPotential'),
      };
      
      // Compute overall score using stage-appropriate weights from database
      const startupStage = startup.stage || "seed";
      const computedOverallScore = await computeStartupScore(sectionScores, startupStage);
      
      console.log(`[Orchestrator] Computed weighted score: ${computedOverallScore} (stage: ${startupStage})`);

      // Determine final status: auto-approve for private investor/admin submissions
      const finalStatus = this.autoApprove ? "approved" : "pending_review";
      
      await storage.updateStartup(startupId, {
        status: finalStatus,
        overallScore: computedOverallScore,
        percentileRank: (synthesis as any).percentileRank || 50,
      });
      
      // Mark analysis progress as complete
      await completeAnalysis(startupId);
      
      // Create notification for the user who submitted the startup
      try {
        await storage.createNotification({
          userId: startup.founderId,
          type: "analysis_complete",
          title: "Analysis Complete",
          message: `The AI analysis for "${startup.name}" is complete. Score: ${computedOverallScore}/100.`,
          startupId: startupId,
          isRead: false,
        });
        console.log(`[Orchestrator] Created notification for user ${startup.founderId}`);
      } catch (notificationError) {
        console.error(`[Orchestrator] Failed to create notification:`, notificationError);
      }
      
      // Also update the evaluation with the computed score
      const existingEval = await storage.getEvaluation(startupId);
      if (existingEval) {
        await storage.updateEvaluation(existingEval.id, {
          overallScore: computedOverallScore,
        });
      }

      console.log(`[Orchestrator] Full 11-section evaluation complete for startup ${startupId} (status: ${finalStatus})`);
      
      // Run thesis alignment for auto-approved investor submissions
      if (this.autoApprove && startup.submittedByRole === "investor") {
        try {
          // Try to find investor profile by founderId first
          let investorProfile = await storage.getInvestorProfile(startup.founderId);
          
          // For email/WhatsApp submissions where founderId is 'agent', look up by contactEmail
          if (!investorProfile && startup.founderId === 'agent' && startup.contactEmail) {
            console.log(`[Orchestrator] Looking up investor by contactEmail: ${startup.contactEmail}`);
            investorProfile = await storage.getInvestorProfileByEmail(startup.contactEmail);
          }
          
          if (investorProfile) {
            console.log(`[Orchestrator] Running thesis alignment for investor submission by ${investorProfile.fundName}`);
            const { runThesisAlignmentForInvestorSubmission } = await import("./investor-agents");
            await runThesisAlignmentForInvestorSubmission(startupId, investorProfile.id);
            
            // Create a match if one doesn't exist (for email/WhatsApp submissions)
            const existingMatch = await storage.getMatchByInvestorAndStartup(investorProfile.id, startupId);
            if (!existingMatch) {
              console.log(`[Orchestrator] Creating match for email/WhatsApp submission from ${investorProfile.fundName}`);
              await storage.createMatch({
                investorId: investorProfile.id,
                startupId: startupId,
                status: 'new',
              });
            }
          }
        } catch (alignmentError) {
          console.error(`[Orchestrator] Thesis alignment failed for investor submission:`, alignmentError);
          // Don't fail the whole evaluation if alignment fails
        }
      }
      
      // Run thesis alignment for portal submissions (startups that have investor matches)
      try {
        const matches = await storage.getMatchesByStartup(startupId);
        if (matches && matches.length > 0) {
          console.log(`[Orchestrator] Found ${matches.length} investor match(es) for startup ${startupId}, running thesis alignment`);
          const { runThesisAlignmentForInvestorSubmission } = await import("./investor-agents");
          for (const match of matches) {
            // Only run if thesis alignment hasn't been done yet (explicit null/undefined check)
            if (match.thesisFitScore === null || match.thesisFitScore === undefined) {
              console.log(`[Orchestrator] Running thesis alignment for investor ${match.investorId}`);
              await runThesisAlignmentForInvestorSubmission(startupId, match.investorId);
            } else {
              console.log(`[Orchestrator] Skipping thesis alignment for investor ${match.investorId} - already has score ${match.thesisFitScore}`);
            }
          }
        }
      } catch (matchAlignmentError) {
        console.error(`[Orchestrator] Thesis alignment failed for matched investors:`, matchAlignmentError);
        // Don't fail the whole evaluation if alignment fails
      }
      
    } catch (error) {
      console.error(`[Orchestrator] Evaluation failed for startup ${startupId}:`, error);
      await storage.updateStartup(startupId, { status: "submitted" });
      throw error;
    }
  }
}

export async function analyzeStartup(startupId: number, options?: { autoApprove?: boolean; fromStage?: number }): Promise<void> {
  const orchestrator = new StartupEvaluationOrchestrator(options);
  await orchestrator.evaluate(startupId);
}

// Valid section names for re-analysis
export type SectionName = 
  | "team" 
  | "market" 
  | "product" 
  | "traction" 
  | "businessModel" 
  | "gtm" 
  | "financials" 
  | "competitiveAdvantage" 
  | "legal" 
  | "dealTerms" 
  | "exitPotential";

// Map section names to agent classes and data field names
const SECTION_CONFIG: Record<SectionName, { dataField: string; scoreField: string }> = {
  team: { dataField: "teamData", scoreField: "teamScore" },
  market: { dataField: "marketData", scoreField: "marketScore" },
  product: { dataField: "productData", scoreField: "productScore" },
  traction: { dataField: "tractionData", scoreField: "tractionScore" },
  businessModel: { dataField: "businessModelData", scoreField: "businessModelScore" },
  gtm: { dataField: "gtmData", scoreField: "gtmScore" },
  financials: { dataField: "financialsData", scoreField: "financialsScore" },
  competitiveAdvantage: { dataField: "competitiveAdvantageData", scoreField: "competitiveAdvantageScore" },
  legal: { dataField: "legalData", scoreField: "legalScore" },
  dealTerms: { dataField: "dealTermsData", scoreField: "dealTermsScore" },
  exitPotential: { dataField: "exitPotentialData", scoreField: "exitPotentialScore" },
};

/**
 * Re-analyze a single section of an evaluation with optional admin feedback
 */
export async function reanalyzeSection(
  startupId: number, 
  section: SectionName, 
  adminComment?: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[ReanalyzeSection] Starting re-analysis of ${section} for startup ${startupId}`);
  
  try {
    const startup = await storage.getStartup(startupId);
    if (!startup) {
      return { success: false, error: "Startup not found" };
    }

    const evaluation = await storage.getEvaluation(startupId);
    if (!evaluation) {
      return { success: false, error: "No existing evaluation found" };
    }

    // Get config for this section
    const config = SECTION_CONFIG[section];

    // Get the previous analysis for this section
    const previousAnalysis = (evaluation as any)[config.dataField];
    const previousScore = (evaluation as any)[config.scoreField];

    // Use cached deck content if available, otherwise extract
    let deckContent: string | undefined;
    if (evaluation.deckContent) {
      console.log(`[ReanalyzeSection] Using cached deck content`);
      deckContent = evaluation.deckContent;
    } else {
      const files = startup.files as Array<{name: string; path: string; type: string}> | null;
      const extractionResult = await extractDeckContent(files);
      deckContent = extractionResult.success ? extractionResult.content : undefined;
    }
    
    // Use cached web research if available, otherwise skip (don't re-scrape)
    let webResearchData: WebResearchData | undefined;
    if (evaluation.webResearchData) {
      console.log(`[ReanalyzeSection] Using cached web research data`);
      const cached = evaluation.webResearchData as any;
      webResearchData = {
        ...cached,
        formattedForPrompt: cached.formattedForPrompt || formatResearchForPrompt(cached),
      };
    } else {
      console.log(`[ReanalyzeSection] No cached web research data available, skipping re-scrape`);
    }

    // Format the previous analysis for the agent to review
    const previousAnalysisSummary = previousAnalysis 
      ? `\n=== PREVIOUS ANALYSIS (Score: ${previousScore || 'N/A'}/100) ===\n${JSON.stringify(previousAnalysis, null, 2)}\n`
      : "";

    // Combine admin feedback with previous analysis context
    const adminFeedbackWithContext = adminComment
      ? `${previousAnalysisSummary}\n=== ADMIN FEEDBACK ===\nThe reviewing analyst has provided this guidance for improving the analysis:\n${adminComment}\n\nPlease revise your analysis based on this feedback while maintaining analytical rigor.`
      : undefined;

    // For team section re-analysis, include cached LinkedIn data to avoid redundant Unipile API calls
    const cachedTeamMemberEvaluations = section === "team" 
      ? (evaluation.teamMemberEvaluations as any[] | null) || undefined
      : undefined;
    
    if (section === "team" && cachedTeamMemberEvaluations && cachedTeamMemberEvaluations.length > 0) {
      console.log(`[ReanalyzeSection] Using cached LinkedIn data for ${cachedTeamMemberEvaluations.length} team members`);
    }

    const context: StartupContext = {
      name: startup.name,
      description: startup.description || "",
      productDescription: startup.productDescription,
      website: startup.website || "",
      sector: startup.sectorIndustry || startup.sector || "Technology",
      sectorIndustryGroup: startup.sectorIndustryGroup,
      sectorIndustry: startup.sectorIndustry,
      stage: startup.stage || "Seed",
      deckContent,
      teamMembers: startup.teamMembers as any[] || [],
      roundSize: startup.roundSize || null,
      roundCurrency: startup.roundCurrency,
      valuation: startup.valuation || null,
      valuationKnown: startup.valuationKnown,
      valuationType: startup.valuationType,
      raiseType: startup.raiseType,
      leadSecured: startup.leadSecured,
      leadInvestorName: startup.leadInvestorName,
      hasPreviousFunding: startup.hasPreviousFunding,
      previousFundingAmount: startup.previousFundingAmount,
      previousFundingCurrency: startup.previousFundingCurrency,
      previousInvestors: startup.previousInvestors,
      previousRoundType: startup.previousRoundType,
      location: startup.location || "",
      webResearch: webResearchData,
      adminFeedback: adminFeedbackWithContext, // Pass previous analysis + admin feedback
      cachedTeamMemberEvaluations, // Cached LinkedIn data to avoid redundant API calls during team re-analysis
    };

    // Re-run the specific agent
    let newAnalysis: any;
    
    switch (section) {
      case "team":
        newAnalysis = await new TeamAgent().analyze(context);
        break;
      case "market":
        newAnalysis = await new MarketAgent().analyze(context);
        break;
      case "product":
        newAnalysis = await new ProductAgent().analyze(context);
        break;
      case "traction":
        newAnalysis = await new TractionAgent().analyze(context);
        break;
      case "businessModel":
        newAnalysis = await new BusinessModelAgent().analyze(context);
        break;
      case "gtm":
        newAnalysis = await new GTMAgent().analyze(context);
        break;
      case "financials":
        newAnalysis = await new FinancialsAgent().analyze(context);
        break;
      case "competitiveAdvantage":
        newAnalysis = await new CompetitiveAdvantageAgent().analyze(context);
        break;
      case "legal":
        newAnalysis = await new LegalRegulatoryAgent().analyze(context);
        break;
      case "dealTerms":
        newAnalysis = await new DealTermsAgent().analyze(context);
        break;
      case "exitPotential":
        newAnalysis = await new ExitPotentialAgent().analyze(context);
        break;
      default:
        return { success: false, error: `Unknown section: ${section}` };
    }

    console.log(`[ReanalyzeSection] ${section} agent complete, updating evaluation...`);

    // Update the evaluation with new section data
    const updateData: any = {
      [config.dataField]: newAnalysis,
      [config.scoreField]: newAnalysis.overallScore || 50,
      updatedAt: new Date(),
    };

    // Update admin feedback
    const existingFeedback = (evaluation.adminFeedback as any) || {};
    if (adminComment) {
      updateData.adminFeedback = {
        ...existingFeedback,
        [section]: { comment: adminComment, lastUpdated: new Date().toISOString() },
      };
    }

    // Update sectionScores
    const existingScores = (evaluation.sectionScores as any) || {};
    updateData.sectionScores = {
      ...existingScores,
      [section]: newAnalysis.overallScore || 50,
    };

    await storage.upsertEvaluation({
      startupId,
      ...updateData,
    });

    console.log(`[ReanalyzeSection] Successfully updated ${section} for startup ${startupId}`);
    return { success: true };

  } catch (error: any) {
    console.error(`[ReanalyzeSection] Error re-analyzing ${section}:`, error);
    return { success: false, error: error.message };
  }
}
