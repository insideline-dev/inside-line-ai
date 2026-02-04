import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StartupCard } from "@/components/startup/StartupCard";
import { mockStartups } from "@/mocks/data/startups";
import { BarChart3, Clock, CheckCircle, XCircle } from "lucide-react";

export const Route = createFileRoute("/_protected/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const pending = mockStartups.filter((s) => s.status === "pending_review");
  const analyzing = mockStartups.filter((s) => s.status === "analyzing");
  const approved = mockStartups.filter((s) => s.status === "approved");
  const rejected = mockStartups.filter((s) => s.status === "rejected");

  const reviewQueue = [...pending, ...analyzing];

  const stats = [
    {
      label: "Pending Review",
      value: pending.length,
      icon: Clock,
      color: "text-yellow-600",
    },
    {
      label: "Analyzing",
      value: analyzing.length,
      icon: BarChart3,
      color: "text-blue-600",
    },
    {
      label: "Approved",
      value: approved.length,
      icon: CheckCircle,
      color: "text-green-600",
    },
    {
      label: "Rejected",
      value: rejected.length,
      icon: XCircle,
      color: "text-red-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Review and manage startup submissions</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-2xl font-semibold mb-4">Review Queue</h2>
        {reviewQueue.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No startups in review queue</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviewQueue.map((startup) => (
              <StartupCard key={startup.id} startup={startup} basePath="/admin" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
