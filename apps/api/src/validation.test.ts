import { describe, expect, it } from "vitest";
import type { ExtractionResponse } from "@invoice/shared";
import { normalizeExtraction, scoreConfidence, validateInvoice } from "./validation.js";
import { parseModelJson } from "./extraction.js";

const extraction: ExtractionResponse = {
  vendorName: "Kestrel Industrial Works",
  invoiceNumber: "KIW-2041",
  invoiceDate: "2026-06-12",
  currency: "USD",
  lineItems: [
    {
      description: "Calibration service",
      quantity: "2",
      unitPrice: "125.00",
      lineTotal: "250.00",
      confidence: 0.95,
      uncertainFields: [],
    },
    {
      description: "Sensor cable",
      quantity: "3",
      unitPrice: "18.50",
      lineTotal: "55.50",
      confidence: 0.96,
      uncertainFields: [],
    },
  ],
  grandTotal: "305.50",
  fieldConfidence: {
    vendorName: 0.98,
    invoiceNumber: 0.98,
    invoiceDate: 0.96,
    currency: 0.99,
    grandTotal: 0.97,
    lineItems: 0.95,
  },
  uncertainFields: [],
  notes: [],
};

describe("model parsing and deterministic validation", () => {
  it("parses valid JSON and rejects malformed JSON", () => {
    expect(parseModelJson(JSON.stringify(extraction))).toEqual(extraction);
    expect(() => parseModelJson("{bad json")).toThrow(SyntaxError);
  });

  it("detects a line arithmetic mismatch", () => {
    const normalized = normalizeExtraction({
      ...extraction,
      lineItems: [{ ...extraction.lineItems[0]!, lineTotal: "240.00" }],
    }).invoice;
    expect(
      validateInvoice(normalized, "digital_pdf").some(
        (issue) => issue.code === "line_total_mismatch",
      ),
    ).toBe(true);
  });

  it("detects a grand-total mismatch and reduces confidence", () => {
    const normalized = normalizeExtraction({ ...extraction, grandTotal: "400.00" }).invoice;
    const issues = validateInvoice(normalized, "digital_pdf");
    expect(issues.some((issue) => issue.code === "grand_total_mismatch")).toBe(true);
    expect(scoreConfidence(normalized, issues, 0.97)).toBeLessThan(0.95);
  });

  it("adds source-quality review concern for a scanned document", () => {
    const normalized = normalizeExtraction(extraction).invoice;
    expect(
      validateInvoice(normalized, "scanned_pdf").some((issue) => issue.code === "scanned_source"),
    ).toBe(true);
  });

  it("reports missing required fields", () => {
    const normalized = normalizeExtraction({ ...extraction, invoiceNumber: null }).invoice;
    expect(
      validateInvoice(normalized, "digital_pdf").some((issue) => issue.field === "invoiceNumber"),
    ).toBe(true);
  });
});
