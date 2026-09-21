import path from "node:path";
import { describe, expect, it } from "vitest";
import { preprocessDocument } from "./preprocessor.js";

const samples = path.resolve(process.cwd(), "../../samples");

describe("real generated sample preprocessing", () => {
  it("extracts embedded text from both digital PDFs", async () => {
    for (const file of ["01-clean-conventional.pdf", "02-alternate-layout.pdf"]) {
      const document = await preprocessDocument(path.join(samples, file), "application/pdf");
      expect(document.sourceType).toBe("digital_pdf");
      expect(document.extractedCharacterCount).toBeGreaterThan(80);
      expect(document.pageCount).toBe(1);
    }
  });

  it("detects the image-only scan from content, not its filename", async () => {
    const document = await preprocessDocument(
      path.join(samples, "03-difficult-scan.pdf"),
      "application/pdf",
    );
    expect(document.sourceType).toBe("scanned_pdf");
    expect(document.extractedCharacterCount).toBeLessThan(80);
    expect(document.fileBuffer?.length).toBeGreaterThan(1000);
  });

  it("preserves Excel sheet, row, and cell positions", async () => {
    const document = await preprocessDocument(
      path.join(samples, "04-offset-invoice.xlsx"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(document.sourceType).toBe("excel");
    expect(document.textRepresentation).toContain("SHEET: Lab Invoice");
    expect(document.textRepresentation).toContain("ROW 10:");
    expect(document.textRepresentation).toContain("B11=Optical calibration panel");
    expect(document.textRepresentation).toContain("MERGED RANGES:");
  });
});
