import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";
import type { ScoutApplication } from "@/types/user";

export const Route = createFileRoute("/_protected/admin/scouts")({
  component: ScoutApplications,
});

const mockScoutApplications: ScoutApplication[] = [
  {
    id: 1,
    userId: "user-pending-scout-1",
    name: "John Doe",
    email: "john@dealflow.com",
    linkedinUrl: "https://linkedin.com/in/johndoe",
    experience: "5 years as VC associate at early-stage fund",
    motivation: "Passionate about finding innovative B2B SaaS startups",
    dealflowSources: "Personal network, LinkedIn, startup events",
    status: "pending",
    createdAt: "2024-07-01T10:00:00Z",
  },
  {
    id: 2,
    userId: "user-pending-scout-2",
    name: "Jane Smith",
    email: "jane@startups.co",
    linkedinUrl: "https://linkedin.com/in/janesmith",
    experience: "Former founder, now angel investor and advisor",
    motivation: "Want to help promising startups get discovered",
    dealflowSources: "Accelerators, founder networks, Y Combinator",
    status: "pending",
    createdAt: "2024-07-03T10:00:00Z",
  },
];

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
          {mockScoutApplications.length === 0 ? (
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
                  {mockScoutApplications.map((application) => (
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
                            <Button size="sm" variant="default" icon={CheckCircle}>
                              Approve
                            </Button>
                            <Button size="sm" variant="destructive" icon={XCircle}>
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
