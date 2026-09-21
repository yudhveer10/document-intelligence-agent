import fs from "node:fs/promises";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import * as XLSX from "xlsx";
import type { SourceType } from "@invoice/shared";
import { AppError } from "./errors.js";

export interface PreprocessedDocument {
  sourceType: SourceType;
  textRepresentation: string;
  pageCount?: number;
  sheetCount?: number;
  extractedCharacterCount: number;
  sourceQuality: number;
  fileBuffer?: Buffer;
  mimeType: string;
  warnings: string[];
}

const SCANNED_TEXT_THRESHOLD = 80;

function formatCellAddress(row: number, column: number): string {
  return XLSX.utils.encode_cell({ r: row, c: column });
}

export async function preprocessDocument(
  filePath: string,
  mimeType: string,
): Promise<PreprocessedDocument> {
  const extension = path.extname(filePath).toLowerCase();
  if (
    extension === ".xlsx" ||
    extension === ".xls" ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel")
  ) {
    const workbook = XLSX.read(await fs.readFile(filePath), {
      type: "buffer",
      cellDates: true,
      cellFormula: true,
    });
    const sheetBlocks = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return "SHEET: " + sheetName + "\n(empty)";
      const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
      const rows: string[] = ["SHEET: " + sheetName];
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        const cells: string[] = [];
        for (let column = range.s.c; column <= range.e.c; column += 1) {
          const address = formatCellAddress(row, column);
          const cell = sheet[address];
          if (cell?.v !== undefined && cell.v !== null && String(cell.v).trim() !== "") {
            const rendered = cell.w ?? String(cell.v);
            cells.push(address + "=" + rendered);
          }
        }
        if (cells.length > 0) rows.push("ROW " + (row + 1) + ": " + cells.join(" | "));
      }
      const merges = (sheet["!merges"] ?? []).map((merge) => XLSX.utils.encode_range(merge));
      if (merges.length > 0) rows.push("MERGED RANGES: " + merges.join(", "));
      return rows.join("\n");
    });
    const textRepresentation = sheetBlocks.join("\n\n");
    return {
      sourceType: "excel",
      textRepresentation,
      sheetCount: workbook.SheetNames.length,
      extractedCharacterCount: textRepresentation.length,
      sourceQuality: 0.94,
      mimeType,
      warnings: [],
    };
  }

  if (extension !== ".pdf" && mimeType !== "application/pdf") {
    throw new AppError(415, "unsupported_file", "Only PDF, XLSX, and XLS files are supported");
  }

  const buffer = await fs.readFile(filePath);
  let document: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
      .promise;
  } catch {
    throw new AppError(422, "pdf_parse_failed", "The uploaded PDF could not be read");
  }
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push("PAGE " + pageNumber + ":\n" + text);
  }
  const embeddedText = pages.join("\n\n");
  const meaningfulCharacters = embeddedText.replace(/PAGE \d+:/g, "").replace(/\s/g, "").length;
  const scanned = meaningfulCharacters < SCANNED_TEXT_THRESHOLD;
  return {
    sourceType: scanned ? "scanned_pdf" : "digital_pdf",
    textRepresentation: scanned
      ? "Embedded text is absent or insufficient. Read the attached PDF visually."
      : embeddedText,
    pageCount: document.numPages,
    extractedCharacterCount: meaningfulCharacters,
    sourceQuality: scanned ? 0.58 : 0.97,
    ...(scanned ? { fileBuffer: buffer } : {}),
    mimeType: "application/pdf",
    warnings: scanned
      ? ["PDF has insufficient embedded text and was treated as an image-only scan"]
      : [],
  };
}
