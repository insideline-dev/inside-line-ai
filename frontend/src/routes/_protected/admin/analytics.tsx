import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockStartups } from "@/mocks/data/startups";
import { TrendingUp, Building2, DollarSign, Award } from "lucide-react";

export const Route = createFileRoute("/_protected/admin/analytics")({
  component: AnalyticsDashboard,
});

function AnalyticsDashboard() {
  const totalStartups = mockStartups.length;
  const withScores = mockStartups.filter((s) => s.overallScore);
  const avgScore =
    withScores.length > 0
      ? Math.round(withScores.reduce((sum, s) => sum + (s.overallScore || 0), 0) / withScores.length)
      : 0;

  const sectorCounts = mockStartups.reduce(
    (acc, s) => {
      if (s.sectorIndustryGroup) {
        acc[s.sectorIndustryGroup] = (acc[s.sectorIndustryGroup] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const topSector = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])[0];

  const stats = [
    {
      label: "Total Startups",
      value: totalStartups,
      icon: Building2,
      color: "text-blue-600",
    },
    {
      label: "Average Score",
      value: avgScore,
      icon: Award,
      color: "text-green-600",
    },
    {
      label: "Top Sector",
      value: topSector ? topSector[0].replace(/_/g, " ") : "N/A",
      icon: TrendingUp,
      color: "text-purple-600",
    },
    {
      label: "Total Deal Value",
      value: "$" + Math.round(mockStartups.reduce((sum, s) => sum + (s.roundSize || 0), 0) / 1_000_000) + "M",
      icon: DollarSign,
      color: "text-yellow-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Platform insights and metrics</p>
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Chart placeholder</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submissions Over Time</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Chart placeholder</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Startups by Stage</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Chart placeholder</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Chart placeholder</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
