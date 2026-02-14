export type GapCategoryName =
  | "team"
  | "financials"
  | "traction"
  | "market"
  | "product"
  | "competitiveLandscape";

export interface GapCategory {
  category: GapCategoryName;
  completenessScore: number; // 0-100
  availableFields: string[];
  missingFields: string[];
  researchDirectives: string[];
  priority: "critical" | "high" | "medium" | "low";
}

export interface GapReport {
  overallCompleteness: number;
  categories: GapCategory[];
  topPriorities: string[];
}
