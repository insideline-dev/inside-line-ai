import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useScoutControllerGetScoutApplications,
  useScoutControllerApproveApplication,
  useScoutControllerRejectApplication,
  getScoutControllerGetScoutApplicationsQueryKey,
} from "@/api/generated/scout/scout";
import type { ScoutApplication } from "@/types/user";

export const Route = createFileRoute("/_protected/admin/scouts")({
  component: ScoutApplications,
});

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ScoutApplications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: response, isLoading, error } = useScoutControllerGetScoutApplications();
  const applications = (response?.data as ScoutApplication[] | undefined) ?? [];

  const { mutate: approveApplication, isPending: isApproving } = useScoutControllerApproveApplication({
    mutation: {
      onSuccess: () => {
        toast.success("Scout application approved");
        queryClient.invalidateQueries({ queryKey: getScoutControllerGetScoutApplicationsQueryKey() });
      },
      onError: (err) => {
        toast.error("Failed to approve application", { description: (err as Error).message });
      },
    },
  });

  const { mutate: rejectApplication, isPending: isRejecting } = useScoutControllerRejectApplication({
    mutation: {
      onSuccess: () => {
        toast.success("Scout application rejected");
        queryClient.invalidateQueries({ queryKey: getScoutControllerGetScoutApplicationsQueryKey() });
      },
      onError: (err) => {
        toast.error("Failed to reject application", { description: (err as Error).message });
      },
    },
  });

  const handleApprove = (id: string | number) => {
    approveApplication({ id: id.toString() });
  };

  const handleReject = (id: string | number) => {
    rejectApplication({ id: id.toString(), data: { rejectionReason: "Does not meet criteria" } });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Scout Applications</h1>
          <p className="text-muted-foreground">Review and approve scout applications</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Pending Applications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Scout Applications</h1>
          <p className="text-muted-foreground">Review and approve scout applications</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            Failed to load applications: {(error as Error).message}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scout Applications</h1>
        <p className="text-muted-foreground">Review and approve scout applications</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Applications</CardTitle>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No pending scout applications</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Name
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Experience
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Applied At
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => (
                    <tr key={application.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{application.name}</p>
                          {application.linkedinUrl && (
                            <a
                              href={application.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              LinkedIn
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {application.email}
                      </td>
                      <td className="py-3 px-4 text-sm max-w-xs truncate">
                        {application.experience}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          className={
                            statusColors[application.status] || "bg-gray-100 text-gray-800"
                          }
                          variant="outline"
                        >
                          {application.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {formatDate(application.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        {application.status === "pending" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleApprove(application.id)}
                              disabled={isApproving || isRejecting}
                            >
                              {isApproving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReject(application.id)}
                              disabled={isApproving || isRejecting}
                            >
                              {isRejecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
