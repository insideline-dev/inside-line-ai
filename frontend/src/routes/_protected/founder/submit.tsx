import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { StartupSubmitForm } from "@/components/startup";

export const Route = createFileRoute("/_protected/founder/submit")({
  component: SubmitStartup,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      draftId: (search.draftId as string | undefined) || null,
    };
  },
});

function SubmitStartup() {
  const navigate = useNavigate();
  const { draftId } = useSearch({ from: "/_protected/founder/submit" });

  const handleSuccess = () => {
    navigate({ to: "/founder" });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <StartupSubmitForm
        userRole="founder"
        onSuccess={handleSuccess}
        redirectPath="/founder"
        enableDraftSaving={true}
        draftId={draftId}
      />
    </div>
  );
}
