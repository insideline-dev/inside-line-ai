import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { BulkUploadStartupsDialog } from "../src/routes/_protected/admin/-components/BulkUploadStartupsDialog";
import { buildErrorCsv } from "../src/lib/admin/useCsvBulkUpload";

describe("BulkUploadStartupsDialog", () => {
  it("renders a trigger button labelled Bulk Upload", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <BulkUploadStartupsDialog />
      </QueryClientProvider>,
    );

    expect(html).toContain("Bulk Upload");
  });

  it("supports a custom trigger label", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <BulkUploadStartupsDialog triggerLabel="Import cohort" />
      </QueryClientProvider>,
    );

    expect(html).toContain("Import cohort");
  });
});

describe("buildErrorCsv", () => {
  it("only includes failed rows in the error CSV", () => {
    const csv = buildErrorCsv({
      total: 3,
      created: 1,
      duplicate_merged: 1,
      failed: 1,
      rows: [
        { rowIndex: 2, company: "Helios", status: "created", startupId: "id-1" },
        {
          rowIndex: 3,
          company: "Path",
          status: "duplicate_merged",
          startupId: "id-2",
        },
        {
          rowIndex: 4,
          company: "Maple",
          status: "failed",
          reason: "founder_email is required",
        },
      ],
    });

    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("rowIndex,company,reason");
    expect(csv).toContain("4,Maple,founder_email is required");
    expect(csv).not.toContain("Helios");
    expect(csv).not.toContain("Path");
  });

  it("quotes fields that contain commas", () => {
    const csv = buildErrorCsv({
      total: 1,
      created: 0,
      duplicate_merged: 0,
      failed: 1,
      rows: [
        {
          rowIndex: 2,
          company: "Acme, Inc.",
          status: "failed",
          reason: "website must be valid, https-only",
        },
      ],
    });

    expect(csv).toContain('"Acme, Inc."');
    expect(csv).toContain('"website must be valid, https-only"');
  });

  it("produces only the header when there are no failed rows", () => {
    const csv = buildErrorCsv({
      total: 1,
      created: 1,
      duplicate_merged: 0,
      failed: 0,
      rows: [
        {
          rowIndex: 2,
          company: "Acme",
          status: "created",
          startupId: "id-1",
        },
      ],
    });

    expect(csv).toBe("rowIndex,company,reason");
  });
});
