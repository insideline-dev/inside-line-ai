import { describe, expect, it, beforeEach } from "bun:test";
import { OpenQuestionService } from "../open-question.service";
import type { DrizzleService } from "../../../database";

describe("OpenQuestionService.seedFromHandoff", () => {
  let service: OpenQuestionService;
  let insertValues: unknown[];
  let updateSets: unknown[];
  let selectResults: unknown[][];

  beforeEach(() => {
    insertValues = [];
    updateSets = [];
    selectResults = [[]];

    let selectCall = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              const row = selectResults[selectCall]?.[0];
              selectCall += 1;
              return row ? [row] : [];
            },
          }),
        }),
      }),
      insert: () => ({
        values: (row: unknown) => {
          insertValues.push(row);
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: (row: unknown) => ({
          where: async () => {
            updateSets.push(row);
            return Promise.resolve();
          },
        }),
      }),
    };

    service = new OpenQuestionService({
      db,
    } as unknown as DrizzleService);
  });

  it("inserts new issues and skips duplicates on re-screen", async () => {
    const issues = [
      {
        key: "missing:website",
        label: "Website missing",
        summary: "No website on file",
        source: "screening-output" as const,
      },
    ];

    const first = await service.seedFromHandoff("startup-1", issues);
    expect(first).toEqual({ seeded: 1, updated: 0 });
    expect(insertValues).toHaveLength(1);

    selectResults.push([
      {
        id: "q-1",
        startupId: "startup-1",
        key: "missing:website",
        status: "open",
        seedSource: "screening_seed",
      },
    ]);

    const second = await service.seedFromHandoff("startup-1", [
      { ...issues[0], summary: "Still no website" },
    ]);
    expect(second).toEqual({ seeded: 0, updated: 1 });
    expect(updateSets).toHaveLength(1);
  });

  it("does not overwrite resolved seeded rows", async () => {
    selectResults = [
      [
        {
          id: "q-2",
          startupId: "startup-1",
          key: "missing:deck",
          status: "resolved",
          seedSource: "screening_seed",
        },
      ],
    ];

    const result = await service.seedFromHandoff("startup-1", [
      {
        key: "missing:deck",
        label: "Deck",
        summary: "Updated copy",
        source: "screening-output",
      },
    ]);

    expect(result).toEqual({ seeded: 0, updated: 0 });
    expect(updateSets).toHaveLength(0);
    expect(insertValues).toHaveLength(0);
  });
});
