import { Injectable } from "@nestjs/common";
import { parseDealbreakerSuggestions } from "./parse-dealbreakers.util";

@Injectable()
export class DealbreakerParseService {

  async parseNarrative(narrative: string): Promise<string[]> {
    const trimmed = narrative.trim();
    if (!trimmed) return [];

    // Keep this deterministic for now. The LLM version was over-expanding
    // short exclusion lists into adjacent concepts and synonyms.
    return parseDealbreakerSuggestions(trimmed);
  }
}
