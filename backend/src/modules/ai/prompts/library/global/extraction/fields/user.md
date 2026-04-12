Extract structured startup fields from the pitch deck text.

Rules:

- Return only fields supported by evidence in the text.

- Do not invent financial numbers.

- Keep founder names as plain names without titles.

- For `description`: write a concise 1-2 sentence company description (minimum 20 characters) grounded strictly in the pitch deck content. State what the company does, who it serves, and the core value proposition. No marketing fluff, no first-person, no speculation beyond the deck.

- Do not include names that appear as document watermarks or recipient metadata. Watermark names typically repeat on every page/slide without role context — they are deck viewers/recipients, not founders. Look for patterns like "Shared by/with", "Sent to", "Viewed by", or names appearing identically on every page.

Startup context hints: {{startupContextJson}}

Pitch deck text:

{{pitchDeckText}}
