import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, Clock, XCircle, Binoculars } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AuthUser {
  id: string;
  role?: "founder" | "investor" | "admin" | "scout" | null;
}

interface ScoutApplication {
  id: number;
  userId: string;
  name: string;
  email: string;
  linkedinUrl?: string;
  experience?: string;
  motivation?: string;
  dealflowSources?: string;
  status: "pending" | "approved" | "rejected";
  reviewNotes?: string;
  createdAt: string;
}

export default function ScoutApply() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: user, isLoading: isAuthLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: existingApplication, isLoading: isAppLoading } = useQuery<ScoutApplication | null>({
    queryKey: ["/api/scout/application"],
    enabled: !!user,
  });

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    linkedinUrl: "",
    experience: "",
    motivation: "",
    dealflowSources: "",
  });

  const submitMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/scout/apply", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Application Submitted",
        description: "Your scout application has been submitted for review.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/scout/application"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit application",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!isAuthLoading && !user) {
      sessionStorage.setItem("returnTo", "/scout/apply");
      window.location.href = "/api/login/scout";
    }
  }, [user, isAuthLoading]);

  useEffect(() => {
    if (user?.role === "scout") {
      setLocation("/scout");
    }
  }, [user?.role, setLocation]);

  if (isAuthLoading || isAppLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (existingApplication) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              {existingApplication.status === "pending" && (
                <Clock className="w-12 h-12 text-yellow-500" />
              )}
              {existingApplication.status === "approved" && (
                <CheckCircle className="w-12 h-12 text-green-500" />
              )}
              {existingApplication.status === "rejected" && (
                <XCircle className="w-12 h-12 text-destructive" />
              )}
            </div>
            <CardTitle>
              {existingApplication.status === "pending" && "Application Under Review"}
              {existingApplication.status === "approved" && "Application Approved!"}
              {existingApplication.status === "rejected" && "Application Not Approved"}
            </CardTitle>
            <CardDescription>
              {existingApplication.status === "pending" && 
                "Your scout application is being reviewed. We'll notify you once a decision is made."}
              {existingApplication.status === "approved" && 
                "Congratulations! You've been approved as a scout. You can now submit startups."}
              {existingApplication.status === "rejected" && 
                "Unfortunately, your application was not approved at this time."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <Badge variant={
                existingApplication.status === "pending" ? "secondary" :
                existingApplication.status === "approved" ? "default" : "destructive"
              }>
                {existingApplication.status.charAt(0).toUpperCase() + existingApplication.status.slice(1)}
              </Badge>
            </div>
            {existingApplication.status === "approved" && (
              <div className="text-center">
                <Button onClick={() => setLocation("/scout")} data-testid="button-go-to-dashboard">
                  Go to Scout Dashboard
                </Button>
              </div>
            )}
            {existingApplication.reviewNotes && (
              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm font-medium mb-1">Review Notes:</p>
                <p className="text-sm text-muted-foreground">{existingApplication.reviewNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate(formData);
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
            <Binoculars className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Become a Scout</CardTitle>
          <CardDescription>
            Help us discover the next generation of great startups. Apply to become a scout and earn rewards for successful referrals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your full name"
                  required
                  data-testid="input-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your@email.com"
                  required
                  data-testid="input-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">LinkedIn Profile</Label>
              <Input
                id="linkedinUrl"
                value={formData.linkedinUrl}
                onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                placeholder="https://linkedin.com/in/yourprofile"
                data-testid="input-linkedin"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience">Relevant Experience</Label>
              <Textarea
                id="experience"
                value={formData.experience}
                onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                placeholder="Tell us about your background in venture capital, startups, or tech..."
                rows={3}
                data-testid="input-experience"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivation">Why do you want to be a scout?</Label>
              <Textarea
                id="motivation"
                value={formData.motivation}
                onChange={(e) => setFormData({ ...formData, motivation: e.target.value })}
                placeholder="What motivates you to help discover promising startups?"
                rows={3}
                data-testid="input-motivation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dealflowSources">Where do you source deals?</Label>
              <Textarea
                id="dealflowSources"
                value={formData.dealflowSources}
                onChange={(e) => setFormData({ ...formData, dealflowSources: e.target.value })}
                placeholder="Universities, accelerators, industry networks, geographic regions..."
                rows={3}
                data-testid="input-dealflow"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={submitMutation.isPending}
              data-testid="button-submit-application"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Application"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
