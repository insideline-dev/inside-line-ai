import { describe, expect, it } from "bun:test";
import { EVALUATION_SCHEMAS, isZodSchema, RESEARCH_SCHEMAS } from "./index";

describe("AI schema registry", () => {
  it("contains expected schema counts", () => {
    expect(Object.keys(EVALUATION_SCHEMAS)).toHaveLength(11);
    expect(Object.keys(RESEARCH_SCHEMAS)).toHaveLength(4);
  });

  it("registers valid zod schemas", () => {
    for (const schema of Object.values(EVALUATION_SCHEMAS)) {
      expect(isZodSchema(schema)).toBe(true);
    }

    for (const schema of Object.values(RESEARCH_SCHEMAS)) {
      expect(isZodSchema(schema)).toBe(true);
    }
  });
});
