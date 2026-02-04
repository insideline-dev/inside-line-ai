// Using global fetch (Node 18+)
import { storage } from "./storage";

// Cache duration: 7 days in milliseconds
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Normalize LinkedIn URL for consistent caching
function normalizeLinkedInUrl(url: string): string {
  try {
    let normalized = url.toLowerCase().trim();
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');
    // Normalize protocol to https
    normalized = normalized.replace(/^http:\/\//, 'https://');
    // Normalize www subdomain
    normalized = normalized.replace('://www.linkedin.com', '://linkedin.com');
    return normalized;
  } catch {
    return url.toLowerCase().trim().replace(/\/$/, '');
  }
}

interface UnipileExperience {
  company_id?: string;
  company?: string;
  position?: string;
  location?: string;
  description?: string;
  start?: string;
  end?: string | null;
}

interface UnipileEducation {
  school_id?: string;
  school?: string;
  degree?: string;
  field_of_study?: string;
  start?: string;
  end?: string;
}

interface UnipileSkill {
  name: string;
  endorsement_count?: number;
}

export interface UnipileProfile {
  object: string;
  provider: string;
  provider_id: string;
  public_identifier: string;
  first_name: string;
  last_name: string;
  headline?: string;
  summary?: string;
  location?: string;
  industry?: string;
  is_premium?: boolean;
  is_influencer?: boolean;
  is_creator?: boolean;
  websites?: string[];
  // Unipile returns work experience as "work_experience"
  work_experience?: UnipileExperience[];
  positions?: UnipileExperience[]; // Legacy fallback
  experience?: UnipileExperience[]; // Legacy fallback
  education?: UnipileEducation[];
  skills?: UnipileSkill[];
  connection_count?: number;
  follower_count?: number;
  profile_picture_url?: string;
  profile_picture_url_large?: string;
  background_picture_url?: string;
}

export interface LinkedInProfileData {
  name: string;
  headline: string;
  summary: string;
  location: string;
  currentPosition: string;
  currentCompany: string;
  yearsExperience: number | null;
  education: string[];
  previousCompanies: string[];
  skills: string[];
  profilePictureUrl?: string;
  experienceDetails: {
    company: string;
    position: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    duration: string;
    description: string;
    isCurrent?: boolean;
  }[];
  educationDetails: {
    school: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
  }[];
}

function extractIdentifierFromUrl(linkedinUrl: string): string | null {
  try {
    const patterns = [
      /linkedin\.com\/in\/([^/?]+)/,
      /linkedin\.com\/pub\/([^/?]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = linkedinUrl.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}

function calculateYearsExperience(experience: UnipileExperience[]): number | null {
  if (!experience || experience.length === 0) return null;
  
  let totalMonths = 0;
  const now = new Date();
  
  for (const exp of experience) {
    if (!exp.start) continue;
    
    const startParts = exp.start.split('/');
    if (startParts.length < 3) continue;
    
    const startDate = new Date(
      parseInt(startParts[2]),
      parseInt(startParts[0]) - 1,
      parseInt(startParts[1])
    );
    
    let endDate = now;
    if (exp.end) {
      const endParts = exp.end.split('/');
      if (endParts.length >= 3) {
        endDate = new Date(
          parseInt(endParts[2]),
          parseInt(endParts[0]) - 1,
          parseInt(endParts[1])
        );
      }
    }
    
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                   (endDate.getMonth() - startDate.getMonth());
    totalMonths += Math.max(0, months);
  }
  
  return Math.round(totalMonths / 12);
}

function formatExperienceDuration(exp: UnipileExperience): string {
  if (!exp.start) return "Unknown duration";
  
  const startYear = exp.start.split('/')[2] || exp.start;
  const endYear = exp.end ? (exp.end.split('/')[2] || exp.end) : "Present";
  
  return `${startYear} - ${endYear}`;
}

function cleanCompanyName(companyName: string): string {
  return companyName
    .replace(/[0-9]+/g, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomainName(website?: string): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    const hostname = url.hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[0];
    }
    return hostname;
  } catch {
    return null;
  }
}

async function tryLinkedInSearch(dsn: string, apiKey: string, accountId: string, query: string): Promise<LinkedInProfileData | null> {
  const url = `https://${dsn}/api/v1/linkedin/search?account_id=${encodeURIComponent(accountId)}`;
  
  console.log(`[unipile] Searching LinkedIn for: ${query}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'accept': 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      api: 'classic',
      category: 'people',
      keywords: query,
      limit: 5
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log(`[unipile] Search API error ${response.status}: ${errorText}`);
    return null;
  }
  
  const searchResults = await response.json();
  const items = searchResults.items || searchResults.data || searchResults;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    console.log(`[unipile] No search results for: ${query}`);
    return null;
  }
  
  const firstResult = items[0];
  const profileId = firstResult.public_identifier || firstResult.provider_id || firstResult.id;
  
  if (!profileId) {
    console.log(`[unipile] No profile identifier in search result`);
    console.log(`[unipile] First result keys: ${Object.keys(firstResult).join(', ')}`);
    return null;
  }
  
  console.log(`[unipile] Found profile: ${profileId}, fetching full details...`);
  return await fetchLinkedInProfileById(profileId);
}

export async function searchLinkedInByName(name: string, companyName?: string, website?: string): Promise<LinkedInProfileData | null> {
  const dsn = process.env.UNIPILE_DSN;
  const apiKey = process.env.UNIPILE_API_KEY;
  const accountId = process.env.UNIPILE_ACCOUNT_ID;
  
  if (!dsn || !apiKey || !accountId) {
    console.log("[unipile] Missing Unipile credentials for search");
    return null;
  }
  
  const searchQueries: string[] = [];
  
  if (companyName) {
    const cleanedCompany = cleanCompanyName(companyName);
    if (cleanedCompany) {
      searchQueries.push(`${name} ${cleanedCompany}`);
    }
  }
  
  const domainName = extractDomainName(website);
  if (domainName && (!companyName || cleanCompanyName(companyName).toLowerCase() !== domainName.toLowerCase())) {
    searchQueries.push(`${name} ${domainName}`);
  }
  
  searchQueries.push(name);
  
  console.log(`[unipile] Will try ${searchQueries.length} search queries for: ${name}`);
  
  for (const query of searchQueries) {
    try {
      const result = await tryLinkedInSearch(dsn, apiKey, accountId, query);
      if (result) {
        return result;
      }
    } catch (error) {
      console.error(`[unipile] Error with query "${query}":`, error);
    }
  }
  
  console.log(`[unipile] All search attempts failed for: ${name}`);
  return null;
}

async function fetchLinkedInProfileById(identifier: string): Promise<LinkedInProfileData | null> {
  // Construct LinkedIn URL from identifier for cache lookup
  const linkedinUrl = `https://linkedin.com/in/${identifier}`;
  const normalizedUrl = normalizeLinkedInUrl(linkedinUrl);
  
  // Check cache first
  try {
    const cached = await storage.getCachedLinkedinProfile(normalizedUrl);
    if (cached && cached.profileData) {
      console.log(`[unipile] Cache hit for profile ID: ${identifier}`);
      return cached.profileData as LinkedInProfileData;
    }
  } catch (cacheError) {
    console.log(`[unipile] Cache lookup failed for ${identifier}:`, cacheError);
  }
  
  const dsn = process.env.UNIPILE_DSN;
  const apiKey = process.env.UNIPILE_API_KEY;
  const accountId = process.env.UNIPILE_ACCOUNT_ID;
  
  if (!dsn || !apiKey || !accountId) return null;
  
  try {
    const url = `https://${dsn}/api/v1/users/${encodeURIComponent(identifier)}?account_id=${encodeURIComponent(accountId)}&linkedin_sections=*`;
    
    console.log(`[unipile] Fetching full profile for: ${identifier}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[unipile] Profile fetch failed for ${identifier}: ${response.status} - ${errorText}`);
      return null;
    }
    
    const profile = await response.json() as UnipileProfile;
    
    // Debug logging
    console.log(`[unipile] Raw profile positions count: ${profile.positions?.length || 0}`);
    console.log(`[unipile] Raw profile experience count: ${profile.experience?.length || 0}`);
    console.log(`[unipile] Raw profile education count: ${profile.education?.length || 0}`);
    const workExp2 = profile.positions || profile.experience || [];
    if (workExp2.length > 0) {
      console.log(`[unipile] First work experience entry:`, JSON.stringify(workExp2[0]));
    }
    
    const profileData = buildProfileData(profile);
    console.log(`[unipile] Built experienceDetails count: ${profileData.experienceDetails?.length || 0}`);
    console.log(`[unipile] Successfully fetched profile for ${profileData.name} (${identifier})`);
    
    // Cache the profile using the LinkedIn URL
    try {
      const expiresAt = new Date(Date.now() + CACHE_DURATION_MS);
      await storage.cacheLinkedinProfile({
        linkedinUrl: normalizedUrl,
        linkedinIdentifier: identifier,
        profileData: profileData,
        fetchedAt: new Date(),
        expiresAt: expiresAt,
      });
      console.log(`[unipile] Cached profile for ${profileData.name} (searched by ID)`);
    } catch (cacheError) {
      console.log(`[unipile] Failed to cache profile:`, cacheError);
    }
    
    return profileData;
    
  } catch (error) {
    console.error(`[unipile] Error fetching profile for ${identifier}:`, error);
    return null;
  }
}

function parseExperienceDate(dateStr?: string | null): string | undefined {
  if (!dateStr) return undefined;
  const parts = dateStr.split('/');
  if (parts.length >= 3) {
    return parts[2]; // Return just the year
  }
  return dateStr;
}

function buildProfileData(profile: UnipileProfile): LinkedInProfileData {
  // Unipile returns work experience as "work_experience"
  const workExperience = profile.work_experience || profile.positions || profile.experience || [];
  const currentExp = workExperience.find(e => !e.end) || workExperience[0];
  
  return {
    name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    headline: profile.headline || '',
    summary: profile.summary || '',
    location: profile.location || '',
    currentPosition: currentExp?.position || '',
    currentCompany: currentExp?.company || '',
    yearsExperience: calculateYearsExperience(workExperience),
    profilePictureUrl: profile.profile_picture_url_large || profile.profile_picture_url,
    education: (profile.education || []).map(edu => {
      const parts = [edu.school];
      if (edu.degree) parts.push(edu.degree);
      if (edu.field_of_study) parts.push(edu.field_of_study);
      return parts.filter(Boolean).join(' - ');
    }),
    previousCompanies: workExperience
      .filter(exp => exp.company)
      .map(exp => exp.company!)
      .filter((company, index, arr) => arr.indexOf(company) === index),
    skills: (profile.skills || []).slice(0, 15).map(s => s.name),
    experienceDetails: workExperience.slice(0, 5).map(exp => ({
      company: exp.company || '',
      position: exp.position || '',
      location: exp.location,
      startDate: parseExperienceDate(exp.start),
      endDate: parseExperienceDate(exp.end),
      duration: formatExperienceDuration(exp),
      description: exp.description || '',
      isCurrent: !exp.end,
    })),
    educationDetails: (profile.education || []).slice(0, 5).map(edu => ({
      school: edu.school || '',
      degree: edu.degree,
      fieldOfStudy: edu.field_of_study,
      startDate: parseExperienceDate(edu.start),
      endDate: parseExperienceDate(edu.end),
    })),
  };
}

export async function fetchLinkedInProfile(linkedinUrl: string, skipCache: boolean = false): Promise<LinkedInProfileData | null> {
  const normalizedUrl = normalizeLinkedInUrl(linkedinUrl);
  
  // Check cache first (unless explicitly skipped)
  if (!skipCache) {
    try {
      const cached = await storage.getCachedLinkedinProfile(normalizedUrl);
      if (cached && cached.profileData) {
        console.log(`[unipile] Cache hit for ${normalizedUrl}`);
        return cached.profileData as LinkedInProfileData;
      }
    } catch (cacheError) {
      console.log(`[unipile] Cache lookup failed, proceeding with API call:`, cacheError);
    }
  }
  
  const dsn = process.env.UNIPILE_DSN;
  const apiKey = process.env.UNIPILE_API_KEY;
  const accountId = process.env.UNIPILE_ACCOUNT_ID;
  
  if (!dsn || !apiKey || !accountId) {
    console.log("[unipile] Missing Unipile credentials (DSN, API_KEY, or ACCOUNT_ID)");
    return null;
  }
  
  const identifier = extractIdentifierFromUrl(linkedinUrl);
  if (!identifier) {
    console.log(`[unipile] Could not extract identifier from URL: ${linkedinUrl}`);
    return null;
  }
  
  try {
    const url = `https://${dsn}/api/v1/users/${encodeURIComponent(identifier)}?account_id=${encodeURIComponent(accountId)}&linkedin_sections=*`;
    
    console.log(`[unipile] Fetching profile from API for: ${identifier}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[unipile] API error ${response.status}: ${errorText}`);
      return null;
    }
    
    const profile = await response.json() as UnipileProfile;
    
    // Debug logging to see what the API returns
    console.log(`[unipile] Raw profile for ${profile.first_name} ${profile.last_name}:`);
    console.log(`[unipile]   work_experience count: ${profile.work_experience?.length || 0}`);
    console.log(`[unipile]   positions count: ${profile.positions?.length || 0}`);
    console.log(`[unipile]   experience count: ${profile.experience?.length || 0}`);
    console.log(`[unipile]   education count: ${profile.education?.length || 0}`);
    const workExp = profile.work_experience || profile.positions || profile.experience || [];
    if (workExp.length > 0) {
      console.log(`[unipile] First work_experience entry:`, JSON.stringify(workExp[0]));
    } else {
      console.log(`[unipile] No work experience found in any field`);
    }
    
    const profileData = buildProfileData(profile);
    
    console.log(`[unipile] Successfully fetched profile for ${profileData.name}`);
    console.log(`[unipile] Built experienceDetails count: ${profileData.experienceDetails?.length || 0}`);
    
    // Store in cache using normalized URL
    try {
      const expiresAt = new Date(Date.now() + CACHE_DURATION_MS);
      await storage.cacheLinkedinProfile({
        linkedinUrl: normalizedUrl,
        linkedinIdentifier: identifier,
        profileData: profileData,
        fetchedAt: new Date(),
        expiresAt: expiresAt,
      });
      console.log(`[unipile] Cached profile for ${profileData.name}, expires ${expiresAt.toISOString()}`);
    } catch (cacheError) {
      console.log(`[unipile] Failed to cache profile:`, cacheError);
      // Don't fail the request if caching fails
    }
    
    return profileData;
    
  } catch (error) {
    console.error(`[unipile] Error fetching profile:`, error);
    return null;
  }
}

export function isUnipileConfigured(): boolean {
  return !!(
    process.env.UNIPILE_DSN &&
    process.env.UNIPILE_API_KEY &&
    process.env.UNIPILE_ACCOUNT_ID
  );
}
