import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StageNav } from "@/components/investor/StageNav";

export const Route = createFileRoute("/_protected/investor/contracting")({
  component: ContractingPage,
});

function ContractingPage() {
  return (
    <div className="flex flex-col gap-4">
      <StageNav />
      <div>
        <h1 className="text-2xl font-semibold">Engaged</h1>
        <p className="text-sm text-muted-foreground">
          Deals you are actively engaging with — term sheets, meetings, closing.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <FileText className="h-8 w-8 opacity-60" />
          <p className="text-sm">
            Once a deal is promoted from Due Diligence, it will appear here
            for active engagement tracking.
          </p>
          <p className="text-xs">
            Full engagement workflow ships in a later PR.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
