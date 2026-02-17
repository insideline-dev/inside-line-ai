import { describe, expect, it } from "bun:test";
import { TeamResearchSchema } from "./team-research.schema";

describe("TeamResearchSchema", () => {
  it("parses valid research data", () => {
    const parsed = TeamResearchSchema.parse({
      linkedinProfiles: [
        {
          name: "Jane Doe",
          title: "CEO",
          company: "Acme",
          experience: ["Ex-Stripe"],
          url: "https://linkedin.com/in/jane",
        },
      ],
      previousCompanies: ["Stripe"],
      education: ["MIT"],
      achievements: ["Built product team"],
      onlinePresence: {
        github: "https://github.com/jane",
        personalSites: ["https://jane.dev"],
      },
      sources: ["https://linkedin.com/in/jane"],
    });

    expect(parsed.linkedinProfiles).toHaveLength(1);
  });

  it("rejects invalid profile structure", () => {
    expect(() =>
      TeamResearchSchema.parse({
        linkedinProfiles: [{ name: "Jane" }],
      }),
    ).toThrow();
  });

  it("accepts null optional online presence fields", () => {
    const parsed = TeamResearchSchema.parse({
      linkedinProfiles: [],
      previousCompanies: [],
      education: [],
      achievements: [],
      onlinePresence: {
        github: null,
        twitter: null,
        personalSites: [],
      },
      sources: [],
    });

    expect(parsed.onlinePresence.github).toBeUndefined();
    expect(parsed.onlinePresence.twitter).toBeUndefined();
  });
});
