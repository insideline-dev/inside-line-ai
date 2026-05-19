import { describe, expect, it } from "bun:test";
import {
  dealbreakerSetsEqual,
  diffDealbreakerSets,
} from "../dealbreaker-audit.util";

describe("dealbreaker-audit.util", () => {
  it("detects equal sets ignoring order and case", () => {
    expect(dealbreakerSetsEqual(["Crypto", "Gambling"], ["gambling", "crypto"])).toBe(
      true,
    );
  });

  it("diffs added and removed terms", () => {
    const { added, removed } = diffDealbreakerSets(["crypto"], ["crypto", "tobacco"]);
    expect(added).toEqual(["tobacco"]);
    expect(removed).toEqual([]);
  });
});
