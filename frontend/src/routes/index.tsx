import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowRight } from "lucide-react";
import insideLineLogo from "@/assets/inside-line-logo.png";
import { env } from "@/env";
import { useMockAuthStore } from "@/stores";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const { currentRole } = useMockAuthStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // If mock auth is enabled and user has a role, redirect to dashboard
  useEffect(() => {
    if (env.VITE_MOCK_AUTH && currentRole) {
      navigate({ to: `/${currentRole}` });
    }
  }, [currentRole, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 h-16">
            <Link to="/" className="flex items-center">
              <img src={insideLineLogo} alt="Inside Line" className="h-9 w-auto object-contain" />
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/login">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div
            className={`transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.15] mb-6">
              Your strategic
              <span className="text-primary"> advantage </span>
              in venture decisions
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl mb-8">
              AI agents analyze pitch decks, financials, and market data—delivering actionable insights
              that connect startups to investors aligned with their growth story.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-12">
              <Button size="lg" className="gap-2" asChild>
                <Link to="/login" search={{ redirect: "/founder/submit" }}>
                  Submit your startup
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login" search={{ redirect: "/investor" }}>
                  I'm an investor
                </Link>
              </Button>
            </div>
          </div>

          {/* Visual element */}
          <div
            className={`relative transition-all duration-700 delay-200 ${mounted ? "opacity-100" : "opacity-0"}`}
          >
            <div className="bg-card border border-border rounded-xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">AI Agent Analysis</span>
                  <span className="text-xs text-primary font-medium">Complete</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: "100%" }} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                  {["Market", "Team", "Product", "Traction"].map((item) => (
                    <div key={item} className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">{item}</div>
                      <div className="text-lg font-semibold text-primary">A</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                number: "01",
                title: "One submission",
                description: "Upload your deck and website. Our AI agents take it from there.",
              },
              {
                number: "02",
                title: "Deep AI analysis",
                description:
                  "Specialized agents analyze market, team, traction, product, competition, and more.",
              },
              {
                number: "03",
                title: "Smart matching",
                description:
                  "Agents recommend you to investors whose thesis matches what you're building.",
              },
            ].map((item) => (
              <div key={item.number}>
                <div className="text-primary font-mono text-sm mb-3">{item.number}</div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Investors */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">For investors</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
            Define your thesis once. Our agents continuously match you with pre-analyzed startups
            that fit your criteria. No sourcing, just signal.
          </p>
          <Button variant="outline" asChild>
            <Link to="/login" search={{ redirect: "/investor" }}>
              Join as an investor
            </Link>
          </Button>
        </div>
      </section>

      {/* For Scouts */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">For scouts</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
            Help promising startups get discovered. Apply to become a scout and submit startups on
            behalf of founders you believe in.
          </p>
          <Button variant="outline" asChild>
            <Link to="/login" search={{ redirect: "/scout/apply" }}>
              Apply as a scout
            </Link>
          </Button>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Let AI work for your raise</h2>
          <p className="text-muted-foreground text-lg mb-8">Submit once. Our agents do the rest.</p>
          <Button size="lg" className="gap-2" asChild>
            <Link to="/login" search={{ redirect: "/founder/submit" }}>
              Get started
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4">
            <div className="flex items-center">
              <img src={insideLineLogo} alt="Inside Line" className="h-6 w-auto object-contain" />
            </div>
            <p className="text-sm text-muted-foreground">
              {new Date().getFullYear()} Inside Line. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
