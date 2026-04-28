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

export interface SubmitOnboardingWebsiteResponse {
  status: "queued";
  website: string;
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
    onSuccess: () => {
      // Refresh thesis so the page picks up the new `websiteScrapedAt`
      // and flips into the generating state.
      queryClient.invalidateQueries({
        queryKey: getInvestorControllerGetThesisQueryKey(),
      });
    },
  });
}
