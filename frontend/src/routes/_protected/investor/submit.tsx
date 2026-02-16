import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StartupSubmitForm } from "@/components/startup";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_protected/investor/submit")({
  component: InvestorSubmitPage,
});

function InvestorSubmitPage() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate({ to: "/investor" });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/investor">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Analyze a Startup</h1>
          <p className="text-muted-foreground">Submit a startup for private AI-powered analysis</p>
        </div>
      </div>

      <StartupSubmitForm
        userRole="investor"
        onSuccess={handleSuccess}
        redirectPath="/investor"
        showPrimaryContactSection={true}
      />
    </div>
  );
}
