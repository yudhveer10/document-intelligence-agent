import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import type { LlmProvider } from "./llm.js";
import { ExtractionService } from "./extraction.js";
import { MemoryInvoiceRepository } from "./testing/memoryRepository.js";

const valid = {
  vendorName: "Copper Finch Studio",
  invoiceNumber: "CFS-8821",
  invoiceDate: "2026-04-18",
  currency: "USD",
  lineItems: [
    {
      description: "Packaging layouts",
      quantity: "4",
      unitPrice: "85.00",
      lineTotal: "340.00",
      confidence: 0.95,
      uncertainFields: [],
    },
  ],
  grandTotal: "340.00",
  fieldConfidence: {
    vendorName: 0.98,
    invoiceNumber: 0.97,
    invoiceDate: 0.96,
    currency: 0.99,
    grandTotal: 0.98,
    lineItems: 0.95,
  },
  uncertainFields: [],
  notes: [],
};

const temporaryDirectories: string[] = [];
afterEach(async () =>
  Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  ),
);

async function setup() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-test-"));
  temporaryDirectories.push(directory);
  const fileName = crypto.randomUUID() + ".xlsx";
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Invoice", "CFS-8821"],
    ["Total", 340],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Invoice");
  XLSX.writeFile(workbook, path.join(directory, fileName));
  const repository = new MemoryInvoiceRepository();
  const record = await repository.createUpload({
    id: crypto.randomUUID(),
    originalFileName: "invoice.xlsx",
    storedFileName: fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    rawSourceReference: "/source",
  });
  return { directory, repository, record };
}

describe("ExtractionService repair flow", () => {
  it("retries once and saves a repaired result", async () => {
    const { directory, repository, record } = await setup();
    let calls = 0;
    const provider: LlmProvider = {
      extract: async (request) => {
        calls += 1;
        if (calls === 1) return "not-json";
        expect(request.validationErrors?.[0]).toContain("Malformed JSON");
        return JSON.stringify(valid);
      },
    };
    const saved = await new ExtractionService(repository, provider, directory).extract(record.id);
    expect(calls).toBe(2);
    expect(saved.status).toBe("extracted");
    expect(saved.vendorName).toBe("Copper Finch Studio");
  });

  it("saves needs_review after the repair also fails", async () => {
    const { directory, repository, record } = await setup();
    const provider: LlmProvider = { extract: async () => "still not json" };
    const saved = await new ExtractionService(repository, provider, directory).extract(record.id);
    expect(saved.status).toBe("needs_review");
    expect(saved.validationIssues[0]?.code).toBe("extraction_failed");
  });
});
