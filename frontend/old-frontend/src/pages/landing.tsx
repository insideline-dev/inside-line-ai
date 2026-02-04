import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowRight, Loader2 } from "lucide-react";
import insideLineLogo from "@assets/Gemini_Generated_Image_dh6rvtdh6rvtdh6r_1769352093821.png";

interface AuthUser {
  id: string;
  role?: "founder" | "investor" | "admin" | null;
  needsRoleSelection?: boolean;
}

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const [mounted, setMounted] = useState(false);
  
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (user) {
      if (user.needsRoleSelection || !user.role) {
        setLocation("/select-role");
        return;
      }
      
      const returnTo = sessionStorage.getItem("returnTo");
      if (returnTo) {
        sessionStorage.removeItem("returnTo");
        setLocation(returnTo);
        return;
      }
      
      if (user.role === "admin") {
        setLocation("/admin");
      } else if (user.role === "investor") {
        setLocation("/investor");
      } else {
        setLocation("/founder");
      }
    }
  }, [user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 h-16">
            <Link href="/" className="flex items-center" data-testid="link-nav-brand">
              <img src={insideLineLogo} alt="Inside Line" className="h-9 w-auto object-contain" />
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button variant="ghost" size="sm" asChild data-testid="button-login">
                <a href="/api/login">Sign in</a>
              </Button>
              <Button size="sm" asChild data-testid="button-get-started">
                <a href="/founder/submit">Get started</a>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div 
            className={`transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          >
            <h1 
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.15] mb-6"
              data-testid="text-hero-headline"
            >
              Your strategic
              <span className="text-primary"> advantage </span>
              in venture decisions
            </h1>

            <p 
              className="text-lg text-muted-foreground max-w-xl mb-8"
              data-testid="text-hero-subheadline"
            >
              AI agents analyze pitch decks, financials, and market data—delivering actionable insights that connect startups to investors aligned with their growth story.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-12">
              <Button size="lg" className="gap-2" asChild data-testid="button-hero-primary">
                <a href="/founder/submit">
                  Submit your startup
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild data-testid="button-hero-investor">
                <a href="/api/login/investor">
                  I'm an investor
                </a>
              </Button>
            </div>
          </div>

          {/* Simple visual element */}
          <div 
            className={`relative transition-all duration-700 delay-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
            data-testid="visual-hero"
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
                  <div className="h-full bg-primary rounded-full" style={{ width: '100%' }} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                  {['Market', 'Team', 'Product', 'Traction'].map((item) => (
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
                description: "Specialized agents analyze market, team, traction, product, competition, and more.",
              },
              {
                number: "03",
                title: "Smart matching",
                description: "Agents recommend you to investors whose thesis matches what you're building.",
              },
            ].map((item) => (
              <div key={item.number} data-testid={`value-prop-${item.number}`}>
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
          <h2 className="text-2xl sm:text-3xl font-bold mb-4" data-testid="text-investors-heading">
            For investors
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto" data-testid="text-investors-subheading">
            Define your thesis once. Our agents continuously match you with pre-analyzed startups that fit your criteria. No sourcing, just signal.
          </p>
          <Button variant="outline" asChild data-testid="button-investor-cta">
            <a href="/api/login/investor">
              Join as an investor
            </a>
          </Button>
        </div>
      </section>

      {/* For Scouts */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4" data-testid="text-scouts-heading">
            For scouts
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto" data-testid="text-scouts-subheading">
            Help promising startups get discovered. Apply to become a scout and submit startups on behalf of founders you believe in.
          </p>
          <Button variant="outline" asChild data-testid="button-scout-cta">
            <Link href="/scout/apply">
              Apply as a scout
            </Link>
          </Button>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-cta-heading">
            Let AI work for your raise
          </h2>
          <p className="text-muted-foreground text-lg mb-8" data-testid="text-cta-subheading">
            Submit once. Our agents do the rest.
          </p>
          <Button size="lg" className="gap-2" asChild data-testid="button-cta-primary">
            <a href="/founder/submit">
              Get started
              <ArrowRight className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4">
            <div className="flex items-center" data-testid="text-footer-brand">
              <img src={insideLineLogo} alt="Inside Line" className="h-6 w-auto object-contain" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-footer-copyright">
              {new Date().getFullYear()} Inside Line. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
