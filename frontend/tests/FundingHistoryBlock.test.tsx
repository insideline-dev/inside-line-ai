import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FundingHistoryBlock } from "../src/components/startup-view/FundingHistoryBlock";
import type { FundingHistoryRow } from "../src/types/startup";

const baseRow: FundingHistoryRow = {
  id: "row-1",
  startupId: "startup-1",
  roundType: "series_a",
  announcedAt: "2024-03-15",
  amount: "18000000",
  currency: "USD",
  valuationPostMoney: "80000000",
  leadInvestor: "Sequoia Capital",
  investors: ["Sequoia Capital", "Founders Fund"],
  sources: [
    {
      provider: "crunchbase",
      sourceUrl: "https://www.crunchbase.com/funding_round/acme-series-a",
      fetchedAt: "2026-05-10T00:00:00.000Z",
    },
    {
      provider: "public_filing",
      sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?type=D",
      fetchedAt: "2026-05-11T00:00:00.000Z",
      conflictsWith: ["amount"],
    },
  ],
  evidenceConfidence: "0.800",
  lastReconciledAt: "2026-05-11T00:00:00.000Z",
  createdAt: "2026-05-11T00:00:00.000Z",
  updatedAt: "2026-05-11T00:00:00.000Z",
};

describe("FundingHistoryBlock", () => {
  it("renders rounds with formatted amount, date and source chips", () => {
    const html = renderToStaticMarkup(
      <FundingHistoryBlock startupId="startup-1" rows={[baseRow]} />,
    );

    expect(html).toContain("Funding History");
    expect(html).toContain("Series A");
    // currency-formatted amount
    expect(html).toContain("$18,000,000");
    expect(html).toContain("Sequoia Capital");
    expect(html).toContain("Founders Fund");
    // both providers must be visible as source chips
    expect(html).toContain("Crunchbase");
    expect(html).toContain("Public Filing");
    // sourceUrl renders as an external link
    expect(html).toContain(
      "https://www.crunchbase.com/funding_round/acme-series-a",
    );
  });

  it("renders the graceful empty state when rows is empty", () => {
    const html = renderToStaticMarkup(
      <FundingHistoryBlock startupId="startup-1" rows={[]} />,
    );

    expect(html).toContain("No public funding history found");
    // No round content rendered
    expect(html).not.toContain("Series A");
  });

  it("renders compact variant with rounds-known badge", () => {
    const html = renderToStaticMarkup(
      <FundingHistoryBlock
        startupId="startup-1"
        rows={[baseRow]}
        compact
      />,
    );

    expect(html).toContain("Rounds known:");
    expect(html).toContain(">1<");
  });

  it("compact variant shows empty fallback when no rows", () => {
    const html = renderToStaticMarkup(
      <FundingHistoryBlock startupId="startup-1" rows={[]} compact />,
    );

    expect(html).toContain("No public funding history found");
  });

  it("renders a loading skeleton when loading is true", () => {
    const html = renderToStaticMarkup(
      <FundingHistoryBlock
        startupId="startup-1"
        rows={null}
        loading
      />,
    );
    expect(html).toContain("Funding History");
    expect(html).toContain("animate-pulse");
  });

  it("flags conflicting sources with the conflict variant", () => {
    const html = renderToStaticMarkup(
      <FundingHistoryBlock startupId="startup-1" rows={[baseRow]} />,
    );
    // The SEC source had conflictsWith=["amount"]; we expect the disagreement
    // to be surfaced in the title attribute.
    expect(html).toContain("Disagrees on: amount");
  });
});
