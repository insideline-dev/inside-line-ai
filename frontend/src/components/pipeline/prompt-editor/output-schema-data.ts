export interface SchemaField {
  type: "string" | "number" | "boolean" | "object" | "array" | "enum";
  description?: string;
  enumValues?: string[];
  nullable?: boolean;
  fields?: Record<string, SchemaField>;
  items?: SchemaField;
}

export interface SchemaNode {
  fields: Record<string, SchemaField>;
}

const dataGapItem: SchemaField = {
  type: "object",
  fields: {
    gap: { type: "string" },
    impact: { type: "enum", enumValues: ["critical", "important", "minor"] },
    suggestedAction: { type: "string" },
  },
};

const scoringField: SchemaField = {
  type: "object",
  fields: {
    overallScore: { type: "number" },
    confidence: { type: "string" },
    scoringBasis: { type: "string" },
    subScores: {
      type: "array",
      items: {
        type: "object",
        fields: {
          dimension: { type: "string" },
          weight: { type: "number" },
          score: { type: "number" },
        },
      },
    },
  },
};

const founderPitchRecommendationItem: SchemaField = {
  type: "object",
  fields: {
    deckMissingElement: { type: "string" },
    whyItMatters: { type: "string" },
    recommendation: { type: "string" },
  },
};

const founderPitchRecommendations: SchemaField = {
  type: "array",
  items: founderPitchRecommendationItem,
};

const baseFields: Record<string, SchemaField> = {
  score: { type: "number", description: "0-100" },
  confidence: { type: "enum", enumValues: ["high", "mid", "low"] },
  scoring: scoringField,
  narrativeSummary: { type: "string" },
  keyFindings: { type: "array", items: { type: "string" } },
  strengths: { type: "array", items: { type: "string" } },
  risks: { type: "array", items: { type: "string" } },
  dataGaps: { type: "array", items: dataGapItem },
  sources: { type: "array", items: { type: "string" } },
};

const exitScenarioItem: SchemaField = {
  type: "object",
  fields: {
    scenario: { type: "enum", enumValues: ["conservative", "moderate", "optimistic"] },
    exitType: { type: "enum", enumValues: ["IPO", "M&A", "IPO or M&A"] },
    exitValuation: { type: "string" },
    timeline: { type: "string" },
    moic: { type: "number" },
    irr: { type: "number" },
    researchBasis: { type: "string" },
  },
};

const marketSourceItem: SchemaField = {
  type: "object",
  fields: {
    name: { type: "string" },
    tier: { type: "string" },
    date: { type: "string" },
    geography: { type: "string" },
  },
};

const marketSizingBucket = (includesSources: boolean): SchemaField => ({
  type: "object",
  fields: {
    value: { type: "string" },
    methodology: { type: "string" },
    ...(includesSources
      ? { sources: { type: "array", items: marketSourceItem }, confidence: { type: "string" } }
      : { confidence: { type: "string" } }),
  },
});

export const outputSchemaMap: Record<string, SchemaNode> = {
  evaluation_team: {
    fields: {
      ...baseFields,
      founderMarketFit: {
        type: "object",
        fields: {
          score: { type: "number", description: "0-100" },
          why: { type: "string" },
        },
      },
      teamComposition: {
        type: "object",
        fields: {
          businessLeadership: { type: "boolean" },
          technicalCapability: { type: "boolean" },
          domainExpertise: { type: "boolean" },
          gtmCapability: { type: "boolean" },
          sentence: { type: "string" },
          reason: { type: "string" },
        },
      },
      teamMembers: {
        type: "array",
        items: {
          type: "object",
          fields: {
            name: { type: "string" },
            role: { type: "string" },
            relevance: { type: "string" },
            strengths: { type: "array", items: { type: "string" } },
            risks: { type: "array", items: { type: "string" } },
          },
        },
      },
      founderRecommendations: {
        type: "array",
        items: {
          type: "object",
          fields: {
            action: { type: "string" },
            recommendation: { type: "string" },
          },
        },
      },
      founderPitchRecommendations,
    },
  },

  evaluation_market: {
    fields: {
      ...baseFields,
      marketSizing: {
        type: "object",
        fields: {
          tam: marketSizingBucket(true),
          sam: marketSizingBucket(true),
          som: {
            type: "object",
            fields: {
              value: { type: "string" },
              methodology: { type: "string" },
              confidence: { type: "string" },
            },
          },
          bottomUpSanityCheck: {
            type: "object",
            fields: {
              calculation: { type: "string" },
              plausible: { type: "string" },
              notes: { type: "string" },
            },
          },
          deckVsResearch: {
            type: "object",
            fields: {
              tamClaimed: { type: "string" },
              tamResearched: { type: "string" },
              discrepancyFlag: { type: "string" },
              notes: { type: "string" },
            },
          },
        },
      },
      marketGrowthAndTiming: {
        type: "object",
        fields: {
          growthRate: {
            type: "object",
            fields: {
              cagr: { type: "string" },
              period: { type: "string" },
              source: { type: "string" },
              deckClaimed: { type: "string" },
              discrepancyFlag: { type: "string" },
              trajectory: { type: "enum", enumValues: ["accelerating", "stable", "decelerating"] },
            },
          },
          whyNow: {
            type: "object",
            fields: {
              thesis: { type: "string" },
              supportedByResearch: { type: "boolean" },
              evidence: { type: "string" },
            },
          },
          timingAssessment: {
            type: "enum",
            enumValues: ["too_early", "slightly_early", "right_time", "slightly_late", "too_late"],
          },
          marketLifecycle: {
            type: "object",
            fields: {
              position: { type: "string" },
              evidence: { type: "string" },
            },
          },
        },
      },
      marketStructure: {
        type: "object",
        fields: {
          structureType: { type: "enum", enumValues: ["fragmented", "consolidating", "emerging", "concentrated"] },
          concentrationTrend: {
            type: "object",
            fields: {
              direction: { type: "string" },
              evidence: { type: "string" },
            },
          },
          entryConditions: {
            type: "array",
            items: {
              type: "object",
              fields: {
                factor: { type: "string" },
                severity: { type: "enum", enumValues: ["low", "moderate", "high"] },
                note: { type: "string" },
              },
            },
          },
          tailwinds: {
            type: "array",
            items: {
              type: "object",
              fields: {
                factor: { type: "string" },
                source: { type: "string" },
                impact: { type: "string" },
              },
            },
          },
          headwinds: {
            type: "array",
            items: {
              type: "object",
              fields: {
                factor: { type: "string" },
                source: { type: "string" },
                impact: { type: "string" },
              },
            },
          },
        },
      },
      diligenceItems: { type: "array", items: { type: "string" } },
      founderPitchRecommendations,
    },
  },

  evaluation_product: {
    fields: {
      ...baseFields,
      productOverview: {
        type: "object",
        fields: {
          whatItDoes: { type: "string" },
          targetUser: { type: "string" },
          productCategory: { type: "string" },
          coreValueProp: { type: "string" },
          description: { type: "string" },
          techStage: { type: "enum", enumValues: ["concept", "prototype", "mvp", "beta", "production", "scaling"] },
        },
      },
      stageFitAssessment: { type: "enum", enumValues: ["ahead", "on_track", "behind"] },
      claimsAssessment: {
        type: "array",
        items: {
          type: "object",
          fields: {
            claim: { type: "string" },
            deckSays: { type: "string" },
            evidence: { type: "string" },
            verdict: { type: "enum", enumValues: ["verified", "partially_verified", "unverified", "contradicted"] },
          },
        },
      },
      keyFeatures: {
        type: "array",
        items: {
          type: "object",
          fields: {
            feature: { type: "string" },
            verifiedBy: {
              type: "array",
              items: { type: "enum", enumValues: ["deck", "website", "research"] },
            },
          },
        },
      },
      technologyStack: {
        type: "array",
        items: {
          type: "object",
          fields: {
            technology: { type: "string" },
            source: { type: "enum", enumValues: ["deck", "website", "research"] },
          },
        },
      },
      founderPitchRecommendations,
    },
  },

  evaluation_traction: {
    fields: {
      ...baseFields,
      tractionOverview: {
        type: "object",
        fields: {
          metricsDepth: { type: "enum", enumValues: ["comprehensive", "partial", "minimal", "none"] },
          stageFit: { type: "enum", enumValues: ["strong", "adequate", "weak", "insufficient"] },
          hasRevenue: { type: "boolean" },
          hasGrowthRate: { type: "boolean" },
          hasRetention: { type: "boolean" },
          hasUnitEconomics: { type: "boolean" },
          hasCohortData: { type: "boolean" },
        },
      },
      founderPitchRecommendations,
    },
  },

  evaluation_business_model: {
    fields: {
      ...baseFields,
      modelOverview: {
        type: "object",
        fields: {
          modelType: {
            type: "enum",
            enumValues: ["SaaS", "marketplace", "transactional", "usage-based", "hybrid", "advertising", "services", "hardware"],
          },
          pricingVisible: { type: "boolean" },
          expansionMechanism: { type: "boolean" },
          scalabilityAssessment: { type: "enum", enumValues: ["strong", "moderate", "weak", "unclear"] },
          marginStructureDescribed: { type: "boolean" },
        },
      },
      founderPitchRecommendations,
    },
  },

  evaluation_gtm: {
    fields: {
      ...baseFields,
      gtmOverview: {
        type: "object",
        fields: {
          strategyType: { type: "string" },
          evidenceAlignment: { type: "enum", enumValues: ["strong", "partial", "weak", "none"] },
          channelDiversification: { type: "boolean" },
          scalabilityAssessment: { type: "enum", enumValues: ["strong", "moderate", "weak", "unclear"] },
        },
      },
      founderPitchRecommendations,
    },
  },

  evaluation_financials: {
    fields: {
      ...baseFields,
      financialModelProvided: { type: "boolean" },
      keyMetrics: {
        type: "object",
        fields: {
          raiseAmount: { type: "string", nullable: true },
          monthlyBurn: { type: "string", nullable: true },
          runway: { type: "string", nullable: true },
          runwayMonths: { type: "number", nullable: true },
        },
      },
      capitalPlan: {
        type: "object",
        fields: {
          burnPlanDescribed: { type: "boolean" },
          useOfFundsDescribed: { type: "boolean" },
          runwayEstimated: { type: "boolean" },
          raiseJustified: { type: "boolean" },
          milestoneTied: { type: "boolean" },
          capitalEfficiencyAddressed: { type: "boolean" },
          milestoneAlignment: { type: "enum", enumValues: ["strong", "partial", "weak", "none"] },
          useOfFundsBreakdown: {
            type: "array",
            items: {
              type: "object",
              fields: {
                category: { type: "string" },
                percentage: { type: "number" },
              },
            },
          },
          summary: { type: "string" },
        },
      },
      projections: {
        type: "object",
        fields: {
          provided: { type: "boolean" },
          assumptionsStated: { type: "boolean" },
          internallyConsistent: { type: "boolean" },
          credibility: { type: "enum", enumValues: ["strong", "moderate", "weak", "none"] },
          summary: { type: "string" },
          scenarioAnalysis: { type: "boolean" },
          scenarioDetail: { type: "string" },
          assumptionAssessment: { type: "string" },
          assumptions: {
            type: "array",
            items: {
              type: "object",
              fields: {
                assumption: { type: "string" },
                value: { type: "string" },
                assessment: { type: "string" },
                verdict: { type: "enum", enumValues: ["reasonable", "aggressive", "unsupported", "conservative"] },
              },
            },
          },
          profitabilityPath: {
            type: "enum",
            enumValues: ["pre-revenue", "revenue-not-profitable", "path-described", "path-clear", "profitable"],
          },
        },
      },
      charts: {
        type: "object",
        fields: {
          revenueProjection: {
            type: "array",
            items: {
              type: "object",
              fields: {
                period: { type: "string" },
                revenue: { type: "number" },
              },
            },
          },
          burnProjection: {
            type: "array",
            items: {
              type: "object",
              fields: {
                period: { type: "string" },
                burn: { type: "number" },
                cashBalance: { type: "number" },
              },
            },
          },
          scenarioComparison: {
            type: "array",
            items: {
              type: "object",
              fields: {
                period: { type: "string" },
                scenarios: { type: "object" },
              },
            },
          },
          marginProgression: {
            type: "array",
            items: {
              type: "object",
              fields: {
                period: { type: "string" },
                grossMargin: { type: "number" },
                operatingMargin: { type: "number" },
              },
            },
          },
        },
      },
      financialPlanning: {
        type: "object",
        fields: {
          sophisticationLevel: { type: "enum", enumValues: ["basic", "developing", "solid", "advanced", "ipo-grade"] },
          diligenceFlags: {
            type: "array",
            items: {
              type: "object",
              fields: {
                flag: { type: "string" },
                priority: { type: "enum", enumValues: ["critical", "important", "routine"] },
              },
            },
          },
          summary: { type: "string" },
        },
      },
      founderPitchRecommendations,
    },
  },

  evaluation_competitive_advantage: {
    fields: {
      ...baseFields,
      strategicPositioning: {
        type: "object",
        fields: {
          differentiation: { type: "string" },
          uniqueValueProposition: { type: "string" },
          differentiationType: {
            type: "enum",
            enumValues: ["technology", "network_effects", "data", "brand", "cost", "regulatory", "other"],
          },
          durability: { type: "enum", enumValues: ["strong", "moderate", "weak"] },
        },
      },
      moatAssessment: {
        type: "object",
        fields: {
          moatType: {
            type: "enum",
            enumValues: ["network_effects", "switching_costs", "proprietary_data", "technology", "brand", "regulatory", "scale", "none"],
          },
          moatStage: { type: "enum", enumValues: ["potential", "emerging", "forming", "established", "dominant"] },
          moatEvidence: { type: "array", items: { type: "string" } },
          selfReinforcing: { type: "boolean" },
          timeToReplicate: { type: "enum", enumValues: ["months", "1-2 years", "3-5 years", "5+ years"] },
        },
      },
      barriersToEntry: {
        type: "object",
        fields: {
          technical: { type: "boolean" },
          capital: { type: "boolean" },
          network: { type: "boolean" },
          regulatory: { type: "boolean" },
        },
      },
      competitivePosition: {
        type: "object",
        fields: {
          currentGap: { type: "enum", enumValues: ["leading", "competitive", "behind", "unclear"] },
          gapEvidence: { type: "string" },
          vulnerabilities: { type: "array", items: { type: "string" } },
          defensibleAgainstFunded: { type: "boolean" },
          defensibilityRationale: { type: "string" },
        },
      },
      competitors: {
        type: "object",
        fields: {
          direct: {
            type: "array",
            items: {
              type: "object",
              fields: {
                name: { type: "string" },
                description: { type: "string" },
                url: { type: "string" },
                fundingRaised: { type: "string" },
              },
            },
          },
          indirect: {
            type: "array",
            items: {
              type: "object",
              fields: {
                name: { type: "string" },
                description: { type: "string" },
                whyIndirect: { type: "string" },
                url: { type: "string" },
                threatLevel: { type: "enum", enumValues: ["high", "medium", "low"] },
              },
            },
          },
        },
      },
      founderPitchRecommendations,
    },
  },

  evaluation_legal: {
    fields: {
      ...baseFields,
      legalOverview: {
        type: "object",
        fields: {
          redFlagsFound: { type: "boolean" },
          redFlagCount: { type: "number" },
          redFlagDetails: {
            type: "array",
            items: {
              type: "object",
              fields: {
                flag: { type: "string" },
                source: { type: "string" },
                severity: { type: "enum", enumValues: ["critical", "notable", "minor"] },
              },
            },
          },
          complianceCertifications: { type: "array", items: { type: "string" } },
          regulatoryOutlook: { type: "enum", enumValues: ["favorable", "neutral", "headwinds", "blocking"] },
          ipVerified: { type: "boolean", nullable: true },
        },
      },
      founderPitchRecommendations,
    },
  },

  evaluation_deal_terms: {
    fields: {
      ...baseFields,
      dealOverview: {
        type: "object",
        fields: {
          impliedMultiple: { type: "string", nullable: true },
          comparableRange: { type: "string", nullable: true },
          premiumDiscount: {
            type: "enum",
            enumValues: [
              "significant_premium", "slight_premium", "in_line",
              "slight_discount", "significant_discount", "insufficient_data",
            ],
          },
          roundType: { type: "string" },
          raiseSizeAssessment: {
            type: "enum",
            enumValues: ["large_for_stage", "typical", "small_for_stage", "insufficient_data"],
          },
          valuationProvided: { type: "boolean" },
        },
      },
    },
  },

  evaluation_exit_potential: {
    fields: {
      ...baseFields,
      exitScenarios: { type: "array", items: exitScenarioItem },
      returnAssessment: {
        type: "object",
        fields: {
          moderateReturnsAdequate: { type: "boolean" },
          conservativeReturnsCapital: { type: "boolean" },
          impliedGrowthRealistic: { type: "boolean" },
          grossReturnsDisclaimer: { type: "string" },
        },
      },
    },
  },

  synthesis_final: {
    fields: {
      dealSnapshot: { type: "string" },
      keyStrengths: { type: "array", items: { type: "string" } },
      keyRisks: { type: "array", items: { type: "string" } },
      investorMemo: {
        type: "object",
        fields: {
          executiveSummary: { type: "string" },
          sections: {
            type: "array",
            items: {
              type: "object",
              fields: {
                title: { type: "string" },
                content: { type: "string" },
                highlights: { type: "array", items: { type: "string" } },
                concerns: { type: "array", items: { type: "string" } },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    fields: {
                      label: { type: "string" },
                      url: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          keyDueDiligenceAreas: { type: "array", items: { type: "string" } },
        },
      },
      founderReport: {
        type: "object",
        fields: {
          summary: { type: "string" },
          whatsWorking: { type: "array", items: { type: "string" } },
          pathToInevitability: { type: "array", items: { type: "string" } },
        },
      },
      dataConfidenceNotes: { type: "string" },
      exitScenarios: { type: "array", items: exitScenarioItem },
    },
  },
};
