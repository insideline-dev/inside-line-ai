import { MemoTabContent } from "@/components/startup-view";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import type { ScoringWeights } from "@/lib/score-utils";
import { PrintLayout, PrintPage, PrintCover } from "./PrintLayout";

interface PrintMemoProps {
  startup: Startup;
  evaluation: Evaluation;
  weights: ScoringWeights | null;
  ready: boolean;
  generatedBy?: string | null;
}

export function PrintMemo({ startup, evaluation, weights, ready, generatedBy }: PrintMemoProps) {
  const stage = typeof startup.stage === "string" ? startup.stage : undefined;
  const overallScore =
    typeof evaluation.overallScore === "number"
      ? evaluation.overallScore
      : typeof startup.overallScore === "number"
        ? startup.overallScore
        : undefined;

  return (
    <PrintLayout ready={ready}>
      <PrintCover
        title="Investment Memo"
        startupName={startup.name}
        stage={stage}
        subtitle={startup.description ?? undefined}
        generatedBy={generatedBy}
        score={overallScore}
        logoUrl={startup.logoUrl ?? undefined}
      />
      <PrintPage>
        <MemoTabContent
          startup={startup}
          evaluation={evaluation}
          weights={weights}
          animateOnMount={false}
          forcePrint
        />
      </PrintPage>
    </PrintLayout>
  );
}
