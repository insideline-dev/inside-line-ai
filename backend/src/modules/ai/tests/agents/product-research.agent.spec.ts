import { describe, expect, it } from "bun:test";
import { ProductResearchAgent } from "../../agents/research/product-research.agent";

const VALID_PRODUCT_REPORT = [
  "Verification:",
  "Target: Acme | Domain: https://acme.test | Confidence: High",
  "",
  "Product Type & Vertical:",
  "Software | Fintech",
  "",
  "Research Approach:",
  "Prioritized pricing, product docs, customer evidence, and enterprise readiness signals.",
  "",
  "Findings:",
  "1. Product: Core workflow automation with underwriting orchestration.",
  "2. Maturity: Public beta with customer case studies and release notes.",
  "3. Customer: B2B lenders in North America.",
  "4. Pricing & GTM: Usage-based pricing with sales-led motion.",
  "5. Customer Evidence: Three named customers with implementation outcomes.",
  "6. Technical: Public API docs, SSO support, and audit logging.",
  "7. Integrations & Stickiness: Deep CRM integrations and workflow embedding.",
  "8. Compliance: SOC 2 claim present; regulatory evidence incomplete.",
  "9. Other Relevant Signals: Strong implementation partner ecosystem.",
  "",
  "Unverified Items:",
  "SOC 2 report was claimed but not independently confirmed.",
  "",
  "Research Gaps:",
  "No third-party review volume data available.",
  "",
  "Notably Absent / Risk Signals:",
  "No public uptime history despite enterprise positioning.",
].join("\n");

describe("ProductResearchAgent", () => {
  it("accepts report output that follows the required section contract", () => {
    const parsed = ProductResearchAgent.schema.parse(VALID_PRODUCT_REPORT);
    expect(parsed).toBe(VALID_PRODUCT_REPORT);
  });

  it("rejects report output that misses required findings sections", () => {
    const invalid = VALID_PRODUCT_REPORT.replace(
      "9. Other Relevant Signals: Strong implementation partner ecosystem.",
      "",
    );

    expect(() => ProductResearchAgent.schema.parse(invalid)).toThrow(
      /Product research output failed report contract/i,
    );
  });
});
