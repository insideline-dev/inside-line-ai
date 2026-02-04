import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Save } from "lucide-react";

export const Route = createFileRoute("/_protected/investor/thesis")({
  component: InvestorThesisPage,
});

const stages = [
  { id: "pre_seed", label: "Pre-Seed" },
  { id: "seed", label: "Seed" },
  { id: "series_a", label: "Series A" },
  { id: "series_b", label: "Series B" },
  { id: "series_c", label: "Series C+" },
];

const sectors = [
  { id: "software", label: "Software/SaaS" },
  { id: "artificial_intelligence", label: "AI/ML" },
  { id: "fintech", label: "FinTech" },
  { id: "health_care", label: "HealthTech" },
  { id: "climate_tech", label: "Climate Tech" },
  { id: "ecommerce", label: "E-Commerce" },
];

function InvestorThesisPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investment Thesis</h1>
          <p className="text-muted-foreground">Configure your investment preferences</p>
        </div>
        <Button className="gap-2">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funding Stages</CardTitle>
            <CardDescription>Select the stages you invest in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stages.map((stage) => (
              <div key={stage.id} className="flex items-center space-x-2">
                <Checkbox id={stage.id} defaultChecked={stage.id === "seed" || stage.id === "series_a"} />
                <Label htmlFor={stage.id}>{stage.label}</Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Check Size</CardTitle>
            <CardDescription>Your typical investment range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min">Minimum ($)</Label>
                <Input id="min" type="number" placeholder="500,000" defaultValue="500000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max">Maximum ($)</Label>
                <Input id="max" type="number" placeholder="3,000,000" defaultValue="3000000" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sectors</CardTitle>
            <CardDescription>Industries you focus on</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sectors.map((sector) => (
              <div key={sector.id} className="flex items-center space-x-2">
                <Checkbox id={sector.id} defaultChecked={sector.id === "software" || sector.id === "artificial_intelligence"} />
                <Label htmlFor={sector.id}>{sector.label}</Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Geographies</CardTitle>
            <CardDescription>Regions you invest in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {["North America", "Europe", "Asia Pacific", "Latin America", "Middle East"].map((geo) => (
              <div key={geo} className="flex items-center space-x-2">
                <Checkbox id={geo} defaultChecked={geo === "North America" || geo === "Europe"} />
                <Label htmlFor={geo}>{geo}</Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thesis Narrative</CardTitle>
            <CardDescription>Describe your investment thesis in detail</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="We invest in early-stage B2B SaaS companies with strong technical founders..."
              className="min-h-[150px]"
              defaultValue="We invest in early-stage B2B SaaS and AI companies with strong technical founders. We look for companies with clear product-market fit signals, defensible technology, and large addressable markets."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
