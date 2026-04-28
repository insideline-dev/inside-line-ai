import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSubmitOnboardingWebsite } from "@/lib/investor/useSubmitOnboardingWebsite";
import { OnboardingWebsiteForm } from "@/components/investor/OnboardingWebsiteForm";
import insideLineLogo from "@/assets/icon-insideline.svg";

export const Route = createFileRoute("/_protected/investor/onboarding/website")({
  component: InvestorOnboardingWebsitePage,
});

function extractDomain(website: string): string {
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
  } catch {
    return website;
  }
}

function InvestorOnboardingWebsitePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { mutate: submitWebsite, isPending } = useSubmitOnboardingWebsite();

  const handleSubmit = (website: string) => {
    submitWebsite(
      { website },
      {
        onSuccess: (data) => {
          toast.success(`Drafting your thesis from ${extractDomain(data.website)}…`);
          navigate({ to: "/investor/thesis" });
        },
        onError: (error: Error) => {
          toast.error("Couldn't queue your website", {
            description: error.message,
          });
        },
      },
    );
  };

  const handleSkip = () => {
    navigate({ to: "/investor/thesis" });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-30" />
      <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-30" />

      <div className="relative w-full max-w-xl space-y-8">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2.5">
            <img src={insideLineLogo} alt="Inside Line" className="size-8 shrink-0" />
            <span className="font-serif text-2xl font-normal tracking-tight">Inside Line</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Let's draft your thesis
          </h1>
          <p className="text-muted-foreground">
            Share your fund's website and we'll auto-fill your investment thesis and portfolio. You can review and tweak everything next.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <OnboardingWebsiteForm
              isSubmitting={isPending}
              onSubmit={handleSubmit}
              onSkip={handleSkip}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
