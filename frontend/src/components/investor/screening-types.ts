import type { ThesisFitOutput } from "@/types/thesis-fit";

export type ScreeningVerdict = "review" | "advance" | "reject";

export interface LensScore {
  key: "market" | "team" | "traction";
  label: string;
  score: number;
  signal?: string;
  note?: string;
  rationale?: string;
}

export interface ScreeningRow {
  id: string;
  companyName: string;
  industry: string | null;
  stage: string | null;
  website: string | null;
  pitchDeckUrl: string | null;
  pitchDeckPath: string | null;
  description: string | null;
  fundingTarget: number | null;
  location: string | null;
  verdict: ScreeningVerdict;
  overallScore: number;
  fit: ThesisFitOutput | null;
  lensScores: LensScore[];
  triageRationale: string;
  reasonCodes: string[];
  submittedAt: string;
  dealbreakerNote: string | null;
}
