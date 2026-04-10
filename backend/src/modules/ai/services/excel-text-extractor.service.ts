import { Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";

export interface ExcelTextResult {
  text: string;
  sheetCount: number;
  sheetNames: string[];
  hasContent: boolean;
}

const MAX_SHEETS = 5;
const MAX_ROWS_PER_SHEET = 50;

@Injectable()
export class ExcelTextExtractorService {
  extractText(buffer: Buffer): ExcelTextResult {
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("Invalid Excel buffer: file is empty");
    }

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames.slice(0, MAX_SHEETS);
    const parts: string[] = [];

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });

      if (rows.length === 0) continue;

      const truncatedRows = rows.slice(0, MAX_ROWS_PER_SHEET);
      const markdown = this.rowsToMarkdownTable(truncatedRows);
      if (!markdown) continue;

      const truncationNote =
        rows.length > MAX_ROWS_PER_SHEET
          ? `\n_(${rows.length - MAX_ROWS_PER_SHEET} more rows truncated)_`
          : "";

      parts.push(`## Sheet: ${sheetName}\n\n${markdown}${truncationNote}`);
    }

    if (workbook.SheetNames.length > MAX_SHEETS) {
      parts.push(
        `\n_(${workbook.SheetNames.length - MAX_SHEETS} more sheets not shown)_`,
      );
    }

    const text = parts.join("\n\n---\n\n");

    return {
      text,
      sheetCount: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames,
      hasContent: text.length > 0,
    };
  }

  getSheetNames(buffer: Buffer): string[] {
    if (!buffer || buffer.byteLength === 0) return [];
    const workbook = XLSX.read(buffer, { type: "buffer", bookSheets: true });
    return workbook.SheetNames;
  }

  private rowsToMarkdownTable(rows: string[][]): string {
    if (rows.length === 0) return "";

    const maxCols = Math.max(...rows.map((r) => r.length));
    if (maxCols === 0) return "";

    const normalize = (row: string[]): string[] => {
      const padded = [...row];
      while (padded.length < maxCols) padded.push("");
      return padded.map((cell) => String(cell ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim());
    };

    const header = normalize(rows[0]);
    const separator = header.map(() => "---");
    const body = rows.slice(1).map(normalize);

    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${separator.join(" | ")} |`,
      ...body.map((row) => `| ${row.join(" | ")} |`),
    ];

    return lines.join("\n");
  }
}
