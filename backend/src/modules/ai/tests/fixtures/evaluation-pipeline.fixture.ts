import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";

export function createEvaluationPipelineInput(): EvaluationPipelineInput {
  return {
    extraction: {
      companyName: "Clipaf",
      tagline: "AI workflow copilots for industrial operations",
      founderNames: ["Amina Rao", "Luca Hale"],
      industry: "Industrial SaaS",
      stage: "seed",
      location: "San Francisco, CA",
      website: "https://clipaf.com",
      fundingAsk: 2_500_000,
      valuation: 12_000_000,
      rawText: [
        "Clipaf provides workflow copilots for industrial operations teams.",
        "The product automates compliance reviews and quality workflows.",
        "Current round is being raised on a SAFE with an expected lead investor.",
        "Go-to-market combines founder-led sales, channel partners, and inbound content.",
        "Platform includes SOC 2 controls and audit-ready reporting.",
      ].join(" "),
    },
    scraping: {
      websiteUrl: "https://clipaf.com",
      websiteSummary:
        "Clipaf automates industrial compliance and quality operations with AI copilots.",
      website: {
        url: "https://clipaf.com",
        title: "Clipaf",
        description: "Industrial workflow copilots",
        fullText:
          "Clipaf helps teams automate quality checks, compliance evidence, and field reporting.",
        headings: [
          "Product",
          "Features",
          "Pricing",
          "Security",
          "Case Studies",
          "Book a Demo",
        ],
        subpages: [
          {
            url: "https://clipaf.com/product",
            title: "Product",
            content: "Product overview and architecture.",
          },
          {
            url: "https://clipaf.com/features",
            title: "Features",
            content: "Workflow AI, compliance checks, reporting.",
          },
          {
            url: "https://clipaf.com/pricing",
            title: "Pricing",
            content: "Tiered plans for SMB and enterprise.",
          },
          {
            url: "https://clipaf.com/solutions/manufacturing",
            title: "Solutions",
            content: "Manufacturing quality assurance workflows.",
          },
          {
            url: "https://clipaf.com/customers",
            title: "Customers",
            content: "Case studies and customer results.",
          },
          {
            url: "https://clipaf.com/security",
            title: "Security",
            content: "SOC 2 and data governance posture.",
          },
        ],
        links: [
          { url: "https://clipaf.com/demo", text: "Book a demo" },
          { url: "https://clipaf.com/blog", text: "Blog" },
        ],
        teamBios: [
          {
            name: "Amina Rao",
            role: "CEO",
            bio: "Former industrial software operator.",
          },
        ],
        pricing: {
          plans: [
            {
              name: "Growth",
              price: "$399",
              features: ["Workflow automation", "Audit reports"],
            },
            {
              name: "Scale",
              price: "Custom",
              features: ["SSO", "Enterprise controls"],
            },
          ],
          currency: "USD",
        },
        customerLogos: ["Acme Manufacturing", "Northline Components"],
        testimonials: [
          {
            quote: "Reduced audit prep by 60%.",
            author: "Jordan Lee",
            role: "VP Quality",
          },
        ],
        metadata: {
          scrapedAt: "2026-02-08T12:00:00.000Z",
          pageCount: 8,
          hasAboutPage: true,
          hasTeamPage: true,
          hasPricingPage: true,
        },
      },
      teamMembers: [
        {
          name: "Amina Rao",
          role: "CEO",
          linkedinUrl: "https://linkedin.com/in/amina-rao",
          linkedinProfile: {
            headline: "CEO at Clipaf",
            summary: "Built industrial SaaS products.",
            experience: [
              {
                title: "VP Product",
                company: "PlantOps",
                duration: "4 years",
              },
            ],
            education: [
              {
                school: "MIT",
                degree: "MS",
                field: "Operations",
              },
            ],
          },
          enrichmentStatus: "success",
          enrichedAt: "2026-02-08T12:00:00.000Z",
        },
        {
          name: "Luca Hale",
          role: "CTO",
          linkedinUrl: "https://linkedin.com/in/luca-hale",
          enrichmentStatus: "not_found",
        },
      ],
      notableClaims: [
        "SOC 2 ready platform",
        "Founder-led GTM with channel partners",
        "Seeking lead investor for current SAFE round",
      ],
      scrapeErrors: [],
    },
    research: {
      team: {
        linkedinProfiles: [
          {
            name: "Amina Rao",
            title: "CEO",
            company: "Clipaf",
            experience: ["PlantOps", "FactoryFlow"],
            url: "https://linkedin.com/in/amina-rao",
            patents: [],
            previousExits: [],
            notableAchievements: [],
            educationHighlights: [],
            sources: [],
          },
        ],
        previousCompanies: ["PlantOps", "FactoryFlow"],
        education: ["MIT"],
        achievements: [
          "Filed workflow orchestration patent family",
          "Scaled industrial operations platform to enterprise customers",
        ],
        onlinePresence: {
          github: "https://github.com/clipaf",
          personalSites: ["https://clipaf.com/team"],
        },
        sources: ["https://linkedin.com/in/amina-rao"],
      },
      market: {
        marketReports: ["Industrial automation market outlook 2026"],
        competitors: [
          {
            name: "FactoryCloud",
            description: "Industrial analytics and compliance workflows",
            fundingRaised: 45_000_000,
            url: "https://factorycloud.example.com",
          },
          {
            name: "OpsPilot",
            description: "Workflow orchestration for operations teams",
            fundingRaised: 28_000_000,
            url: "https://opspilot.example.com",
          },
        ],
        indirectCompetitors: ["Internal ERP custom workflows", "Manual spreadsheet operations"],
        indirectCompetitorsDetailed: [
          {
            name: "Internal ERP custom workflows",
            description: "Enterprises extending ERP modules instead of adopting dedicated tools",
            whyIndirect: "Competes for same workflow automation budget",
            threatLevel: "medium",
          },
          {
            name: "Manual spreadsheet operations",
            description: "Ops teams relying on spreadsheet-based compliance tracking",
            whyIndirect: "Low-cost substitute with poor scalability",
            threatLevel: "low",
          },
        ],
        marketTrends: [
          "Regulatory pressure increasing for digital compliance evidence",
          "M&A activity accelerating in industrial workflow software",
        ],
        marketSize: {
          tam: 8_500_000_000,
          sam: 2_200_000_000,
          som: 180_000_000,
        },
        marketDrivers: [],
        marketChallenges: [],
        sources: ["https://market.example.com/report"],
      },
      product: {
        productPages: [
          "https://clipaf.com/product",
          "https://clipaf.com/features",
          "https://clipaf.com/demo",
        ],
        features: [
          "Automated compliance checks",
          "Audit report generation",
          "Field operations workflow copilot",
        ],
        techStack: ["TypeScript", "PostgreSQL", "Redis"],
        integrations: ["SAP", "Salesforce"],
        customerReviews: {
          summary: "Customers highlight implementation speed and reporting quality.",
          sentiment: "positive",
        },
        reviews: [],
        strengths: [],
        weaknesses: [],
        sources: ["https://product.example.com/review"],
      },
      news: {
        articles: [
          {
            title: "Clipaf expands into enterprise manufacturing",
            source: "Tech Daily",
            date: "2026-01-12",
            summary:
              "Expansion includes new channel partnerships and security certifications.",
            url: "https://news.example.com/clipaf-enterprise",
          },
          {
            title: "Industrial software consolidator acquires QOps",
            source: "Market Wire",
            date: "2025-11-03",
            summary:
              "Acquisition underscores active M&A demand in workflow and compliance tooling.",
            url: "https://news.example.com/qops-acquisition",
          },
        ],
        pressReleases: ["Clipaf announces partner ecosystem launch"],
        sentiment: "positive",
        recentEvents: ["Partner program launch", "New enterprise logos"],
        sources: ["https://news.example.com/clipaf-enterprise"],
      },
      competitor: {
        competitors: [
          {
            name: "FactoryCloud",
            description: "Industrial analytics and compliance workflows",
            website: "https://factorycloud.example.com",
            fundingRaised: 45_000_000,
            fundingStage: "Series B",
            employeeCount: 200,
            productOverview: "Cloud-based industrial analytics platform with compliance reporting modules",
            keyFeatures: ["Analytics dashboard", "Compliance reporting", "IoT integration"],
            pricing: "Enterprise annual contracts starting at $50K/yr",
            targetMarket: "Enterprise manufacturing and industrial operations",
            differentiators: ["Larger integration ecosystem", "More mature analytics"],
            weaknesses: ["Generic platform, not AI-native", "Complex implementation"],
            threatLevel: "high",
            productFeatures: [],
            recentNews: [],
          },
          {
            name: "OpsPilot",
            description: "Workflow orchestration for operations teams",
            website: "https://opspilot.example.com",
            fundingRaised: 28_000_000,
            fundingStage: "Series A",
            productOverview: "Workflow orchestration tool focused on operations team productivity",
            keyFeatures: ["Drag-and-drop workflows", "Team collaboration"],
            targetMarket: "Mid-market operations teams",
            differentiators: ["Simpler UX", "Faster deployment"],
            weaknesses: ["No compliance focus", "Limited to workflow orchestration"],
            threatLevel: "medium",
            productFeatures: [],
            recentNews: [],
          },
        ],
        indirectCompetitors: [
          {
            name: "Internal ERP custom workflows",
            description: "Enterprises extending ERP modules instead of adopting dedicated tools",
            whyIndirect: "Competes for same workflow automation budget",
            threatLevel: "medium",
          },
        ],
        marketPositioning: "Positioned as AI-native vertical specialist for industrial compliance",
        competitiveLandscapeSummary: "Fragmented market with horizontal players and limited vertical AI-native competition",
        sources: ["https://crunchbase.example.com/factorycloud"],
      },
      sources: [
        {
          name: "Clipaf Website",
          url: "https://clipaf.com",
          type: "website",
          agent: "product",
          timestamp: "2026-02-08T12:00:00.000Z",
        },
      ],
      errors: [],
    },
  };
}
