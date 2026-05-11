/**
 * Funding history block — renders canonical-source funding rounds for a
 * startup. Used in two places:
 *  - The deal card summary panel (compact, rows-known badge + collapsed)
 *  - The DD view tab (full table with provider attribution chips)
 *
 * DG-E11-F1-S1.
 */
import type { ReactElement } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Banknote, ExternalLink } from "lucide-react";
import type {
  FundingHistoryRow,
  FundingHistorySource,
} from "@/types/startup";

interface FundingHistoryBlockProps {
  startupId: string;
  rows: FundingHistoryRow[] | null;
  loading?: boolean;
  /** If true, render the compact deal-card variant rather than the full DD view */
  compact?: boolean;
  /** Show a "no public funding history found" message when rows is empty */
  emptyMessage?: string;
}

const PROVIDER_LABELS: Record<FundingHistorySource["provider"], string> = {
  crunchbase: "Crunchbase",
  public_filing: "Public Filing",
  press_release: "Press Release",
};

function formatAmount(amount: string | null, currency: string | null): string {
  if (!amount) return "Undisclosed";
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  });
  try {
    return formatter.format(value);
  } catch {
    return `${currency || ""} ${value.toLocaleString()}`.trim();
  }
}

function formatDate(date: string | null): string {
  if (!date) return "Date unknown";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRoundType(roundType: string): string {
  return roundType
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function SourceChips({
  sources,
}: {
  sources: FundingHistorySource[];
}): ReactElement {
  return (
    <div
      className="flex flex-wrap gap-1"
      data-testid="funding-source-chips"
    >
      {sources.map((source, i) => {
        const label = PROVIDER_LABELS[source.provider] || source.provider;
        const hasConflict =
          source.conflictsWith && source.conflictsWith.length > 0;
        return (
          <a
            key={`${source.provider}-${i}`}
            href={source.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
            data-testid={`funding-source-${source.provider}`}
          >
            <Badge
              variant={hasConflict ? "destructive" : "secondary"}
              className="text-xs gap-1"
              title={
                hasConflict
                  ? `Disagrees on: ${source.conflictsWith?.join(", ")}`
                  : `Source: ${label}`
              }
            >
              {label}
              <ExternalLink className="w-3 h-3" />
            </Badge>
          </a>
        );
      })}
    </div>
  );
}

function FundingRoundRow({
  row,
}: {
  row: FundingHistoryRow;
}): ReactElement {
  return (
    <div
      className="rounded-lg border bg-card p-4 space-y-2"
      data-testid={`funding-row-${row.id}`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className="font-medium"
          data-testid={`funding-row-${row.id}-type`}
        >
          {formatRoundType(row.roundType)}
        </span>
        <span
          className="text-sm text-muted-foreground"
          data-testid={`funding-row-${row.id}-date`}
        >
          {formatDate(row.announcedAt)}
        </span>
        <span
          className="ml-auto font-semibold"
          data-testid={`funding-row-${row.id}-amount`}
        >
          {formatAmount(row.amount, row.currency)}
        </span>
      </div>
      {row.leadInvestor && (
        <div className="text-sm">
          <span className="text-muted-foreground">Lead: </span>
          <span
            className="font-medium"
            data-testid={`funding-row-${row.id}-lead`}
          >
            {row.leadInvestor}
          </span>
        </div>
      )}
      {row.investors && row.investors.length > 0 && (
        <div
          className="flex flex-wrap gap-1"
          data-testid={`funding-row-${row.id}-investors`}
        >
          {row.investors.map((investor) => (
            <Badge
              key={investor}
              variant="outline"
              className="text-xs"
            >
              {investor}
            </Badge>
          ))}
        </div>
      )}
      <div className="pt-1">
        <SourceChips sources={row.sources} />
      </div>
    </div>
  );
}

export function FundingHistoryBlock({
  startupId,
  rows,
  loading,
  compact = false,
  emptyMessage = "No public funding history found.",
}: FundingHistoryBlockProps): ReactElement {
  if (loading) {
    return (
      <Card data-testid="funding-history-loading">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="w-5 h-5" />
            <span>Funding History</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const rowsList = rows ?? [];

  if (compact) {
    return (
      <div
        className="flex items-center gap-2"
        data-testid={`funding-history-compact-${startupId}`}
      >
        <Banknote className="w-4 h-4 text-muted-foreground" />
        {rowsList.length > 0 ? (
          <span className="text-sm">
            Rounds known:{" "}
            <span
              className="font-semibold"
              data-testid="funding-history-compact-count"
            >
              {rowsList.length}
            </span>
          </span>
        ) : (
          <span
            className="text-sm text-muted-foreground"
            data-testid="funding-history-compact-empty"
          >
            {emptyMessage}
          </span>
        )}
      </div>
    );
  }

  return (
    <Card data-testid={`funding-history-${startupId}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="w-5 h-5" />
          <span data-testid="funding-history-title">Funding History</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rowsList.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="funding-history-empty"
          >
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-3" data-testid="funding-history-rows">
            {rowsList.map((row) => (
              <FundingRoundRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
