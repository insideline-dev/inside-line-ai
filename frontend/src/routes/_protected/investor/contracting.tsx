import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StageNav } from "@/components/investor/StageNav";

export const Route = createFileRoute("/_protected/investor/contracting")({
  component: ContractingPage,
});

function ContractingPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <StageNav />
      <div>
        <h1 className="text-2xl font-semibold">Contracting</h1>
        <p className="text-sm text-muted-foreground">
          Term sheets, signatures, closing — coming soon.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <FileText className="h-8 w-8 opacity-60" />
          <p className="text-sm">
            This stage is reserved. Once a deal exits Due Diligence with a
            decision to invest, it will appear here for term-sheet and close
            workflow.
          </p>
          <p className="text-xs">
            Tracking infrastructure ships in a later PR.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
