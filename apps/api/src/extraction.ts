import path from "node:path";
import { extractionResponseSchema } from "@invoice/shared";
import type { InvoiceRepository } from "./repository.js";
import type { LlmProvider } from "./llm.js";
import { preprocessDocument } from "./preprocessor.js";
import { normalizeExtraction, scoreConfidence, validateInvoice } from "./validation.js";
import { AppError } from "./errors.js";

export function parseModelJson(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed) as unknown;
}

function validationMessages(error: unknown): string[] {
  if (error instanceof SyntaxError) return ["Malformed JSON: " + error.message];
  if (typeof error === "object" && error && "issues" in error) {
    const issues = (error as { issues: Array<{ path: Array<string | number>; message: string }> })
      .issues;
    return issues.map((issue) => issue.path.join(".") + ": " + issue.message);
  }
  return ["The LLM request failed or returned an empty response"];
}

export class ExtractionService {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly provider: LlmProvider,
    private readonly uploadDirectory: string,
  ) {}

  async extract(id: string) {
    const invoice = await this.repository.getById(id);
    if (!invoice) throw new AppError(404, "invoice_not_found", "Invoice not found");
    if (invoice.status === "processing")
      throw new AppError(409, "already_processing", "Invoice extraction is already in progress");
    await this.repository.setStatus(id, "processing");
    const filePath = path.join(this.uploadDirectory, path.basename(invoice.storedFileName));
    let document;
    try {
      document = await preprocessDocument(filePath, invoice.mimeType);
    } catch {
      await this.repository.setStatus(id, "failed");
      throw new AppError(
        422,
        "preprocessing_failed",
        "The document could not be preprocessed. Check that it is a valid, readable PDF or workbook.",
      );
    }
    let raw = "";
    let parsed: ReturnType<typeof extractionResponseSchema.parse> | null = null;
    let errors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        raw = await this.provider.extract({
          document,
          ...(attempt === 1 ? { previousOutput: raw, validationErrors: errors } : {}),
        });
        parsed = extractionResponseSchema.parse(parseModelJson(raw));
        break;
      } catch (error) {
        errors = validationMessages(error);
      }
    }
    const metadata = {
      pageCount: document.pageCount,
      sheetCount: document.sheetCount,
      extractedCharacterCount: document.extractedCharacterCount,
      sourceQuality: document.sourceQuality,
      preprocessingWarnings: document.warnings,
      repairAttempted: errors.length > 0,
    };
    if (!parsed) {
      return this.repository.saveExtractionFailure(id, {
        sourceType: document.sourceType,
        reason: "Model output remained invalid after one repair attempt: " + errors.join("; "),
        rawModelOutput: { text: raw },
        metadata,
      });
    }
    const { invoice: normalized, warnings } = normalizeExtraction(parsed);
    const issues = validateInvoice(normalized, document.sourceType, warnings);
    for (const field of normalized.uncertainFields) {
      if (!issues.some((issue) => issue.field === field)) {
        issues.push({
          code: "model_uncertain",
          field,
          message: "The model marked this field as uncertain",
          severity: "warning",
        });
      }
    }
    for (const [field, value] of Object.entries(normalized.fieldConfidence)) {
      if (value < 0.7 && !issues.some((issue) => issue.field === field)) {
        issues.push({
          code: "low_model_confidence",
          field,
          message: "The model reported low confidence for this field",
          severity: "warning",
        });
      }
    }
    const confidence = scoreConfidence(normalized, issues, document.sourceQuality);
    const uncertain = Array.from(
      new Set([...normalized.uncertainFields, ...issues.map((issue) => issue.field)]),
    );
    const needsReview =
      document.sourceType === "scanned_pdf" || issues.length > 0 || confidence < 0.82;
    return this.repository.saveExtraction(id, {
      vendorName: normalized.vendorName,
      invoiceNumber: normalized.invoiceNumber,
      invoiceDate: normalized.invoiceDate,
      currency: normalized.currency,
      grandTotal: normalized.grandTotal,
      status: needsReview ? "needs_review" : "extracted",
      overallConfidence: confidence,
      uncertainFields: uncertain,
      validationIssues: issues,
      sourceType: document.sourceType,
      extractionMetadata: metadata,
      rawModelOutput: parsed,
      lineItems: normalized.lineItems.map((line, position) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        confidence: line.confidence,
        needsReview:
          line.uncertainFields.length > 0 ||
          issues.some((issue) => issue.field.startsWith("lineItems." + position)),
        position,
      })),
    });
  }
}
