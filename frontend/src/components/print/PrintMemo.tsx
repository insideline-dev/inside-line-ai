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
}

export function PrintMemo({ startup, evaluation, weights, ready }: PrintMemoProps) {
  return (
    <PrintLayout ready={ready}>
      <PrintCover
        title="Investment Memo"
        startupName={startup.name}
        stage={typeof startup.stage === "string" ? startup.stage : undefined}
        subtitle={startup.description ?? undefined}
      />
      <PrintPage>
        <MemoTabContent
          startup={startup}
          evaluation={evaluation}
          weights={weights}
          animateOnMount={false}
        />
      </PrintPage>
    </PrintLayout>
  );
}
