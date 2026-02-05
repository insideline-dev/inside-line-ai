import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Clock, CheckCircle, XCircle, Loader2, Binoculars } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  reviewedBy?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
}

function ApplicationCard({ 
  application, 
  onReview 
}: { 
  application: ScoutApplication;
  onReview: (app: ScoutApplication) => void;
}) {
  return (
    <Card className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold" data-testid={`text-applicant-name-${application.id}`}>
                {application.name}
              </h3>
              <Badge variant={
                application.status === "pending" ? "secondary" :
                application.status === "approved" ? "default" : "destructive"
              }>
                {application.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                {application.status === "approved" && <CheckCircle className="w-3 h-3 mr-1" />}
                {application.status === "rejected" && <XCircle className="w-3 h-3 mr-1" />}
                {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{application.email}</p>
            {application.linkedinUrl && (
              <a 
                href={application.linkedinUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                LinkedIn Profile
              </a>
            )}
            {application.experience && (
              <p className="text-sm mt-2 line-clamp-2">{application.experience}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Applied {new Date(application.createdAt).toLocaleDateString()}
            </p>
          </div>
          {application.status === "pending" && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onReview(application)}
              data-testid={`button-review-${application.id}`}
            >
              Review
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ApplicationListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminScouts() {
  const { toast } = useToast();
  const [selectedApplication, setSelectedApplication] = useState<ScoutApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: applications, isLoading } = useQuery<ScoutApplication[]>({
    queryKey: ["/api/admin/scout-applications"],
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: "approved" | "rejected"; notes: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/scout-applications/${id}`, {
        status,
        reviewNotes: notes,
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.status === "approved" ? "Application Approved" : "Application Rejected",
        description: variables.status === "approved" 
          ? "The scout has been notified and can now submit startups."
          : "The applicant has been notified.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scout-applications"] });
      setSelectedApplication(null);
      setReviewNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to review application",
        variant: "destructive",
      });
    },
  });

  const stats = {
    pending: applications?.filter(a => a.status === "pending").length || 0,
    approved: applications?.filter(a => a.status === "approved").length || 0,
    rejected: applications?.filter(a => a.status === "rejected").length || 0,
  };

  const handleReview = (status: "approved" | "rejected") => {
    if (selectedApplication) {
      reviewMutation.mutate({
        id: selectedApplication.id,
        status,
        notes: reviewNotes,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Scout Applications</h1>
        <p className="text-muted-foreground">Review and manage scout applications</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-pending">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Scouts</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-approved">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-rejected">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending
            {stats.pending > 0 && (
              <Badge variant="secondary" className="ml-2">{stats.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <ApplicationListSkeleton />
        ) : (
          <>
            <TabsContent value="pending" className="space-y-4">
              {applications?.filter(a => a.status === "pending").length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Binoculars className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">No pending applications</h3>
                    <p className="text-sm text-muted-foreground">
                      All scout applications have been reviewed
                    </p>
                  </CardContent>
                </Card>
              ) : (
                applications?.filter(a => a.status === "pending").map(app => (
                  <ApplicationCard 
                    key={app.id} 
                    application={app} 
                    onReview={setSelectedApplication}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="approved" className="space-y-4">
              {applications?.filter(a => a.status === "approved").map(app => (
                <ApplicationCard 
                  key={app.id} 
                  application={app} 
                  onReview={setSelectedApplication}
                />
              ))}
              {applications?.filter(a => a.status === "approved").length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">No approved scouts yet</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="rejected" className="space-y-4">
              {applications?.filter(a => a.status === "rejected").map(app => (
                <ApplicationCard 
                  key={app.id} 
                  application={app} 
                  onReview={setSelectedApplication}
                />
              ))}
              {applications?.filter(a => a.status === "rejected").length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">No rejected applications</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="all" className="space-y-4">
              {applications?.map(app => (
                <ApplicationCard 
                  key={app.id} 
                  application={app} 
                  onReview={setSelectedApplication}
                />
              ))}
              {applications?.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">No applications yet</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      <Dialog open={!!selectedApplication} onOpenChange={() => setSelectedApplication(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Scout Application</DialogTitle>
            <DialogDescription>
              Review the application details and approve or reject.
            </DialogDescription>
          </DialogHeader>
          
          {selectedApplication && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Name</p>
                  <p>{selectedApplication.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Email</p>
                  <p>{selectedApplication.email}</p>
                </div>
              </div>
              
              {selectedApplication.linkedinUrl && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">LinkedIn</p>
                  <a 
                    href={selectedApplication.linkedinUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {selectedApplication.linkedinUrl}
                  </a>
                </div>
              )}
              
              {selectedApplication.experience && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Experience</p>
                  <p className="text-sm">{selectedApplication.experience}</p>
                </div>
              )}
              
              {selectedApplication.motivation && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Motivation</p>
                  <p className="text-sm">{selectedApplication.motivation}</p>
                </div>
              )}
              
              {selectedApplication.dealflowSources && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Deal Sources</p>
                  <p className="text-sm">{selectedApplication.dealflowSources}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Review Notes (optional)</p>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes about your decision..."
                  rows={3}
                  data-testid="input-review-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedApplication(null)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleReview("rejected")}
              disabled={reviewMutation.isPending}
              data-testid="button-reject"
            >
              {reviewMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Reject"
              )}
            </Button>
            <Button
              onClick={() => handleReview("approved")}
              disabled={reviewMutation.isPending}
              data-testid="button-approve"
            >
              {reviewMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Approve"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
