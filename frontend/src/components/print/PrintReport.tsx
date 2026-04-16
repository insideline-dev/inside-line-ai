import {
  AdminSummaryTab,
  MarketTabContent,
  ProductTabContent,
  TeamTabContent,
  FinancialsTabContent,
  CompetitorsTabContent,
} from "@/components/startup-view";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import type { ScoringWeights } from "@/lib/score-utils";
import { PrintLayout, PrintPage, PrintCover } from "./PrintLayout";

interface PrintReportProps {
  startup: Startup;
  evaluation: Evaluation;
  weights: ScoringWeights | null;
  ready: boolean;
  generatedBy?: string | null;
}

type TeamMember = { name: string; role: string; linkedinUrl?: string };

function PrintSectionTitle({ label }: { label: string }) {
  return (
    <div
      style={{
        fontFamily: "Instrument Serif, serif",
        fontSize: "18pt",
        letterSpacing: "-0.01em",
        marginBottom: "6mm",
        color: "#163F67",
      }}
    >
      {label}
    </div>
  );
}

export function PrintReport({ startup, evaluation, weights, ready, generatedBy }: PrintReportProps) {
  const teamMembers =
    (startup.teamMembers as TeamMember[] | undefined) ?? [];
  const stage = typeof startup.stage === "string" ? startup.stage : undefined;

  return (
    <PrintLayout ready={ready}>
      <PrintCover
        title="Analysis Report"
        startupName={startup.name}
        stage={stage}
        subtitle={startup.description ?? undefined}
        generatedBy={generatedBy}
        score={typeof evaluation.overallScore === "number" ? evaluation.overallScore : undefined}
        logoUrl={startup.logoUrl ?? undefined}
      />

      <PrintPage>
        <PrintSectionTitle label="Summary" />
        <AdminSummaryTab startup={startup} evaluation={evaluation} weights={weights} />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle label="Market" />
        <MarketTabContent
          evaluation={evaluation}
          marketWeight={weights?.market}
          fundingStage={stage}
          showDataGaps={false}
          showKeyFindingsAndRisks={true}
          showScores
          forcePrint
        />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle label="Product" />
        <ProductTabContent
          startup={startup}
          evaluation={evaluation}
          productWeight={weights?.product}
          forcePrint
        />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle label="Team" />
        <TeamTabContent
          evaluation={evaluation}
          teamMembers={teamMembers}
          teamWeight={weights?.team}
          companyName={startup.name}
          forcePrint
        />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle label="Financials" />
        <FinancialsTabContent
          evaluation={evaluation}
          financialsWeight={weights?.financials}
          forcePrint
        />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle label="Competitors" />
        <CompetitorsTabContent
          evaluation={evaluation}
          companyName={startup.name}
          forcePrint
        />
      </PrintPage>
    </PrintLayout>
  );
}
