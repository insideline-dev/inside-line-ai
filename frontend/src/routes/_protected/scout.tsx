import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { RoleSidebar } from "@/components/layouts/RoleSidebar";
import { useScoutControllerGetMyApplications } from "@/api/generated/scout/scout";
import type { ScoutApplication } from "@/types/user";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, XCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_protected/scout")({
  component: ScoutLayout,
});

function ScoutLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isApplyPage = location.pathname === "/scout/apply";

  const { data: response, isLoading } = useScoutControllerGetMyApplications(
    {},
    { query: { enabled: !isApplyPage } },
  );

  const applications = (response?.data as ScoutApplication[] | undefined) ?? [];
  const hasApproved = applications.some((a) => a.status === "approved");
  const hasPending = applications.some((a) => a.status === "pending");
  const noApplications = !isLoading && applications.length === 0;

  useEffect(() => {
    if (!isApplyPage && noApplications) {
      navigate({ to: "/scout/apply", replace: true });
    }
  }, [isApplyPage, noApplications, navigate]);

  // Always allow the apply page
  if (isApplyPage) {
    return (
      <RoleSidebar role="scout">
        <Outlet />
      </RoleSidebar>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (hasApproved) {
    return (
      <RoleSidebar role="scout">
        <Outlet />
      </RoleSidebar>
    );
  }

  if (hasPending) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Clock className="h-12 w-12 mx-auto text-yellow-500" />
            <h2 className="text-xl font-semibold">Application Under Review</h2>
            <p className="text-muted-foreground">
              Your scout application is being reviewed. You'll be notified once a decision is made.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // All rejected
  if (applications.length > 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Application Not Approved</h2>
            <p className="text-muted-foreground">
              Your scout application was not approved at this time.
            </p>
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
