import * as cheerio from 'cheerio';

export interface WebsiteMetadata {
  title: string;
  description: string;
  logo?: string;
  industry?: string;
  teamSize?: number;
}

export async function scrapeWebsiteMetadata(
  url: string,
): Promise<WebsiteMetadata> {
  try {
    const normalizedUrl =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `https://${url}`;

    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InsideLine/1.0)',
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    return {
      title:
        $('title').text() ||
        $('meta[property="og:title"]').attr('content') ||
        '',
      description:
        $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        '',
      logo:
        $('meta[property="og:image"]').attr('content') ||
        $('link[rel="icon"]').attr('href') ||
        undefined,
    };
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error);
    return {
      title: '',
      description: '',
    };
  }
}

export function sanitizeHtml(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, iframe').remove();
  return $.text().trim();
}
