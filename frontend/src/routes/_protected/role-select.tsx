import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, TrendingUp, Loader2, ArrowRight, Binoculars } from "lucide-react";
import { useSelectRole } from "@/lib/auth";

export const Route = createFileRoute("/_protected/role-select")({
  component: RoleSelectPage,
});

function RoleSelectPage() {
  const navigate = useNavigate();
  const selectRoleMutation = useSelectRole();
  const [selectedRole, setSelectedRole] = useState<"founder" | "investor" | null>(null);

  const handleSelectRole = (role: "founder" | "investor") => {
    setSelectedRole(role);
    selectRoleMutation.mutate(role);
  };

  const handleApplyAsScout = () => {
    sessionStorage.setItem("redirectAfterAuth", "/scout/apply");
    navigate({ to: "/scout/apply" });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-30" />
      <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-30" />

      <div className="relative w-full max-w-3xl space-y-10">
        <div className="text-center space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="text-2xl font-bold tracking-tight">Inside Line</span>
            <span className="text-primary font-semibold">.AI</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">How will you use Inside Line?</h1>
          <p className="text-muted-foreground">Choose your role to get started</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className={selectedRole === "founder" ? "ring-2 ring-primary" : ""}>
            <CardContent className="p-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Building2 className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">I'm a Founder</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Get your startup evaluated by AI and connect with matching investors.
              </p>
              <Button className="w-full gap-2" disabled={selectRoleMutation.isPending} onClick={() => handleSelectRole("founder")}>
                {selectRoleMutation.isPending && selectedRole === "founder" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Continue as Founder
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className={selectedRole === "investor" ? "ring-2 ring-primary" : ""}>
            <CardContent className="p-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <TrendingUp className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">I'm an Investor</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Define your thesis and receive curated, pre-analyzed deal flow.
              </p>
              <Button
                className="w-full gap-2"
                variant="outline"
                disabled={selectRoleMutation.isPending}
                onClick={() => handleSelectRole("investor")}
              >
                {selectRoleMutation.isPending && selectedRole === "investor" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Continue as Investor
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Binoculars className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Become a Scout</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Submit startups on behalf of founders you believe in. Requires approval.
              </p>
              <Button
                className="w-full gap-2"
                variant="outline"
                disabled={selectRoleMutation.isPending}
                onClick={handleApplyAsScout}
              >
                Apply as Scout
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
