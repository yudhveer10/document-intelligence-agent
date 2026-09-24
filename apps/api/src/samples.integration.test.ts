import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { extractionResponseSchema } from "@invoice/shared";
import { GeminiLlmProvider } from "./llm.js";
import { parseModelJson } from "./extraction.js";
import { preprocessDocument } from "./preprocessor.js";
import { normalizeExtraction, validateInvoice } from "./validation.js";

const samples = path.resolve(process.cwd(), "../../samples");
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const sourceMime: Record<string, string> = {
  "01-clean-conventional.pdf": "application/pdf",
  "02-alternate-layout.pdf": "application/pdf",
  "03-difficult-scan.pdf": "application/pdf",
  "04-offset-invoice.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

describe.skipIf(!apiKey)("configured Gemini sample extraction", () => {
  it.each(Object.keys(sourceMime))("extracts %s with the real provider", async (file) => {
    const expected = JSON.parse(
      await fs.readFile(path.join(samples, "expected.json"), "utf8"),
    ) as Record<
      string,
      {
        vendorName: string;
        invoiceNumber: string;
        grandTotal: string;
        expectedStatus?: string;
      }
    >;
    const document = await preprocessDocument(path.join(samples, file), sourceMime[file]!);
    const provider = new GeminiLlmProvider(apiKey!, model);
    const raw = await provider.extract({ document });
    const parsed = extractionResponseSchema.parse(parseModelJson(raw));
    const { invoice, warnings } = normalizeExtraction(parsed);
    const issues = validateInvoice(invoice, document.sourceType, warnings);
    expect(invoice.vendorName?.toLowerCase()).toContain(expected[file]!.vendorName.toLowerCase());
    if (file === "03-difficult-scan.pdf") {
      if (invoice.invoiceNumber !== null)
        expect(invoice.invoiceNumber).toBe(expected[file]!.invoiceNumber);
      expect(issues.some((issue) => issue.code === "scanned_source")).toBe(true);
    } else {
      expect(invoice.invoiceNumber).toBe(expected[file]!.invoiceNumber);
      expect(new Decimal(invoice.grandTotal!).eq(expected[file]!.grandTotal)).toBe(true);
      expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    }
  });
});
