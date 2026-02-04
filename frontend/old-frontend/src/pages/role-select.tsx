import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, TrendingUp, Loader2, ArrowRight } from "lucide-react";

export default function RoleSelectPage() {
  const [, setLocation] = useLocation();
  const [selectedRole, setSelectedRole] = useState<"founder" | "investor" | null>(null);

  const setRoleMutation = useMutation({
    mutationFn: async (role: "founder" | "investor") => {
      return await apiRequest("POST", "/api/auth/set-role", { role });
    },
    onSuccess: (_, role) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      if (role === "investor") {
        setLocation("/investor");
      } else {
        setLocation("/founder");
      }
    },
  });

  const handleSelectRole = (role: "founder" | "investor") => {
    setSelectedRole(role);
    setRoleMutation.mutate(role);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-30" />
      <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-30" />
      
      <div className="relative w-full max-w-2xl space-y-10">
        <div className="text-center space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-1.5" data-testid="text-brand">
            <span className="text-2xl font-bold tracking-tight">Inside Line</span>
            <span className="text-primary font-semibold">.AI</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-heading">
            How will you use Inside Line?
          </h1>
          <p className="text-muted-foreground" data-testid="text-subheading">Choose your role to get started</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card 
            className={selectedRole === "founder" ? "ring-2 ring-primary" : ""}
            data-testid="card-role-founder"
          >
            <CardContent className="p-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Building2 className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2" data-testid="text-founder-title">I'm a Founder</h2>
              <p className="text-muted-foreground text-sm mb-6" data-testid="text-founder-desc">
                Get your startup evaluated by AI and connect with matching investors.
              </p>
              <Button 
                className="w-full gap-2"
                disabled={setRoleMutation.isPending}
                onClick={() => handleSelectRole("founder")}
                data-testid="button-select-founder"
              >
                {setRoleMutation.isPending && selectedRole === "founder" ? (
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

          <Card 
            className={selectedRole === "investor" ? "ring-2 ring-primary" : ""}
            data-testid="card-role-investor"
          >
            <CardContent className="p-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <TrendingUp className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2" data-testid="text-investor-title">I'm an Investor</h2>
              <p className="text-muted-foreground text-sm mb-6" data-testid="text-investor-desc">
                Define your thesis and receive curated, pre-analyzed deal flow.
              </p>
              <Button 
                className="w-full gap-2"
                variant="outline"
                disabled={setRoleMutation.isPending}
                onClick={() => handleSelectRole("investor")}
                data-testid="button-select-investor"
              >
                {setRoleMutation.isPending && selectedRole === "investor" ? (
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
        </div>
      </div>
    </div>
  );
}
