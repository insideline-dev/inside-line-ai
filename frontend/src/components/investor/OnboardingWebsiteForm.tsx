import { useState, type FormEvent } from "react";
import { ArrowRight, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OnboardingWebsiteFormProps {
  initialWebsite?: string;
  isSubmitting: boolean;
  submitLabel?: string;
  onSubmit: (website: string) => void;
  onSkip?: () => void;
}

// Shared between the dedicated onboarding screen and the "Re-scan" dialog
// on the thesis page. Validation is intentionally lenient — backend normalizes.
const WEBSITE_PATTERN = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;

export function OnboardingWebsiteForm({
  initialWebsite = "",
  isSubmitting,
  submitLabel = "Continue",
  onSubmit,
  onSkip,
}: OnboardingWebsiteFormProps) {
  const [website, setWebsite] = useState(initialWebsite);
  const [error, setError] = useState<string | null>(null);

  const validate = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return "Please enter your fund's website";
    if (!WEBSITE_PATTERN.test(trimmed)) return "Enter a valid URL (e.g. https://yourfund.com)";
    return null;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validate(website);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onSubmit(website.trim());
  };

  const handleBlur = () => {
    if (!website) return;
    setError(validate(website));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="onboarding-website">Your fund's website</Label>
        <div className="relative">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="onboarding-website"
            type="url"
            inputMode="url"
            autoComplete="url"
            autoFocus
            placeholder="https://yourfund.com"
            className="pl-9"
            value={website}
            disabled={isSubmitting}
            onChange={(event) => {
              setWebsite(event.target.value);
              if (error) setError(null);
            }}
            onBlur={handleBlur}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? "onboarding-website-error" : undefined}
          />
        </div>
        {error ? (
          <p id="onboarding-website-error" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            We'll read your site and draft your thesis and portfolio. You can edit anything afterwards.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" className="gap-2 sm:flex-1" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {submitLabel}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
        {onSkip ? (
          <Button
            type="button"
            variant="outline"
            className="sm:flex-1"
            onClick={onSkip}
            disabled={isSubmitting}
          >
            Skip for now
          </Button>
        ) : null}
      </div>
    </form>
  );
}
