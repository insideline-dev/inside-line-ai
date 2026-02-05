import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { StartupSubmitForm } from "@/components/StartupSubmitForm";

interface AuthUser {
  id: string;
  role?: "founder" | "investor" | "admin" | null;
}

export default function FounderSubmit() {
  const { data: user, isLoading: isAuthLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  useEffect(() => {
    if (!isAuthLoading && !user) {
      sessionStorage.setItem("returnTo", "/founder/submit");
      window.location.href = "/api/login/founder";
    }
  }, [user, isAuthLoading]);

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href="/founder">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Submit Your Startup</h1>
          <p className="text-muted-foreground">
            Provide your company details for AI-powered evaluation
          </p>
        </div>
      </div>

      <StartupSubmitForm 
        userRole="founder" 
        redirectPath="/founder"
        enableDraftSaving={true}
      />
    </div>
  );
}
