/**
 * Mirrors `backend/src/modules/ai/schemas/thesis-fit.schema.ts`.
 * Kept hand-typed (not Orval-generated) until the backend exposes
 * this shape through an endpoint the frontend consumes.
 */

export type FitStatus = "match" | "borderline" | "mismatch";

export interface FitAxis {
  status: FitStatus;
  note: string;
}

export interface ThesisFitOutput {
  geography: FitAxis;
  stage: FitAxis;
  sector: FitAxis;
  checkSize: FitAxis;
  overall: number;
  rationale: string;
}
