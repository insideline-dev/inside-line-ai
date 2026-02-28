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

const PRODUCT_RESEARCH_REQUIRED_HEADINGS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Verification", pattern: /(^|\n)\s*(?:\*\*)?\s*Verification\s*(?:\*\*)?\s*:/i },
  {
    label: "Product Type & Vertical",
    pattern: /(^|\n)\s*(?:\*\*)?\s*Product Type\s*&\s*Vertical\s*(?:\*\*)?\s*:/i,
  },
  {
    label: "Research Approach",
    pattern: /(^|\n)\s*(?:\*\*)?\s*Research Approach\s*(?:\*\*)?\s*:/i,
  },
  { label: "Findings", pattern: /(^|\n)\s*(?:\*\*)?\s*Findings\s*(?:\*\*)?\s*:/i },
  {
    label: "Unverified Items",
    pattern: /(^|\n)\s*(?:\*\*)?\s*Unverified Items\s*(?:\*\*)?\s*:/i,
  },
  { label: "Research Gaps", pattern: /(^|\n)\s*(?:\*\*)?\s*Research Gaps\s*(?:\*\*)?\s*:/i },
  {
    label: "Notably Absent / Risk Signals",
    pattern: /(^|\n)\s*(?:\*\*)?\s*Notably Absent\s*\/\s*Risk Signals\s*(?:\*\*)?\s*:/i,
  },
];

export function validateProductResearchReportContract(outputText: string): string | null {
  const normalized = outputText.replace(/\r/g, "").trim();
  if (normalized.length === 0) {
    return "empty report output";
  }

  for (const heading of PRODUCT_RESEARCH_REQUIRED_HEADINGS) {
    if (!heading.pattern.test(normalized)) {
      return `missing heading "${heading.label}"`;
    }
  }

  for (const [index, label] of PRODUCT_RESEARCH_FINDING_LABELS.entries()) {
    const sectionNumber = index + 1;
    const pattern = new RegExp(
      `(^|\\n)\\s*${sectionNumber}[\\.)]\\s*(?:\\*\\*)?\\s*${escapeRegExp(label)}\\s*(?:\\*\\*)?\\s*:`,
      "i",
    );
    if (!pattern.test(normalized)) {
      return `missing findings section ${sectionNumber} (${label})`;
    }
  }

  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
