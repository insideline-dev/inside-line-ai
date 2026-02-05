import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StartupSubmitForm } from "@/components/StartupSubmitForm";

interface PortalData {
  portal: {
    id: number;
    slug: string;
    welcomeMessage: string | null;
    tagline: string | null;
    accentColor: string;
    requiredFields: string[] | null;
    isEnabled: boolean;
  };
  investor: {
    fundName: string;
    fundDescription: string | null;
    logoUrl: string | null;
    website: string | null;
  };
}

export default function PublicApply() {
  const { slug } = useParams<{ slug: string }>();
  const [submitted, setSubmitted] = useState(false);

  const { data: portalData, isLoading, error } = useQuery<PortalData>({
    queryKey: ["/api/portal", slug],
    queryFn: async () => {
      const response = await fetch(`/api/portal/${slug}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Portal not found");
      }
      return response.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-semibold">Portal Not Available</h2>
              <p className="text-muted-foreground">
                {error instanceof Error ? error.message : "This portal is not currently accepting submissions."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <h2 className="text-xl font-semibold">Thank You!</h2>
              <p className="text-muted-foreground">
                Your startup has been submitted to {portalData.investor.fundName}. 
                They will review your submission and get back to you.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { portal, investor } = portalData;

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="text-center space-y-4">
          {investor.logoUrl && (
            <img 
              src={investor.logoUrl} 
              alt={investor.fundName} 
              className="h-16 w-auto mx-auto object-contain"
              data-testid="img-investor-logo"
            />
          )}
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-fund-name">{investor.fundName}</h1>
            {portal.tagline && (
              <p className="text-muted-foreground mt-1" data-testid="text-tagline">{portal.tagline}</p>
            )}
          </div>
          {portal.welcomeMessage && (
            <p className="text-muted-foreground max-w-lg mx-auto" data-testid="text-welcome">
              {portal.welcomeMessage}
            </p>
          )}
        </div>

        <StartupSubmitForm 
          userRole="portal"
          portalSlug={slug}
          portalRequiredFields={portal.requiredFields || []}
          onSuccess={() => setSubmitted(true)}
        />

        {investor.website && (
          <p className="text-center text-sm text-muted-foreground">
            Learn more at{" "}
            <a 
              href={investor.website} 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
              data-testid="link-investor-website"
            >
              {investor.website.replace(/^https?:\/\//, "")}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
