import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { 
  ArrowRight, 
  Loader2, 
  Mail, 
  MessageSquare, 
  FileText, 
  Globe, 
  Sparkles,
  Users,
  Target,
  Clock,
  Database,
  Brain,
  FileCheck,
  ChevronRight,
  Search,
  UserCheck,
  GitBranch,
  BarChart3,
  Handshake,
  Shield,
  Workflow
} from "lucide-react";
function InsideLineLogo() {
  return (
    <span className="text-xl font-semibold tracking-tight">Inside Line</span>
  );
}

interface AuthUser {
  id: string;
  role?: "founder" | "investor" | "admin" | null;
  needsRoleSelection?: boolean;
}

const workflowStages = [
  {
    id: "extraction",
    title: "Data Extraction",
    description: "Pitch materials are parsed and structured. Key data points—financials, team details, product specs—are extracted and normalized automatically.",
    icon: Database,
  },
  {
    id: "team",
    title: "Team Intelligence",
    description: "Founder backgrounds, prior roles, track records, and network connections are researched and compiled from public and proprietary sources.",
    icon: UserCheck,
  },
  {
    id: "research",
    title: "Deep Research",
    description: "Market dynamics, competitor landscape, funding history, and traction signals are gathered and synthesized into a unified view.",
    icon: Search,
  },
  {
    id: "evaluation",
    title: "Evaluation Pipeline",
    description: "Specialized AI agents assess team quality, market opportunity, product-market fit, competitive positioning, financials, risk factors, and exit potential.",
    icon: BarChart3,
  },
  {
    id: "matching",
    title: "Investor Matching",
    description: "Startups are scored against investor theses and prioritized by alignment—surfacing only the highest-signal opportunities.",
    icon: Handshake,
  },
];

function WorkflowStages() {
  return (
    <div data-testid="workflow-stages">
      {/* Horizontal stages with connecting lines */}
      <div className="relative">
        {/* Connecting line - visible on larger screens */}
        <div className="hidden lg:block absolute top-8 left-[10%] right-[10%] h-px bg-border" />
        
        {/* Stages grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {workflowStages.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.id}
                className="relative flex flex-col items-center text-center"
                data-testid={`workflow-stage-${stage.id}`}
              >
                {/* Stage number badge */}
                <div className="absolute -top-2 -left-2 sm:static sm:mb-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center z-10">
                  {index + 1}
                </div>
                
                {/* Icon */}
                <div className="relative z-10 p-4 rounded-xl bg-card border border-border mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                
                {/* Title */}
                <h3 className="font-semibold text-sm mb-2">{stage.title}</h3>
                
                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {stage.description}
                </p>
                
                {/* Arrow to next stage - visible on large screens */}
                {index < workflowStages.length - 1 && (
                  <ChevronRight className="hidden lg:block absolute -right-3 top-8 w-5 h-5 text-muted-foreground z-20" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DealIntakeVisual() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const intakeMethods = [
    { icon: Mail, label: "Forward an email" },
    { icon: MessageSquare, label: "Forward from WhatsApp" },
    { icon: FileText, label: "Submit on platform" },
    { icon: Globe, label: "Your branded page" },
    { icon: Sparkles, label: "InsideLine matches" },
  ];

  return (
    <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-8 items-center" data-testid="deal-intake-visual">
      {/* Intake Methods */}
      <div className="space-y-3">
        {intakeMethods.map((method, index) => {
          const Icon = method.icon;
          return (
            <div
              key={method.label}
              className={`flex items-center gap-3 p-4 bg-card border border-border rounded-lg hover-elevate ${
                prefersReducedMotion ? '' : 'transition-all duration-200'
              }`}
              style={prefersReducedMotion ? {} : { animationDelay: `${index * 100}ms` }}
              data-testid={`intake-method-${index}`}
            >
              <div className="p-2 rounded-md bg-muted">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium">{method.label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
            </div>
          );
        })}
      </div>

      {/* Center Core */}
      <div className="hidden lg:flex flex-col items-center py-8">
        <div className="w-px h-12 bg-gradient-to-b from-transparent via-border to-border" />
        <div className="p-6 rounded-2xl bg-primary/5 border border-primary/20 my-4">
          <Brain className="w-10 h-10 text-primary mb-3 mx-auto" />
          <div className="text-center">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Automated
            </div>
            <div className="text-sm font-semibold">First-Pass Analysis</div>
          </div>
        </div>
        <div className="w-px h-12 bg-gradient-to-b from-border via-border to-transparent" />
      </div>

      {/* Output */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <FileCheck className="w-6 h-6 text-primary" />
          <div>
            <div className="font-semibold">Analyst-Grade Report</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Delivered in under an hour
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {['Team', 'Market', 'Product', 'Competition', 'Traction', 'Financials', 'Risk Factors', 'Thesis Alignment'].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const [mounted, setMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  useEffect(() => {
    setMounted(true);
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
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
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 h-16">
            <Link href="/" className="flex items-center" data-testid="link-nav-brand">
              <InsideLineLogo />
            </Link>
            <div className="flex items-center gap-4">
              <Link 
                href="/founder/submit" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
                data-testid="link-nav-submit"
              >
                Submit your startup
              </Link>
              <Link 
                href="/scout/apply" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
                data-testid="link-nav-scout"
              >
                Apply as a scout
              </Link>
              <Button size="sm" asChild data-testid="button-nav-early-access">
                <a href="/api/login">Get early access</a>
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div 
            className={`max-w-3xl mx-auto text-center ${
              prefersReducedMotion ? '' : `transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`
            }`}
          >
            <h1 
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6"
              data-testid="text-hero-headline"
            >
              Your AI Venture Analyst
              <br />
              <span className="text-primary">Working Every Deal</span>
            </h1>

            <p 
              className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed"
              data-testid="text-hero-subheadline"
            >
              InsideLine owns first-pass deal intake, research, evaluation, and thesis alignment—producing a scored pipeline and analyst-grade investment memos within the hour.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <Button size="lg" className="gap-2 w-full sm:w-auto" asChild data-testid="button-hero-early-access">
                <a href="/api/login">
                  Get early access
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
              <div className="flex items-center gap-4 text-sm">
                <Link 
                  href="/founder/submit" 
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-hero-submit"
                >
                  Submit your startup
                </Link>
                <span className="text-border">|</span>
                <Link 
                  href="/scout/apply" 
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-hero-scout"
                >
                  Apply as a scout
                </Link>
              </div>
            </div>

            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2" data-testid="text-hero-trust">
              <Shield className="w-4 h-4" />
              Confidential by default. Built for investor-grade diligence.
            </p>
          </div>
        </div>
      </section>

      {/* Scroll Bridge */}
      <section className="py-12 px-6 bg-primary/5 border-y border-primary/10">
        <div className="max-w-[1200px] mx-auto text-center">
          <p className="text-lg sm:text-xl font-medium text-primary" data-testid="text-scroll-bridge">
            From the moment a pitch arrives, InsideLine takes full ownership of first-pass diligence.
          </p>
        </div>
      </section>

      {/* Deal Intake Section */}
      <section className="py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-intake-heading">
              Deal Intake
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto" data-testid="text-intake-subheading">
              Bring deals in the way they already reach you. InsideLine takes it from there.
            </p>
          </div>

          <DealIntakeVisual />
        </div>
      </section>

      {/* Workflow Stages */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-workflow-heading">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Five stages of automated analysis, from intake to investor-ready output.
            </p>
          </div>

          <WorkflowStages />
        </div>
      </section>

      {/* Stack Positioning Divider */}
      <section className="py-16 px-6 border-t border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-muted">
                <Mail className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium">Inbound Pitches</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground hidden lg:block" />
            <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-primary/10 border border-primary/20">
              <Brain className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold text-primary">InsideLine</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground hidden lg:block" />
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-muted">
                <Workflow className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium">CRM / Data / Docs</span>
            </div>
          </div>
          <p className="text-center text-muted-foreground mt-6 max-w-2xl mx-auto" data-testid="text-stack-positioning">
            InsideLine runs before CRMs, data platforms, and internal docs—turning inbound pitches into structured investment signal.
          </p>
        </div>
      </section>

      {/* Investors Section */}
      <section className="py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <Users className="w-4 h-4" />
                For Investors
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-investors-heading">
                First-pass diligence, fully owned
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed" data-testid="text-investors-subheading">
                InsideLine acts as your tireless analyst—sourcing deals, enriching them with external data, streamlining evaluation, and prioritizing the highest-signal opportunities. You focus on what matters: the final decision.
              </p>
              <Button className="gap-2" asChild data-testid="button-investor-cta">
                <a href="/api/login">
                  Get early access
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
            </div>
            <div className="bg-card border border-border rounded-xl p-8">
              <div className="space-y-6">
                {[
                  { label: "Standardized evaluation", desc: "Every deal analyzed across the same rigorous framework" },
                  { label: "Thesis alignment scoring", desc: "Opportunities ranked by fit to your investment criteria" },
                  { label: "Time reclaimed", desc: "Hours of intake work reduced to minutes of review" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                      <Target className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-sm text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Founders Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 bg-card border border-border rounded-xl p-8">
              <div className="space-y-6">
                {[
                  { label: "Objective assessment", desc: "See your startup through an investor's analytical lens" },
                  { label: "Strategic routing", desc: "Matched only to funds whose thesis aligns with your stage and sector" },
                  { label: "One submission, many opportunities", desc: "Submit once—get discovered by the right investors" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                      <Target className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-sm text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <Users className="w-4 h-4" />
                For Founders
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-founders-heading">
                Reach investors who are looking for you
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed" data-testid="text-founders-subheading">
                InsideLine provides an objective assessment of how investors will perceive your company—and routes your application to funds where there is genuine strategic alignment. No more spray and pray.
              </p>
              <Button className="gap-2" asChild data-testid="button-founder-cta">
                <a href="/founder/submit">
                  Submit your startup
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Scouts Section */}
      <section className="py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <Users className="w-4 h-4" />
                For Scouts
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-scouts-heading">
                Build your reputation through quality referrals
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed" data-testid="text-scouts-subheading">
                Surface promising companies to investors who trust your judgment. Every referral is tracked, attributed, and builds your standing in the network. Your insight, recognized.
              </p>
              <Button variant="outline" className="gap-2" asChild data-testid="button-scout-cta">
                <Link href="/scout/apply">
                  Apply as a scout
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
            <div className="bg-card border border-border rounded-xl p-8">
              <div className="space-y-6">
                {[
                  { label: "Full attribution", desc: "Every referral tracked and credited to you" },
                  { label: "Reputation building", desc: "Your track record grows with each quality submission" },
                  { label: "Trusted network", desc: "Connect founders with investors who value your sourcing" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                      <Target className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-sm text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-cta-heading">
            The future of venture diligence
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto" data-testid="text-cta-subheadline">
            Analyst-grade rigor, speed, and consistency—without changing how investors work.
          </p>
          <Button size="lg" className="gap-2" asChild data-testid="button-cta-primary">
            <a href="/api/login">
              Get early access
              <ArrowRight className="w-4 h-4" />
            </a>
          </Button>
          <p className="text-sm text-muted-foreground mt-6 flex items-center justify-center gap-2" data-testid="text-cta-trust">
            <Shield className="w-4 h-4" />
            Confidential by default. Built for investor-grade workflows.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4">
            <div className="flex items-center" data-testid="text-footer-brand">
              <InsideLineLogo />
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/founder/submit" className="hover:text-foreground transition-colors" data-testid="link-footer-submit">
                Submit your startup
              </Link>
              <Link href="/scout/apply" className="hover:text-foreground transition-colors" data-testid="link-footer-scout">
                Apply as a scout
              </Link>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-footer-copyright">
              {new Date().getFullYear()} InsideLine. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
