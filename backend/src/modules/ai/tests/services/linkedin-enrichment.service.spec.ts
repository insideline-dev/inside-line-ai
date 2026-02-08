import { beforeEach, describe, expect, it, jest } from "bun:test";
import { UnipileService } from "../../../integrations/unipile/unipile.service";
import { LinkedinEnrichmentService } from "../../services/linkedin-enrichment.service";

describe("LinkedinEnrichmentService", () => {
  let service: LinkedinEnrichmentService;
  let unipile: jest.Mocked<UnipileService>;

  beforeEach(() => {
    unipile = {
      isConfigured: jest.fn().mockReturnValue(true),
      getProfile: jest.fn(),
      searchProfiles: jest.fn(),
    } as unknown as jest.Mocked<UnipileService>;

    service = new LinkedinEnrichmentService(unipile);
  });

  it("returns not_configured status when Unipile is disabled", async () => {
    unipile.isConfigured.mockReturnValueOnce(false);

    const result = await service.enrichTeamMembers("user-1", [
      { name: "Alex Founder", role: "CEO" },
    ]);

    expect(result[0]?.enrichmentStatus).toBe("not_configured");
    expect(unipile.getProfile).not.toHaveBeenCalled();
  });

  it("enriches members with direct linkedin URL", async () => {
    unipile.getProfile.mockResolvedValueOnce({
      id: "id-1",
      firstName: "Alex",
      lastName: "Founder",
      headline: "CEO",
      location: "SF",
      profileUrl: "https://linkedin.com/in/alex-founder",
      profileImageUrl: null,
      summary: "Operator",
      currentCompany: { name: "Inside Line", title: "CEO" },
      experience: [{ company: "X", title: "Founder", startDate: "2020", endDate: null, current: true }],
      education: [{ school: "Stanford", degree: "BS", fieldOfStudy: "CS", startYear: 2012, endYear: 2016 }],
    });

    const result = await service.enrichTeamMembers("user-1", [
      {
        name: "Alex Founder",
        role: "CEO",
        linkedinUrl: "https://linkedin.com/in/alex-founder",
      },
    ]);

    expect(result[0]?.enrichmentStatus).toBe("success");
    expect(result[0]?.linkedinProfile?.headline).toBe("CEO");
  });

  it("searches by name when linkedin URL is missing", async () => {
    unipile.searchProfiles.mockResolvedValueOnce([
      {
        id: "search-1",
        firstName: "Sam",
        lastName: "Builder",
        headline: "CTO",
        location: "SF",
        profileUrl: "https://linkedin.com/in/sam-builder",
        profileImageUrl: null,
        summary: null,
        currentCompany: null,
        experience: [],
        education: [],
      },
    ]);
    unipile.getProfile.mockResolvedValueOnce({
      id: "search-1",
      firstName: "Sam",
      lastName: "Builder",
      headline: "CTO",
      location: "SF",
      profileUrl: "https://linkedin.com/in/sam-builder",
      profileImageUrl: null,
      summary: null,
      currentCompany: null,
      experience: [],
      education: [],
    });

    const result = await service.enrichTeamMembers("user-1", [
      { name: "Sam Builder", role: "CTO" },
    ], { companyName: "Inside Line" });

    expect(unipile.searchProfiles).toHaveBeenCalledWith("Sam Builder", "Inside Line");
    expect(result[0]?.enrichmentStatus).toBe("success");
    expect(result[0]?.linkedinUrl).toBe("https://linkedin.com/in/sam-builder");
  });

  it("continues when one member enrichment fails", async () => {
    unipile.getProfile.mockRejectedValueOnce(new Error("upstream error"));

    const result = await service.enrichTeamMembers("user-1", [
      {
        name: "Alex Founder",
        role: "CEO",
        linkedinUrl: "https://linkedin.com/in/alex-founder",
      },
    ]);

    expect(result[0]?.enrichmentStatus).toBe("error");
  });
});
