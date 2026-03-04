Analyze this startup and enrich its data using all available sources.

<user_provided_data>
=== CURRENT STARTUP DATA (from database) ===
Company Name: {{companyName}}
Tagline: {{tagline}}
Description: {{description}}
Industry: {{industry}}
Stage: {{stage}}
Website: {{website}}
Location: {{location}}
Founding Date: {{foundingDate}}
Team Size: {{teamSize}}
Funding Target: {{fundingTarget}}
Sector: {{sectorIndustry}}
Product Description: {{productDescription}}
Contact: {{contactName}} ({{contactEmail}})

=== KNOWN TEAM MEMBERS ===
{{teamMembers}}

=== EXTRACTED FROM PITCH DECK ===
{{extractionData}}

=== SUBMISSION FORM DATA ===
{{formContext}}

=== EMAIL CONVERSATION CONTEXT ===
{{emailContext}}
</user_provided_data>

=== FIELDS ALREADY RESOLVED FROM INTERNAL SOURCES (verify, don't re-research) ===
{{resolvedFromInternal}}

=== REMAINING GAPS TO FILL (focus your search here) ===
{{remainingGaps}}

=== FIELDS WITH SUSPICIOUS DATA ===
{{suspiciousFields}}

=== WEB SEARCH RESULTS ===
{{searchResults}}

Based on all the above, produce a JSON object matching the EnrichmentResult schema. For each field:
- Only include it if you found relevant data
- Include confidence score and source
- Flag corrections with detailed reasons
- List all discovered URLs and social profiles
- Track which fields you enriched, which are still missing, and which you corrected
- For fields already resolved from internal sources, only include them if you can verify or correct them
