import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import Decimal from "decimal.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InvoiceRecord } from "@invoice/shared";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { LlmProvider } from "./llm.js";
import { MemoryInvoiceRepository } from "./testing/memoryRepository.js";

const samplesDirectory = path.resolve(process.cwd(), "../../samples");
const expected = JSON.parse(
  await fs.readFile(path.join(samplesDirectory, "expected.json"), "utf8"),
) as Record<
  string,
  {
    vendorName: string;
    invoiceNumber: string;
    invoiceDate: string;
    currency: string;
    grandTotal: string;
    lineItems: Array<{
      description: string;
      quantity: string;
      unitPrice: string;
      lineTotal: string;
    }>;
  }
>;
const sampleFiles = Object.keys(expected);
let uploadDirectory: string;

beforeAll(async () => {
  uploadDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-workflow-"));
});
afterAll(async () => fs.rm(uploadDirectory, { recursive: true, force: true }));

function mockProvider(): LlmProvider {
  return {
    extract: (request) => {
      const file =
        request.document.sourceType === "scanned_pdf"
          ? "03-difficult-scan.pdf"
          : sampleFiles.find((candidate) => {
              const fixture = expected[candidate];
              return (
                fixture &&
                request.document.textRepresentation
                  .toLowerCase()
                  .includes(fixture.invoiceNumber.toLowerCase())
              );
            });
      if (!file) throw new Error("Sample source was not recognized by the test provider");
      const fixture = expected[file]!;
      const scanned = request.document.sourceType === "scanned_pdf";
      return Promise.resolve(
        JSON.stringify({
          vendorName: fixture.vendorName,
          invoiceNumber: scanned ? null : fixture.invoiceNumber,
          invoiceDate: fixture.invoiceDate,
          currency: fixture.currency,
          grandTotal: fixture.grandTotal,
          lineItems: fixture.lineItems.map((line) => ({
            ...line,
            confidence: scanned ? 0.7 : 0.97,
            uncertainFields: [],
          })),
          fieldConfidence: {
            vendorName: 0.97,
            invoiceNumber: scanned ? 0.3 : 0.97,
            invoiceDate: 0.96,
            currency: 0.98,
            grandTotal: 0.97,
            lineItems: scanned ? 0.7 : 0.96,
          },
          uncertainFields: scanned ? ["invoiceNumber"] : [],
          notes: scanned ? ["Invoice reference is too faint to read reliably"] : [],
        }),
      );
    },
  };
}

describe("generated sample API workflow with a mocked provider", () => {
  it.each(sampleFiles)("uploads and extracts %s through the public routes", async (file) => {
    const repository = new MemoryInvoiceRepository();
    const app = createApp({
      config: loadConfig({ NODE_ENV: "test", UPLOAD_DIR: uploadDirectory }),
      repository,
      provider: mockProvider(),
    });
    const mime = file.endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const upload = await request(app)
      .post("/api/documents")
      .attach("document", path.join(samplesDirectory, file), { filename: file, contentType: mime })
      .expect(201);
    const id = upload.body.invoiceId as string;
    const extraction = await request(app)
      .post("/api/documents/" + id + "/extract")
      .expect(200);
    const invoice = extraction.body.invoice as InvoiceRecord;
    expect(invoice.vendorName).toBe(expected[file]!.vendorName);
    expect(new Decimal(invoice.grandTotal!).eq(expected[file]!.grandTotal)).toBe(true);
    expect(invoice.lineItems).toHaveLength(expected[file]!.lineItems.length);
    expect(invoice.status).toBe(file.includes("difficult") ? "needs_review" : "extracted");
    const detail = await request(app)
      .get("/api/invoices/" + id)
      .expect(200);
    expect(detail.body.invoice.id).toBe(id);
    const source = await request(app)
      .get("/api/documents/" + id + "/source")
      .expect(200);
    expect(source.headers["content-type"]).toContain(mime);

    if (file.includes("difficult")) {
      expect(invoice.invoiceNumber).toBeNull();
      expect(invoice.validationIssues.some((issue) => issue.code === "scanned_source")).toBe(true);
      const correction = {
        vendorName: invoice.vendorName,
        invoiceNumber: expected[file]!.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        currency: invoice.currency,
        grandTotal: invoice.grandTotal,
        status: "approved",
        lineItems: invoice.lineItems!.map((line) => ({
          id: line.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          position: line.position,
          manuallyCorrected: false,
        })),
      };
      const saved = await request(app)
        .patch("/api/invoices/" + id)
        .send(correction)
        .expect(200);
      expect(saved.body.invoice.status).toBe("approved");
      expect(saved.body.invoice.manuallyCorrectedFields).toContain("invoiceNumber");
      expect(saved.body.invoice.validationIssues).toEqual([]);
    }
  });
});
