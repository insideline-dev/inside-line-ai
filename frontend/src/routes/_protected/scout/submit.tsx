import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { StartupSubmitForm } from "@/components/startup";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getScoutControllerGetMySubmissionsQueryKey,
  useScoutControllerGetInvestors,
  useScoutControllerSubmit,
} from "@/api/generated/scout/scout";
import { useQueryClient } from "@tanstack/react-query";
import type {
  CreateStartupDto,
  ScoutInvestorsResponseDtoDataItem,
} from "@/api/generated/model";

export const Route = createFileRoute("/_protected/scout/submit")({
  component: ScoutSubmit,
});

function ScoutSubmit() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedInvestorId, setSelectedInvestorId] = useState<string>("");

  const { data: investorsResponse, isLoading: loadingInvestors } =
    useScoutControllerGetInvestors();

  const submitMutation = useScoutControllerSubmit();

  const approvedInvestors = useMemo(
    () => {
      const investors = (investorsResponse?.data.data ?? []) as ScoutInvestorsResponseDtoDataItem[];
      return investors.filter((investor) => investor.applicationStatus === "approved");
    },
    [investorsResponse],
  );

  const hasApprovedInvestor = approvedInvestors.length > 0;

  useEffect(() => {
    if (!selectedInvestorId && approvedInvestors.length > 0) {
      setSelectedInvestorId(approvedInvestors[0].id);
    }
  }, [approvedInvestors, selectedInvestorId]);

  const handleScoutSubmit = async (payload: CreateStartupDto) => {
    if (!selectedInvestorId) {
      throw new Error("Select an investor before submitting");
    }

    await submitMutation.mutateAsync({
      data: {
        investorId: selectedInvestorId,
        startupData: payload,
      },
    });

    await queryClient.invalidateQueries({
      queryKey: getScoutControllerGetMySubmissionsQueryKey(),
    });
  };

  const handleSuccess = () => {
    navigate({ to: "/scout" });
  };

  if (loadingInvestors) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Submit Startup</h1>
          <p className="text-muted-foreground">Loading your approved investor relationships...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Submit Startup</h1>
        <p className="text-muted-foreground">
          Submit a startup to an investor you are approved to scout for.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Target Investor</Label>
        <Select value={selectedInvestorId} onValueChange={setSelectedInvestorId}>
          <SelectTrigger>
            <SelectValue placeholder="Select an approved investor" />
          </SelectTrigger>
          <SelectContent>
            {approvedInvestors.map((investor) => (
              <SelectItem key={investor.id} value={investor.id}>
                {investor.name} ({investor.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!hasApprovedInvestor && (
        <Alert>
          <AlertDescription>
            You do not have any approved investor applications yet. Apply to an investor first from
            <span className="font-medium"> /scout/apply</span>.
          </AlertDescription>
        </Alert>
      )}

      {hasApprovedInvestor && (
        <StartupSubmitForm
          userRole="scout"
          onSubmitStartup={handleScoutSubmit}
          onSuccess={handleSuccess}
          successMessage="Startup submitted successfully. Analysis has started."
          showPrimaryContactSection={false}
        />
      )}
    </div>
  );
}
