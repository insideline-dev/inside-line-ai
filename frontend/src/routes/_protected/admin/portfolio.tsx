import { createFileRoute } from "@tanstack/react-router";
import { StageNav } from "@/components/investor/StageNav";

export const Route = createFileRoute("/_protected/admin/portfolio")({
  component: AdminPortfolioPage,
});

function AdminPortfolioPage() {
  return (
    <div className="flex flex-col gap-4">
      <StageNav surface="admin" />
      <div className="rounded-md border border-border p-12 text-center text-muted-foreground">
        <h1 className="text-2xl font-semibold mb-2">Portfolio</h1>
        <p>Stage shell — features land in a future PR.</p>
      </div>
    </div>
  );
}
