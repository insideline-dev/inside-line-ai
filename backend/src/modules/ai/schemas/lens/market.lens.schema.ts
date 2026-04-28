import { LensOutputSchema, type LensOutput } from "./lens-output.schema";

/**
 * Market lens — for S1 we use the shared shape unmodified. When/if Karim asks
 * for market-specific evidence fields (e.g. tamRange), extend here with
 * `LensOutputSchema.extend({ ... })`.
 */
export const MarketLensOutputSchema = LensOutputSchema;
export type MarketLensOutput = LensOutput;
