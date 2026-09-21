import crypto from "node:crypto";
import type {
  InvoiceCorrection,
  InvoiceRecord,
  InvoiceStatus,
  LineItemRecord,
  ValidationIssue,
} from "@invoice/shared";
import type { CreateUploadInput, ExtractionSaveInput, InvoiceRepository } from "../repository.js";

export class MemoryInvoiceRepository implements InvoiceRepository {
  private readonly invoices = new Map<string, InvoiceRecord>();

  async createUpload(input: CreateUploadInput): Promise<InvoiceRecord> {
    const now = new Date().toISOString();
    const invoice: InvoiceRecord = {
      id: input.id,
      vendorName: null,
      invoiceNumber: null,
      invoiceDate: null,
      grandTotal: null,
      currency: null,
      status: "uploaded",
      overallConfidence: 0,
      uncertainFields: [],
      validationIssues: [],
      rawSourceReference: input.rawSourceReference,
      originalFileName: input.originalFileName,
      storedFileName: input.storedFileName,
      mimeType: input.mimeType,
      sourceType: null,
      extractionMetadata: {},
      manuallyCorrectedFields: [],
      createdAt: now,
      updatedAt: now,
      lineItems: [],
    };
    this.invoices.set(input.id, invoice);
    return structuredClone(invoice);
  }

  async getById(id: string) {
    const value = this.invoices.get(id);
    return value ? structuredClone(value) : null;
  }
  async list() {
    return Array.from(this.invoices.values()).map((invoice) => structuredClone(invoice));
  }
  async setStatus(id: string, status: InvoiceStatus) {
    const invoice = this.invoices.get(id);
    if (invoice) {
      invoice.status = status;
      invoice.updatedAt = new Date().toISOString();
    }
  }

  async saveExtraction(id: string, input: ExtractionSaveInput): Promise<InvoiceRecord> {
    const existing = this.invoices.get(id);
    if (!existing) throw new Error("missing invoice");
    const now = new Date().toISOString();
    const lineItems: LineItemRecord[] = input.lineItems.map((line) => ({
      id: crypto.randomUUID(),
      invoiceId: id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      confidence: line.confidence,
      needsReview: line.needsReview,
      manuallyCorrected: false,
      position: line.position,
      createdAt: now,
      updatedAt: now,
    }));
    Object.assign(existing, input, { lineItems, updatedAt: now });
    return structuredClone(existing);
  }

  async saveExtractionFailure(
    id: string,
    input: {
      sourceType: "digital_pdf" | "scanned_pdf" | "excel";
      reason: string;
      rawModelOutput: unknown;
      metadata: Record<string, unknown>;
    },
  ): Promise<InvoiceRecord> {
    const existing = this.invoices.get(id);
    if (!existing) throw new Error("missing invoice");
    existing.status = "needs_review";
    existing.sourceType = input.sourceType;
    existing.overallConfidence = 0;
    existing.validationIssues = [
      { code: "extraction_failed", field: "document", message: input.reason, severity: "error" },
    ];
    existing.extractionMetadata = input.metadata;
    return structuredClone(existing);
  }

  async saveCorrection(
    id: string,
    correction: InvoiceCorrection,
    issues: ValidationIssue[],
  ): Promise<InvoiceRecord> {
    const existing = this.invoices.get(id);
    if (!existing) throw new Error("missing invoice");
    const now = new Date().toISOString();
    const changedFields: string[] = (
      [
        ["vendorName", existing.vendorName, correction.vendorName],
        ["invoiceNumber", existing.invoiceNumber, correction.invoiceNumber],
        ["invoiceDate", existing.invoiceDate, correction.invoiceDate],
        ["currency", existing.currency, correction.currency],
        ["grandTotal", existing.grandTotal, correction.grandTotal],
      ] as const
    )
      .filter(([, before, after]) => before !== after)
      .map(([field]) => field);
    const changedLines =
      correction.lineItems.length !== existing.lineItems?.length ||
      correction.lineItems.some((line, index) => {
        const prior = existing.lineItems?.[index];
        return (
          !prior ||
          prior.description !== line.description ||
          prior.quantity !== line.quantity ||
          prior.unitPrice !== line.unitPrice ||
          prior.lineTotal !== line.lineTotal
        );
      });
    if (changedLines) changedFields.push("lineItems");
    const correctedFields = Array.from(
      new Set([...existing.manuallyCorrectedFields, ...changedFields]),
    );
    const previousLines = existing.lineItems ?? [];
    Object.assign(existing, {
      vendorName: correction.vendorName,
      invoiceNumber: correction.invoiceNumber,
      invoiceDate: correction.invoiceDate,
      grandTotal: correction.grandTotal,
      currency: correction.currency,
      status: correction.status === "approved" && issues.length === 0 ? "approved" : "needs_review",
      validationIssues: issues,
      uncertainFields: issues.map((issue) => issue.field),
      manuallyCorrectedFields: correctedFields,
      updatedAt: now,
      lineItems: correction.lineItems.map((line) => ({
        id: line.id ?? crypto.randomUUID(),
        invoiceId: id,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        confidence: previousLines[line.position]?.confidence ?? 0,
        needsReview: false,
        manuallyCorrected:
          Boolean(previousLines[line.position]?.manuallyCorrected) ||
          !previousLines[line.position] ||
          previousLines[line.position]?.description !== line.description ||
          previousLines[line.position]?.quantity !== line.quantity ||
          previousLines[line.position]?.unitPrice !== line.unitPrice ||
          previousLines[line.position]?.lineTotal !== line.lineTotal,
        position: line.position,
        createdAt: now,
        updatedAt: now,
      })),
    });
    return structuredClone(existing);
  }
}
