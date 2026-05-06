import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/api/client";
import { getInvestorControllerGetThesisQueryKey } from "@/api/generated/investor/investor";
import {
  getInvestorOnboardingControllerSubmitWebsiteUrl,
  type InvestorOnboardingControllerSubmitWebsiteMutationBody,
} from "@/api/generated/investor-onboarding/investor-onboarding";

/**
 * DS-E3-F1-S2: investor onboarding website submit.
 *
 * Thin wrapper around the generated `useInvestorOnboardingControllerSubmitWebsite`
 * mutation. We narrow the response type because the OpenAPI spec advertises
 * `void` (NestJS doesn't infer return shape), but the controller actually
 * resolves with `{ status: "queued", website }` — and callers want that.
 */

const ONBOARDING_WEBSITE_PENDING_STORAGE_KEY = "investor:onboarding:website-pending";

export interface SubmitOnboardingWebsiteResponse {
  status: "queued";
  website: string;
}

export interface PendingOnboardingWebsiteState {
  website: string;
  queuedAt: string;
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readPendingOnboardingWebsiteState(): PendingOnboardingWebsiteState | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_WEBSITE_PENDING_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PendingOnboardingWebsiteState>;
    if (typeof parsed.website !== "string" || typeof parsed.queuedAt !== "string") {
      return null;
    }

    return {
      website: parsed.website,
      queuedAt: parsed.queuedAt,
    };
  } catch {
    return null;
  }
}

export function writePendingOnboardingWebsiteState(state: PendingOnboardingWebsiteState): void {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      ONBOARDING_WEBSITE_PENDING_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Ignore storage failures; the live query/websocket flow still works.
  }
}

export function clearPendingOnboardingWebsiteState(): void {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(ONBOARDING_WEBSITE_PENDING_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function useSubmitOnboardingWebsite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["investorOnboardingControllerSubmitWebsite"],
    mutationFn: (data: InvestorOnboardingControllerSubmitWebsiteMutationBody) =>
      customFetch<SubmitOnboardingWebsiteResponse>(
        getInvestorOnboardingControllerSubmitWebsiteUrl(),
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    onMutate: (data) => {
      const queuedAt = new Date().toISOString();
      writePendingOnboardingWebsiteState({
        website: data.website,
        queuedAt,
      });
      return { queuedAt, website: data.website };
    },
    onSuccess: () => {
      // Refresh thesis so the page picks up the new `websiteScrapedAt`
      // and flips into the generating state.
      queryClient.invalidateQueries({
        queryKey: getInvestorControllerGetThesisQueryKey(),
      });
    },
    onError: () => {
      clearPendingOnboardingWebsiteState();
    },
  });
}
