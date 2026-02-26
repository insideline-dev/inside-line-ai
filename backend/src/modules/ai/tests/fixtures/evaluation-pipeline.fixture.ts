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
      team: "Team report text: founders have industrial SaaS background and execution history.",
      market:
        "Market report text: industrial workflow software demand is increasing with compliance tailwinds.",
      product:
        "Product report text: AI copilots automate compliance workflows and reporting for operations teams.",
      news:
        "News report text: company launched partner ecosystem and received positive trade publication coverage.",
      competitor:
        "Competitor report text: fragmented market with horizontal incumbents and vertical niche challengers.",
      combinedReportText: [
        "## Team Research Report",
        "Team report text: founders have industrial SaaS background and execution history.",
        "",
        "## Market Research Report",
        "Market report text: industrial workflow software demand is increasing with compliance tailwinds.",
        "",
        "## Product Research Report",
        "Product report text: AI copilots automate compliance workflows and reporting for operations teams.",
        "",
        "## News Research Report",
        "News report text: company launched partner ecosystem and received positive trade publication coverage.",
        "",
        "## Competitor Research Report",
        "Competitor report text: fragmented market with horizontal incumbents and vertical niche challengers.",
      ].join("\n"),
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
