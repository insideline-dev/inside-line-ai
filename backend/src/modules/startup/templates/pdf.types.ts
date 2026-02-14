import type { Startup } from '../entities/startup.schema';
import type { StartupEvaluation } from '../../analysis/entities/analysis.schema';

/**
 * Data passed from PdfService to all PDF templates.
 */
export interface PdfStartupData {
  startup: Startup;
  evaluation: StartupEvaluation | null;
  userEmail: string;
}

export interface PdfContext {
  startup: Startup;
  evaluation: StartupEvaluation | null;
  userEmail: string;
  generatedAt: Date;
}

// ---- Color & formatting utilities shared across templates ----

export const BRAND_COLOR = '#0ea5e9';
export const BRAND_COLOR_DARK = '#0284c7';
export const TEXT_PRIMARY = '#1a1a1a';
export const TEXT_SECONDARY = '#4b5563';
export const TEXT_MUTED = '#9ca3af';
export const SUCCESS_COLOR = '#16a34a';
export const WARNING_COLOR = '#ca8a04';
export const DANGER_COLOR = '#dc2626';

export function getScoreColor(score: number): string {
  if (score >= 70) return SUCCESS_COLOR;
  if (score >= 50) return WARNING_COLOR;
  return DANGER_COLOR;
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Moderate';
  if (score >= 30) return 'Weak';
  return 'Critical';
}

export function formatCurrency(value: number | null | undefined): string {
  if (!value) return 'N/A';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

/**
 * Try to extract a narrative summary string from a JSONB evaluation section.
 */
export function getSummaryFromData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (typeof d.narrativeSummary === 'string' && d.narrativeSummary.length > 50) {
    return d.narrativeSummary;
  }

  const summaryFields = [
    'memoNarrative',
    'summary',
    'assessment',
    'overview',
    'analysis',
    'description',
    'detailedAnalysis',
  ];
  for (const field of summaryFields) {
    if (typeof d[field] === 'string' && (d[field] as string).length > 50) {
      return d[field] as string;
    }
  }

  const summaryParts: string[] = [];
  for (const key of Object.keys(d)) {
    const v = d[key];
    if (typeof v === 'object' && v !== null) {
      const sub = v as Record<string, unknown>;
      if (typeof sub.assessment === 'string') {
        summaryParts.push(sub.assessment as string);
      } else if (typeof sub.summary === 'string') {
        summaryParts.push(sub.summary as string);
      }
    }
  }

  if (summaryParts.length > 0) {
    return summaryParts.slice(0, 2).join('\n\n');
  }

  return null;
}
