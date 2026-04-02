export const PRODUCT_RESEARCH_FINDING_LABELS = [
  "Product",
  "Maturity",
  "Customer",
  "Pricing & GTM",
  "Customer Evidence",
  "Technical",
  "Integrations & Stickiness",
  "Compliance",
  "Other Relevant Signals",
] as const;

/**
 * Alternate labels the model might use instead of the canonical label.
 * Checked case-insensitively after the canonical label fails.
 */
const FINDING_LABEL_ALIASES: Record<string, string[]> = {
  Customer: ["Customers", "Customer Segment", "Customer & Segment", "Target Customer", "Customer Profile"],
  "Pricing & GTM": ["Pricing", "GTM", "Pricing & Go-To-Market", "Pricing/GTM", "Go-To-Market"],
  "Customer Evidence": ["Customer Validation", "Traction & Evidence", "Evidence", "Customer Proof"],
  Technical: ["Technology", "Technical Architecture", "Tech Stack"],
  "Integrations & Stickiness": ["Integrations", "Stickiness", "Integration & Switching Costs", "Ecosystem"],
  Compliance: ["Compliance & Regulatory", "Regulatory", "Legal & Compliance"],
  "Other Relevant Signals": ["Other Signals", "Additional Signals", "Other", "Additional Findings"],
};

const PRODUCT_RESEARCH_REQUIRED_HEADINGS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Verification", pattern: /(^|\n)\s*(?:\*\*)?\s*Verification\s*(?:\*\*)?\s*:/i },
  {
    label: "Product Type & Vertical",
    pattern: /(^|\n)\s*(?:\*\*)?\s*Product Type\s*(?:&|and)\s*Vertical\s*(?:\*\*)?\s*:/i,
  },
  {
    label: "Research Approach",
    pattern: /(^|\n)\s*(?:\*\*)?\s*Research (?:Approach|Methodology)\s*(?:\*\*)?\s*:/i,
  },
  { label: "Findings", pattern: /(^|\n)\s*(?:\*\*)?\s*Findings\s*(?:\*\*)?\s*:/i },
  {
    label: "Unverified Items",
    pattern: /(^|\n)\s*(?:\*\*)?\s*Unverified\s*(?:Items|Claims)?\s*(?:\*\*)?\s*:/i,
  },
  { label: "Research Gaps", pattern: /(^|\n)\s*(?:\*\*)?\s*Research Gaps\s*(?:\*\*)?\s*:/i },
  {
    label: "Notably Absent / Risk Signals",
    pattern:
      /(^|\n)\s*(?:\*\*)?\s*(?:Notably Absent\s*[/&]\s*Risk Signals|Risk Signals\s*[/&]\s*Notably Absent|Notable Absences|Risk Signals|Notably Absent)\s*(?:\*\*)?\s*:/i,
  },
];

/** Minimum number of the 9 findings sections that must be present to accept the report. */
const MIN_FINDINGS_SECTIONS = 6;

/** Minimum number of the required headings that must be present to accept the report. */
const MIN_REQUIRED_HEADINGS = 5;

export function validateProductResearchReportContract(outputText: string): string | null {
  const normalized = outputText.replace(/\r/g, "").trim();
  if (normalized.length === 0) {
    return "empty report output";
  }

  // Check required headings — allow partial matches
  const missingHeadings: string[] = [];
  for (const heading of PRODUCT_RESEARCH_REQUIRED_HEADINGS) {
    if (!heading.pattern.test(normalized)) {
      missingHeadings.push(heading.label);
    }
  }
  const headingsPresent = PRODUCT_RESEARCH_REQUIRED_HEADINGS.length - missingHeadings.length;
  if (headingsPresent < MIN_REQUIRED_HEADINGS) {
    return `only ${headingsPresent}/${PRODUCT_RESEARCH_REQUIRED_HEADINGS.length} required headings found (need ${MIN_REQUIRED_HEADINGS}); missing: ${missingHeadings.join(", ")}`;
  }

  // Check findings sections — tolerate minor variations and allow partial matches
  const missingSections: string[] = [];
  for (const [index, label] of PRODUCT_RESEARCH_FINDING_LABELS.entries()) {
    const sectionNumber = index + 1;
    if (!matchFindingsSection(normalized, sectionNumber, label)) {
      missingSections.push(`${sectionNumber} (${label})`);
    }
  }
  const sectionsPresent = PRODUCT_RESEARCH_FINDING_LABELS.length - missingSections.length;
  if (sectionsPresent < MIN_FINDINGS_SECTIONS) {
    return `only ${sectionsPresent}/${PRODUCT_RESEARCH_FINDING_LABELS.length} findings sections found (need ${MIN_FINDINGS_SECTIONS}); missing: ${missingSections.join(", ")}`;
  }

  return null;
}

/**
 * Check if a numbered findings section exists in the text.
 * Tolerates: bold wrapping (**label**:), bold prefix (**label:), colon inside bold,
 * plural variants, and known aliases.
 */
function matchFindingsSection(text: string, num: number, canonicalLabel: string): boolean {
  const allLabels = [canonicalLabel, ...(FINDING_LABEL_ALIASES[canonicalLabel] ?? [])];
  for (const label of allLabels) {
    // Match: "3. Customer:", "3. **Customer:**", "3. **Customer**:", "3) Customer:", etc.
    const escaped = escapeRegExp(label);
    const pattern = new RegExp(
      `(^|\\n)\\s*${num}[\\.\\)\\-]\\s*(?:\\*\\*)?\\s*${escaped}s?\\s*(?:\\*\\*)?\\s*[:—–-]`,
      "i",
    );
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
