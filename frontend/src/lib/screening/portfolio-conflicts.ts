// DS-E4-F2-S1 — flag potential portfolio conflicts before a partner
// advances a deal. Deterministic, no LLM. Compares the incoming startup
// against the investor's `thesis.portfolioCompanies[]` (populated by the
// onboarding scrape, DS-E3-F1-S2) using three independent signals.
//
// We deliberately bias toward false-positives over false-negatives —
// surfacing a non-conflict to a partner costs them 2 seconds; missing a
// real conflict can cost them a relationship.

import type { Startup } from "@/types/startup";
import type { InvestmentThesis } from "@/types/investor";

export interface PortfolioConflict {
  /** The portfolio company that triggered the flag. */
  portfolioName: string;
  portfolioDescription?: string;
  portfolioWebsiteUrl?: string;
  /** What signal(s) fired. Multiple reasons stack on the same conflict. */
  reasons: ConflictReason[];
}

export type ConflictReason =
  | "domain_match"
  | "name_overlap"
  | "description_keyword_overlap";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "platform",
  "company",
  "business",
  "solution",
  "product",
  "software",
  "service",
  "services",
  "app",
  "tool",
  "tools",
  "ai",
  "ml",
  "data",
  "online",
  "global",
  "world",
  "next-gen",
  "future",
  "leading",
]);

const MIN_KEYWORD_LENGTH = 4;
const MIN_KEYWORD_OVERLAP = 2;

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function keywords(text: string | undefined): Set<string> {
  if (!text) return new Set();
  const out = new Set<string>();
  for (const raw of text.split(/[\s,.;:/()\-—]+/)) {
    const w = lower(raw);
    if (w.length < MIN_KEYWORD_LENGTH) continue;
    if (STOP_WORDS.has(w)) continue;
    out.add(w);
  }
  return out;
}

function intersection<T>(a: Set<T>, b: Set<T>): T[] {
  const out: T[] = [];
  for (const v of a) if (b.has(v)) out.push(v);
  return out;
}

function rootDomain(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    // Strip leading "www." but keep the rest of the host so subdomain-only
    // collisions don't false-positive ("foo.example.com" ≠ "bar.example.com"
    // is fine — neither typically used for fund portfolios).
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ""))
      .filter((t) => t.length >= 3),
  );
}

/**
 * Returns the list of portfolio companies that look like potential
 * conflicts with the incoming startup. Empty array when no portfolio
 * data is available or no signals fire.
 *
 * Order = strongest signal first (domain match > name overlap > description).
 */
export function findPortfolioConflicts(
  startup: Startup,
  thesis: InvestmentThesis | null | undefined,
): PortfolioConflict[] {
  const portfolio = thesis?.portfolioCompanies;
  if (!portfolio || portfolio.length === 0) return [];

  const startupDomain = rootDomain(startup.website);
  const startupNameTokens = nameTokens(startup.name ?? "");
  const startupKeywords = keywords(
    [startup.description, startup.productDescription, startup.industry]
      .filter((v): v is string => typeof v === "string")
      .join(" "),
  );

  const conflicts: PortfolioConflict[] = [];

  for (const co of portfolio) {
    if (!co?.name) continue;
    const reasons: ConflictReason[] = [];

    // 1. Exact domain match — strongest signal.
    const coDomain = rootDomain(co.websiteUrl);
    if (startupDomain && coDomain && startupDomain === coDomain) {
      reasons.push("domain_match");
    }

    // 2. Name token overlap (skip if domain already matched — same signal).
    if (!reasons.includes("domain_match")) {
      const coNameTokens = nameTokens(co.name);
      if (
        coNameTokens.size > 0 &&
        intersection(startupNameTokens, coNameTokens).length > 0
      ) {
        reasons.push("name_overlap");
      }
    }

    // 3. Description keyword overlap.
    const coKeywords = keywords(co.description);
    if (
      coKeywords.size > 0 &&
      intersection(startupKeywords, coKeywords).length >= MIN_KEYWORD_OVERLAP
    ) {
      reasons.push("description_keyword_overlap");
    }

    if (reasons.length === 0) continue;

    conflicts.push({
      portfolioName: co.name,
      portfolioDescription: co.description,
      portfolioWebsiteUrl: co.websiteUrl,
      reasons,
    });
  }

  // Sort by strongest signal first.
  return conflicts.sort((a, b) => {
    const score = (c: PortfolioConflict): number =>
      (c.reasons.includes("domain_match") ? 100 : 0) +
      (c.reasons.includes("name_overlap") ? 10 : 0) +
      (c.reasons.includes("description_keyword_overlap") ? 1 : 0);
    return score(b) - score(a);
  });
}

export function reasonLabel(reason: ConflictReason): string {
  switch (reason) {
    case "domain_match":
      return "same website";
    case "name_overlap":
      return "name overlap";
    case "description_keyword_overlap":
      return "similar description";
  }
}
