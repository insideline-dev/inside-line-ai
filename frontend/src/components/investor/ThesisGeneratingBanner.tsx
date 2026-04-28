import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ThesisGeneratingBannerProps {
  website?: string | null;
}

const STEPS = [
  { id: "reading", label: "Reading your site" },
  { id: "extracting", label: "Extracting your portfolio" },
  { id: "drafting", label: "Drafting your thesis" },
] as const;

// Walks through the three sub-steps every ~6s. The job typically lands inside
// 30-45s; the websocket completion event will unmount this banner regardless,
// so the cycle is purely visual feedback.
const STEP_INTERVAL_MS = 6000;

export function ThesisGeneratingBanner({ website }: ThesisGeneratingBannerProps) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    }, STEP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const domain = (() => {
    if (!website) return null;
    try {
      return new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
    } catch {
      return website;
    }
  })();

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
          <div className="space-y-1">
            <p className="font-medium">Getting your profile ready</p>
            <p className="text-sm text-muted-foreground">
              {domain
                ? `Drafting your thesis from ${domain}. This usually takes under a minute.`
                : "Drafting your thesis. This usually takes under a minute."}
            </p>
          </div>
        </div>
        <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          {STEPS.map((step, index) => {
            const isDone = index < activeStep;
            const isActive = index === activeStep;
            return (
              <li
                key={step.id}
                className={cn(
                  "flex items-center gap-2 text-sm transition-opacity",
                  isActive ? "text-foreground" : "text-muted-foreground",
                  !isActive && !isDone ? "opacity-60" : "",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                    isDone
                      ? "border-primary bg-primary text-primary-foreground"
                      : isActive
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {isDone ? (
                    <Check className="h-3 w-3" />
                  ) : isActive ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{step.label}</span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
