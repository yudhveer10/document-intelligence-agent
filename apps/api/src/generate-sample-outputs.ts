import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import Decimal from "decimal.js";
import type { InvoiceRecord } from "@invoice/shared";
import { ExtractionService } from "./extraction.js";
import { GeminiLlmProvider } from "./llm.js";
import { MemoryInvoiceRepository } from "./testing/memoryRepository.js";

const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const samplesDirectory = path.join(workspaceRoot, "samples");
const outputDirectory = path.join(samplesDirectory, "output");
dotenv.config({ path: path.join(workspaceRoot, ".env") });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is required in the root .env file");
const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

const sampleMimeTypes = {
  "01-clean-conventional.pdf": "application/pdf",
  "02-alternate-layout.pdf": "application/pdf",
  "03-difficult-scan.pdf": "application/pdf",
  "04-offset-invoice.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

interface ExpectedInvoice {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  grandTotal: string;
  expectedStatus?: string;
  lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }>;
}

const expected = JSON.parse(
  await fs.readFile(path.join(samplesDirectory, "expected.json"), "utf8"),
) as Record<string, ExpectedInvoice>;

function equalDecimal(actual: string | null, wanted: string): boolean {
  return actual !== null && new Decimal(actual).eq(wanted);
}

function verify(fileName: string, invoice: InvoiceRecord): void {
  const fixture = expected[fileName];
  if (!fixture) throw new Error("Expected fixture is missing for " + fileName);
  const failures: string[] = [];
  if (invoice.vendorName?.toLocaleLowerCase() !== fixture.vendorName.toLocaleLowerCase())
    failures.push(
      `vendorName (expected ${JSON.stringify(fixture.vendorName)}, received ${JSON.stringify(invoice.vendorName)})`,
    );
  const unreadableReviewNumber =
    fixture.expectedStatus === "needs_review" && invoice.invoiceNumber === null;
  if (!unreadableReviewNumber && invoice.invoiceNumber !== fixture.invoiceNumber)
    failures.push("invoiceNumber");
  if (invoice.invoiceDate !== fixture.invoiceDate) failures.push("invoiceDate");
  if (invoice.currency !== fixture.currency) failures.push("currency");
  if (!equalDecimal(invoice.grandTotal, fixture.grandTotal)) failures.push("grandTotal");
  if (invoice.lineItems?.length !== fixture.lineItems.length) failures.push("lineItems.length");
  fixture.lineItems.forEach((wanted, index) => {
    const actual = invoice.lineItems?.[index];
    if (!actual || actual.description !== wanted.description)
      failures.push(`lineItems.${index}.description`);
    if (!actual || !equalDecimal(actual.quantity, wanted.quantity))
      failures.push(`lineItems.${index}.quantity`);
    if (!actual || !equalDecimal(actual.unitPrice, wanted.unitPrice))
      failures.push(`lineItems.${index}.unitPrice`);
    if (!actual || !equalDecimal(actual.lineTotal, wanted.lineTotal))
      failures.push(`lineItems.${index}.lineTotal`);
  });
  const expectedStatus = fixture.expectedStatus ?? "extracted";
  if (invoice.status !== expectedStatus) failures.push("status");
  if (failures.length > 0)
    throw new Error(fileName + " did not match the independent fixture: " + failures.join(", "));
}

function submissionRecord(fileName: string, invoice: InvoiceRecord) {
  return {
    sourceFile: fileName,
    provider: "gemini",
    model,
    result: {
      vendorName: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      currency: invoice.currency,
      grandTotal: invoice.grandTotal,
      status: invoice.status,
      overallConfidence: invoice.overallConfidence,
      uncertainFields: invoice.uncertainFields,
      validationIssues: invoice.validationIssues,
      sourceType: invoice.sourceType,
      extractionMetadata: invoice.extractionMetadata,
      lineItems: (invoice.lineItems ?? []).map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        confidence: line.confidence,
        needsReview: line.needsReview,
        position: line.position,
      })),
    },
    fixtureVerification: "passed",
  };
}

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-live-samples-"));
try {
  const repository = new MemoryInvoiceRepository();
  const provider = new GeminiLlmProvider(apiKey, model);
  const service = new ExtractionService(repository, provider, temporaryDirectory);
  const generated: Array<{ fileName: string; record: ReturnType<typeof submissionRecord> }> = [];

  for (const [fileName, mimeType] of Object.entries(sampleMimeTypes)) {
    const id = crypto.randomUUID();
    const storedFileName = id + path.extname(fileName);
    await fs.copyFile(
      path.join(samplesDirectory, fileName),
      path.join(temporaryDirectory, storedFileName),
    );
    await repository.createUpload({
      id,
      originalFileName: fileName,
      storedFileName,
      mimeType,
      rawSourceReference: "/api/documents/" + id + "/source",
    });
    const invoice = await service.extract(id);
    verify(fileName, invoice);
    generated.push({ fileName, record: submissionRecord(fileName, invoice) });
    console.log(
      fileName + ": " + invoice.status + " (confidence " + invoice.overallConfidence + ")",
    );
  }

  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    generated.map(({ fileName, record }) =>
      fs.writeFile(
        path.join(outputDirectory, path.parse(fileName).name + ".json"),
        JSON.stringify(record, null, 2) + "\n",
      ),
    ),
  );
  console.log("Wrote " + generated.length + " verified live outputs to " + outputDirectory);
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
