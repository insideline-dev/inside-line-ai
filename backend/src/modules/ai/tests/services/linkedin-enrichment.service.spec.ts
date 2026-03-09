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
      searchProfilesInCompany: jest.fn(),
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
        currentCompany: { name: "Inside Line", title: "CTO" },
        experience: [
          {
            company: "Inside Line",
            title: "CTO",
            startDate: "2023",
            endDate: null,
            current: true,
          },
        ],
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
      currentCompany: { name: "Inside Line", title: "CTO" },
      experience: [
        {
          company: "Inside Line",
          title: "CTO",
          startDate: "2023",
          endDate: null,
          current: true,
        },
      ],
      education: [],
    });

    const result = await service.enrichTeamMembers("user-1", [
      { name: "Sam Builder", role: "CTO" },
    ], { companyName: "Inside Line" });

    expect(unipile.searchProfiles).toHaveBeenCalledWith("Sam Builder", "Inside Line");
    expect(result[0]?.enrichmentStatus).toBe("success");
    expect(result[0]?.linkedinUrl).toBe("https://linkedin.com/in/sam-builder");
    expect(result[0]?.matchConfidence).toBeGreaterThanOrEqual(80);
    expect(result[0]?.confidenceReason).toContain("currently employed");
  });

  it("accepts abbreviated last-name search hits when company association is strong", async () => {
    unipile.searchProfiles.mockResolvedValueOnce([
      {
        id: "joe-g-1",
        firstName: "Joe",
        lastName: "G",
        headline: "Co-founder at Airbnb",
        location: "San Francisco",
        profileUrl: "https://linkedin.com/in/joe-g",
        profileImageUrl: null,
        summary: null,
        currentCompany: null,
        experience: [],
        education: [],
      },
    ]);
    unipile.getProfile.mockResolvedValueOnce({
      id: "joe-g-1",
      firstName: "Joe",
      lastName: "G",
      headline: "Co-founder at Airbnb",
      location: "San Francisco",
      profileUrl: "https://linkedin.com/in/joe-g",
      profileImageUrl: null,
      summary: null,
      currentCompany: { name: "Airbnb", title: "Co-founder" },
      experience: [],
      education: [],
    });

    const result = await service.enrichTeamMembers(
      "user-1",
      [{ name: "Joe Gebbia", role: "Founder" }],
      { companyName: "Airbnb" },
    );

    expect(unipile.searchProfiles).toHaveBeenCalledWith("Joe Gebbia", "Airbnb");
    expect(result[0]?.enrichmentStatus).toBe("success");
    expect(result[0]?.linkedinUrl).toBe("https://linkedin.com/in/joe-g");
  });

  it("falls back to global profile search when company-scoped search has no hits", async () => {
    unipile.searchProfiles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "travis-fallback",
          firstName: "Travis",
          lastName: "Kalanick",
          headline: "Founder at CloudKitchens",
          location: "Los Angeles",
          profileUrl: "https://linkedin.com/in/traviskalanick",
          profileImageUrl: null,
          summary: null,
          currentCompany: { name: "CloudKitchens", title: "Founder" },
          experience: [],
          education: [],
        },
      ]);
    unipile.getProfile.mockResolvedValueOnce({
      id: "travis-fallback",
      firstName: "Travis",
      lastName: "Kalanick",
      headline: "Founder at CloudKitchens",
      location: "Los Angeles",
      profileUrl: "https://linkedin.com/in/traviskalanick",
      profileImageUrl: null,
      summary: "Founded Uber and led it through global expansion.",
      currentCompany: { name: "CloudKitchens", title: "Founder" },
      experience: [
        {
          company: "CloudKitchens",
          title: "Founder",
          startDate: "2018",
          endDate: null,
          current: true,
        },
        {
          company: "Uber",
          title: "Founder & CEO",
          startDate: "2009",
          endDate: "2017",
          current: false,
        },
      ],
      education: [],
    });

    const result = await service.enrichTeamMembers(
      "user-1",
      [{ name: "Travis Kalanick", role: "Founder" }],
      { companyName: "Uber" },
    );

    expect(unipile.searchProfiles).toHaveBeenNthCalledWith(1, "Travis Kalanick", "Uber");
    expect(unipile.searchProfiles).toHaveBeenNthCalledWith(2, "Travis", "Uber");
    expect(unipile.searchProfiles).toHaveBeenNthCalledWith(3, "Travis Kalanick");
    expect(result[0]?.enrichmentStatus).toBe("success");
    expect(result[0]?.confidenceReason).toContain(
      "historical founder/executive association",
    );
  });

  it("rejects profiles without a current target-company signal", async () => {
    unipile.searchProfiles.mockResolvedValueOnce([
      {
        id: "search-2",
        firstName: "Sam",
        lastName: "Builder",
        headline: "CTO",
        location: "SF",
        profileUrl: "https://linkedin.com/in/sam-builder-2",
        profileImageUrl: null,
        summary: null,
        currentCompany: null,
        experience: [],
        education: [],
      },
    ]);
    unipile.getProfile.mockResolvedValueOnce({
      id: "search-2",
      firstName: "Sam",
      lastName: "Builder",
      headline: "CTO",
      location: "SF",
      profileUrl: "https://linkedin.com/in/sam-builder-2",
      profileImageUrl: null,
      summary: null,
      currentCompany: null,
      experience: [],
      education: [],
    });

    const result = await service.enrichTeamMembers(
      "user-1",
      [{ name: "Sam Builder", role: "CTO" }],
      { companyName: "Inside Line" },
    );

    expect(result[0]?.enrichmentStatus).toBe("not_found");
    expect(result[0]?.confidenceReason).toContain("Current company does not match target company");
  });

  it("accepts historical founder/executive profiles when name match is strong", async () => {
    unipile.getProfile.mockResolvedValueOnce({
      id: "travis-1",
      firstName: "Travis",
      lastName: "Kalanick",
      headline: "Founder at CloudKitchens",
      location: "Los Angeles",
      profileUrl: "https://linkedin.com/in/traviskalanick",
      profileImageUrl: null,
      summary: "Founded Uber and led it through global expansion.",
      currentCompany: { name: "CloudKitchens", title: "Founder" },
      experience: [
        {
          company: "CloudKitchens",
          title: "Founder",
          startDate: "2018",
          endDate: null,
          current: true,
        },
        {
          company: "Uber",
          title: "Founder & CEO",
          startDate: "2009",
          endDate: "2017",
          current: false,
        },
      ],
      education: [],
    });

    const result = await service.enrichTeamMembers(
      "user-1",
      [
        {
          name: "Travis Kalanick",
          role: "CEO",
          linkedinUrl: "https://linkedin.com/in/traviskalanick",
        },
      ],
      { companyName: "Uber" },
    );

    expect(result[0]?.enrichmentStatus).toBe("success");
    expect(result[0]?.matchConfidence).toBeGreaterThanOrEqual(70);
    expect(result[0]?.confidenceReason).toContain(
      "historical founder/executive association",
    );
  });

  it("rejects operational profiles for leadership requests at target company", async () => {
    unipile.searchProfiles.mockResolvedValueOnce([
      {
        id: "uber-driver-1",
        firstName: "John",
        lastName: "Smith",
        headline: "Uber Driver",
        location: "San Francisco",
        profileUrl: "https://linkedin.com/in/john-smith-uber-driver",
        profileImageUrl: null,
        summary: null,
        currentCompany: { name: "Uber", title: "Driver Partner" },
        experience: [
          {
            company: "Uber",
            title: "Driver Partner",
            startDate: "2024",
            endDate: null,
            current: true,
          },
        ],
        education: [],
      },
    ]);
    unipile.getProfile.mockResolvedValueOnce({
      id: "uber-driver-1",
      firstName: "John",
      lastName: "Smith",
      headline: "Uber Driver",
      location: "San Francisco",
      profileUrl: "https://linkedin.com/in/john-smith-uber-driver",
      profileImageUrl: null,
      summary: null,
      currentCompany: { name: "Uber", title: "Driver Partner" },
      experience: [
        {
          company: "Uber",
          title: "Driver Partner",
          startDate: "2024",
          endDate: null,
          current: true,
        },
      ],
      education: [],
    });

    const result = await service.enrichTeamMembers(
      "user-1",
      [{ name: "John Smith", role: "Founder" }],
      { companyName: "Uber" },
    );

    expect(result[0]?.enrichmentStatus).toBe("not_found");
    expect(result[0]?.confidenceReason).toContain(
      "operational/non-executive",
    );
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
    expect(unipile.searchProfiles).not.toHaveBeenCalled();
  });

  it("short-circuits remaining member requests after a rate-limit error", async () => {
    unipile.getProfile.mockRejectedValueOnce(
      new Error(
        'Unipile API error: {"status":429,"type":"errors/too_many_requests","title":"Too many requests"}',
      ),
    );

    const result = await service.enrichTeamMembers(
      "user-1",
      [
        {
          name: "Alex Founder",
          role: "CEO",
          linkedinUrl: "https://linkedin.com/in/alex-founder",
        },
        {
          name: "Sam Builder",
          role: "CTO",
          linkedinUrl: "https://linkedin.com/in/sam-builder",
        },
      ],
      { companyName: "Inside Line" },
    );

    expect(unipile.getProfile).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0]?.enrichmentStatus).toBe("error");
    expect(result[0]?.confidenceReason).toContain("rate-limited");
    expect(result[1]?.enrichmentStatus).toBe("error");
    expect(result[1]?.confidenceReason).toContain("rate-limited");
  });

  it("retries via search when a provided linkedin URL is unreachable", async () => {
    unipile.getProfile
      .mockRejectedValueOnce(
        new Error(
          'Unipile API error: {"status":422,"type":"errors/invalid_recipient","title":"Recipient cannot be reached"}',
        ),
      )
      .mockResolvedValueOnce({
        id: "nathan-1",
        firstName: "Nathan",
        lastName: "Blecharczyk",
        headline: "CTO at Airbnb",
        location: "San Francisco",
        profileUrl: "https://www.linkedin.com/in/nathan-blecharczyk-real",
        profileImageUrl: "https://media.licdn.com/photo.jpg",
        summary: null,
        currentCompany: { name: "Airbnb", title: "CTO" },
        experience: [],
        education: [],
      });

    unipile.searchProfiles.mockResolvedValueOnce([
      {
        id: "same-url",
        firstName: "Nathan",
        lastName: "Blecharczyk",
        headline: "CTO",
        location: "San Francisco",
        profileUrl: "https://linkedin.com/in/nblecharczyk",
        profileImageUrl: null,
        summary: null,
        currentCompany: null,
        experience: [],
        education: [],
      },
      {
        id: "fallback-url",
        firstName: "Nathan",
        lastName: "Blecharczyk",
        headline: "CTO at Airbnb",
        location: "San Francisco",
        profileUrl: "https://www.linkedin.com/in/nathan-blecharczyk-real",
        profileImageUrl: null,
        summary: null,
        currentCompany: null,
        experience: [],
        education: [],
      },
    ]);

    const result = await service.enrichTeamMembers(
      "user-1",
      [
        {
          name: "Nathan Blecharczyk",
          role: "CTO",
          linkedinUrl: "https://linkedin.com/in/nblecharczyk",
        },
      ],
      { companyName: "Airbnb" },
    );

    expect(unipile.searchProfiles).toHaveBeenCalledWith("Nathan Blecharczyk", "Airbnb");
    expect(unipile.getProfile).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "https://linkedin.com/in/nblecharczyk",
    );
    expect(unipile.getProfile).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "https://www.linkedin.com/in/nathan-blecharczyk-real",
    );
    expect(result[0]?.enrichmentStatus).toBe("success");
    expect(result[0]?.linkedinUrl).toBe(
      "https://www.linkedin.com/in/nathan-blecharczyk-real",
    );
  });

  it("retries via search when provided linkedin URL returns no profile", async () => {
    unipile.getProfile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "nathan-1",
        firstName: "Nathan",
        lastName: "Blecharczyk",
        headline: "CTO at Airbnb",
        location: "San Francisco",
        profileUrl: "https://www.linkedin.com/in/nathan-blecharczyk-real",
        profileImageUrl: "https://media.licdn.com/photo.jpg",
        summary: null,
        currentCompany: { name: "Airbnb", title: "CTO" },
        experience: [],
        education: [],
      });

    unipile.searchProfiles.mockResolvedValueOnce([
      {
        id: "fallback-url",
        firstName: "Nathan",
        lastName: "Blecharczyk",
        headline: "CTO at Airbnb",
        location: "San Francisco",
        profileUrl: "https://www.linkedin.com/in/nathan-blecharczyk-real",
        profileImageUrl: null,
        summary: null,
        currentCompany: null,
        experience: [],
        education: [],
      },
    ]);

    const result = await service.enrichTeamMembers(
      "user-1",
      [
        {
          name: "Nathan Blecharczyk",
          role: "CTO",
          linkedinUrl: "https://linkedin.com/in/nblecharczyk",
        },
      ],
      { companyName: "Airbnb" },
    );

    expect(unipile.searchProfiles).toHaveBeenCalledWith(
      "Nathan Blecharczyk",
      "Airbnb",
    );
    expect(unipile.getProfile).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "https://linkedin.com/in/nblecharczyk",
    );
    expect(unipile.getProfile).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "https://www.linkedin.com/in/nathan-blecharczyk-real",
    );
    expect(result[0]?.enrichmentStatus).toBe("success");
  });

  it("broadens company-scoped search queries when OCR misspells a founder name", async () => {
    unipile.searchProfiles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "nathan-ocr-1",
          firstName: "Nathan",
          lastName: "Blecharczyk",
          headline: "CTO at Airbnb",
          location: "San Francisco",
          profileUrl: "https://linkedin.com/in/nathan-blecharczyk",
          profileImageUrl: null,
          summary: null,
          currentCompany: null,
          experience: [],
          education: [],
        },
      ]);
    unipile.getProfile.mockResolvedValueOnce({
      id: "nathan-ocr-1",
      firstName: "Nathan",
      lastName: "Blecharczyk",
      headline: "CTO at Airbnb",
      location: "San Francisco",
      profileUrl: "https://linkedin.com/in/nathan-blecharczyk",
      profileImageUrl: null,
      summary: null,
      currentCompany: { name: "Airbnb", title: "CTO" },
      experience: [],
      education: [],
    });

    const result = await service.enrichTeamMembers(
      "user-1",
      [{ name: "Nathan Blecharyk", role: "Founder" }],
      { companyName: "Airbnb" },
    );

    expect(unipile.searchProfiles).toHaveBeenNthCalledWith(
      1,
      "Nathan Blecharyk",
      "Airbnb",
    );
    expect(unipile.searchProfiles).toHaveBeenNthCalledWith(
      2,
      "Nathan",
      "Airbnb",
    );
    expect(result[0]?.enrichmentStatus).toBe("success");
    expect(result[0]?.linkedinUrl).toBe(
      "https://linkedin.com/in/nathan-blecharczyk",
    );
  });

  it("rejects mismatched profiles and falls back to a better-matching candidate", async () => {
    unipile.getProfile
      .mockResolvedValueOnce({
        id: "wrong-john",
        firstName: "John",
        lastName: "Doe",
        headline: "Talent Leader",
        location: "NC",
        profileUrl: "https://linkedin.com/in/johncollison",
        profileImageUrl: null,
        summary: null,
        currentCompany: { name: "RDU Airport", title: "Talent Lead" },
        experience: [
          {
            company: "RDU Airport",
            title: "Talent Lead",
            startDate: "2021",
            endDate: null,
            current: true,
          },
        ],
        education: [],
      })
      .mockResolvedValueOnce({
        id: "john-collison",
        firstName: "John",
        lastName: "Collison",
        headline: "President at Stripe",
        location: "San Francisco, CA",
        profileUrl: "https://linkedin.com/in/john-collison-stripe",
        profileImageUrl: null,
        summary: null,
        currentCompany: { name: "Stripe", title: "President" },
        experience: [
          {
            company: "Stripe",
            title: "President",
            startDate: "2011",
            endDate: null,
            current: true,
          },
        ],
        education: [],
      });

    unipile.searchProfiles.mockResolvedValueOnce([
      {
        id: "john-collison",
        firstName: "John",
        lastName: "Collison",
        headline: "President at Stripe",
        location: "San Francisco, CA",
        profileUrl: "https://linkedin.com/in/john-collison-stripe",
        profileImageUrl: null,
        summary: null,
        currentCompany: { name: "Stripe", title: "President" },
        experience: [],
        education: [],
      },
    ]);

    const result = await service.enrichTeamMembers(
      "user-1",
      [
        {
          name: "John Collison",
          role: "President",
          linkedinUrl: "https://linkedin.com/in/johncollison",
        },
      ],
      { companyName: "Stripe" },
    );

    expect(unipile.searchProfiles).toHaveBeenCalledWith("John Collison", "Stripe");
    expect(result[0]?.enrichmentStatus).toBe("success");
    expect(result[0]?.linkedinUrl).toBe("https://linkedin.com/in/john-collison-stripe");
    expect(result[0]?.linkedinProfile?.headline).toBe("President at Stripe");
  });

  it("filters out ex-employees and self-employed profiles in company leadership discovery", async () => {
    unipile.searchProfilesInCompany.mockResolvedValue([
      {
        id: "current-1",
        firstName: "Alice",
        lastName: "Exec",
        headline: "Chief Technology Officer",
        location: "SF",
        profileUrl: "https://linkedin.com/in/alice-exec",
        profileImageUrl: null,
        summary: null,
        currentCompany: { name: "Airbnb", title: "CTO" },
        experience: [
          {
            company: "Airbnb",
            title: "Chief Technology Officer",
            startDate: "2025",
            endDate: null,
            current: true,
          },
        ],
        education: [],
      },
      {
        id: "ex-1",
        firstName: "Bob",
        lastName: "Ex",
        headline: "Founder @ Stealth AI Startup [Ex-Airbnb]",
        location: "SF",
        profileUrl: "https://linkedin.com/in/bob-ex",
        profileImageUrl: null,
        summary: null,
        currentCompany: { name: "Stealth AI Startup", title: "Founder" },
        experience: [
          {
            company: "Airbnb",
            title: "Director",
            startDate: "2022",
            endDate: "2024",
            current: false,
          },
          {
            company: "Stealth AI Startup",
            title: "Founder",
            startDate: "2024",
            endDate: null,
            current: true,
          },
        ],
        education: [],
      },
      {
        id: "self-1",
        firstName: "Cara",
        lastName: "Consultant",
        headline: "Independent Consultant | Ex-Airbnb",
        location: "SF",
        profileUrl: "https://linkedin.com/in/cara-consultant",
        profileImageUrl: null,
        summary: null,
        currentCompany: { name: "Self-employed", title: "Consultant" },
        experience: [
          {
            company: "Self-employed",
            title: "Consultant",
            startDate: "2021",
            endDate: null,
            current: true,
          },
        ],
        education: [],
      },
    ]);

    const discovered = await service.discoverCompanyLeadershipMembers(
      "Airbnb",
      [],
      "https://airbnb.com",
    );

    expect(discovered).toEqual([
      {
        name: "Alice Exec",
        role: "Chief Technology Officer",
        linkedinUrl: "https://linkedin.com/in/alice-exec",
      },
    ]);
  });

  it("accepts C-level profiles with current target-company experience even when currentCompany is null", async () => {
    unipile.searchProfilesInCompany.mockResolvedValue([
      {
        id: "curr-exp-1",
        firstName: "Dana",
        lastName: "Lead",
        headline: "CTO",
        location: "SF",
        profileUrl: "https://linkedin.com/in/dana-lead",
        profileImageUrl: null,
        summary: null,
        currentCompany: null,
        experience: [
          {
            company: "Airbnb",
            title: "CTO",
            startDate: "2023",
            endDate: null,
            current: true,
          },
        ],
        education: [],
      },
    ]);

    const discovered = await service.discoverCompanyLeadershipMembers(
      "Airbnb",
      [],
      "https://airbnb.com",
    );

    expect(discovered).toEqual([
      {
        name: "Dana Lead",
        role: "CTO",
        linkedinUrl: "https://linkedin.com/in/dana-lead",
      },
    ]);
  });

  it("accepts company-scoped headline matches when search results omit current-company metadata", async () => {
    unipile.searchProfilesInCompany.mockResolvedValue([
      {
        id: "headline-only-1",
        firstName: "Dara",
        lastName: "Khosrowshahi",
        headline: "CEO at Uber",
        location: "San Francisco, CA",
        profileUrl: "https://linkedin.com/in/dara-khosrowshahi-70949862",
        profileImageUrl: null,
        summary: null,
        currentCompany: null,
        experience: [],
        education: [],
      },
    ]);

    const discovered = await service.discoverCompanyLeadershipMembers(
      "Uber",
      [],
      "https://uber.com",
    );

    expect(discovered).toEqual([
      {
        name: "Dara Khosrowshahi",
        role: "CEO at Uber",
        linkedinUrl: "https://linkedin.com/in/dara-khosrowshahi-70949862",
      },
    ]);
  });

  it("rejects mixed-fragment headlines where leadership signal belongs to another company", async () => {
    unipile.searchProfilesInCompany.mockResolvedValue([
      {
        id: "mixed-fragment-1",
        firstName: "Ekin",
        lastName: "Veral",
        headline: "Regional Marketing Manager at Uber | Co-founder of Kolektif8",
        location: "Dubai",
        profileUrl: "https://linkedin.com/in/ekin-veral",
        profileImageUrl: null,
        summary: null,
        currentCompany: null,
        experience: [],
        education: [],
      },
    ]);
    unipile.searchProfiles.mockResolvedValue([]);

    const discovered = await service.discoverCompanyLeadershipMembers(
      "Uber",
      [],
      "https://uber.com",
    );

    expect(discovered).toEqual([]);
    expect(unipile.searchProfiles).toHaveBeenCalled();
  });

  it("stops company leadership discovery after a rate-limit response", async () => {
    unipile.searchProfilesInCompany
      .mockRejectedValueOnce(
        new Error(
          'Unipile API error: {"status":429,"type":"errors/too_many_requests","title":"Too many requests"}',
        ),
      )
      .mockResolvedValueOnce([
        {
          id: "should-not-run",
          firstName: "Never",
          lastName: "Called",
          headline: "CEO",
          location: "SF",
          profileUrl: "https://linkedin.com/in/never-called",
          profileImageUrl: null,
          summary: null,
          currentCompany: { name: "Airbnb", title: "CEO" },
          experience: [],
          education: [],
        },
      ]);

    const discovered = await service.discoverCompanyLeadershipMembers(
      "Airbnb",
      [],
      "https://airbnb.com",
    );

    expect(discovered).toEqual([]);
    expect(unipile.searchProfilesInCompany).toHaveBeenCalledTimes(1);
  });
});
