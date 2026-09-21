import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  InvoiceCorrection,
  InvoiceRecord,
  InvoiceStatus,
  LineItemRecord,
  SourceType,
  ValidationIssue,
} from "@invoice/shared";
import { AppError } from "./errors.js";

export interface CreateUploadInput {
  id: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  rawSourceReference: string;
}

export interface ExtractionSaveInput {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  grandTotal: string | null;
  status: InvoiceStatus;
  overallConfidence: number;
  uncertainFields: string[];
  validationIssues: ValidationIssue[];
  sourceType: SourceType;
  extractionMetadata: Record<string, unknown>;
  rawModelOutput: unknown;
  lineItems: Array<{
    description: string | null;
    quantity: string | null;
    unitPrice: string | null;
    lineTotal: string | null;
    confidence: number;
    needsReview: boolean;
    position: number;
  }>;
}

export interface InvoiceRepository {
  createUpload(input: CreateUploadInput): Promise<InvoiceRecord>;
  getById(id: string): Promise<InvoiceRecord | null>;
  list(): Promise<InvoiceRecord[]>;
  setStatus(id: string, status: InvoiceStatus): Promise<void>;
  saveExtraction(id: string, input: ExtractionSaveInput): Promise<InvoiceRecord>;
  saveExtractionFailure(
    id: string,
    input: {
      sourceType: SourceType;
      reason: string;
      rawModelOutput: unknown;
      metadata: Record<string, unknown>;
    },
  ): Promise<InvoiceRecord>;
  saveCorrection(
    id: string,
    correction: InvoiceCorrection,
    issues: ValidationIssue[],
  ): Promise<InvoiceRecord>;
}

type DatabaseRow = Record<string, unknown>;

function lineFromRow(row: DatabaseRow): LineItemRecord {
  return {
    id: String(row.id),
    invoiceId: String(row.invoice_id),
    description: row.description === null ? null : String(row.description),
    quantity: row.quantity === null ? null : String(row.quantity),
    unitPrice: row.unit_price === null ? null : String(row.unit_price),
    lineTotal: row.line_total === null ? null : String(row.line_total),
    confidence: Number(row.confidence ?? 0),
    needsReview: Boolean(row.needs_review),
    manuallyCorrected: Boolean(row.manually_corrected),
    position: Number(row.position),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function invoiceFromRow(row: DatabaseRow): InvoiceRecord {
  const lines = Array.isArray(row.line_items)
    ? row.line_items.map((item) => lineFromRow(item as DatabaseRow))
    : undefined;
  return {
    id: String(row.id),
    vendorName: row.vendor_name === null ? null : String(row.vendor_name),
    invoiceNumber: row.invoice_number === null ? null : String(row.invoice_number),
    invoiceDate: row.invoice_date === null ? null : String(row.invoice_date),
    grandTotal: row.grand_total === null ? null : String(row.grand_total),
    currency: row.currency === null ? null : String(row.currency),
    status: row.status as InvoiceStatus,
    overallConfidence: Number(row.overall_confidence ?? 0),
    uncertainFields: (row.uncertain_fields as string[] | null) ?? [],
    validationIssues: (row.validation_issues as ValidationIssue[] | null) ?? [],
    rawSourceReference: String(row.raw_source_reference),
    originalFileName: String(row.original_file_name),
    storedFileName: String(row.stored_file_name),
    mimeType: String(row.mime_type),
    sourceType: (row.source_type as SourceType | null) ?? null,
    extractionMetadata: (row.extraction_metadata as Record<string, unknown> | null) ?? {},
    manuallyCorrectedFields: (row.manually_corrected_fields as string[] | null) ?? [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(lines ? { lineItems: lines } : {}),
  };
}

export class SupabaseInvoiceRepository implements InvoiceRepository {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private throwDatabaseError(context: string, error: { message: string } | null): never {
    console.error(JSON.stringify({ level: "error", context, databaseError: error?.message }));
    throw new AppError(503, "database_error", "The database operation failed");
  }

  async createUpload(input: CreateUploadInput): Promise<InvoiceRecord> {
    const { data, error } = await this.client
      .from("invoices")
      .insert({
        id: input.id,
        original_file_name: input.originalFileName,
        stored_file_name: input.storedFileName,
        mime_type: input.mimeType,
        raw_source_reference: input.rawSourceReference,
        status: "uploaded",
      })
      .select()
      .single();
    if (error || !data) this.throwDatabaseError("createUpload", error);
    return invoiceFromRow(data as DatabaseRow);
  }

  async getById(id: string): Promise<InvoiceRecord | null> {
    const { data, error } = await this.client
      .from("invoices")
      .select("*, line_items(*)")
      .eq("id", id)
      .order("position", { referencedTable: "line_items" })
      .maybeSingle();
    if (error) this.throwDatabaseError("getById", error);
    return data ? invoiceFromRow(data as DatabaseRow) : null;
  }

  async list(): Promise<InvoiceRecord[]> {
    const { data, error } = await this.client
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) this.throwDatabaseError("list", error);
    return (data ?? []).map((row) => invoiceFromRow(row as DatabaseRow));
  }

  async setStatus(id: string, status: InvoiceStatus): Promise<void> {
    const { error } = await this.client.from("invoices").update({ status }).eq("id", id);
    if (error) this.throwDatabaseError("setStatus", error);
  }

  async saveExtraction(id: string, input: ExtractionSaveInput): Promise<InvoiceRecord> {
    const invoiceData = {
      vendor_name: input.vendorName,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate,
      currency: input.currency,
      grand_total: input.grandTotal,
      status: input.status,
      overall_confidence: input.overallConfidence,
      uncertain_fields: input.uncertainFields,
      validation_issues: input.validationIssues,
      source_type: input.sourceType,
      extraction_metadata: input.extractionMetadata,
      raw_model_output: input.rawModelOutput,
    };
    const lines = input.lineItems.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: line.lineTotal,
      confidence: line.confidence,
      needs_review: line.needsReview,
      manually_corrected: false,
      position: line.position,
    }));
    const { error } = await this.client.rpc("replace_invoice_data", {
      p_invoice_id: id,
      p_data: invoiceData,
      p_lines: lines,
      p_is_correction: false,
    });
    if (error) this.throwDatabaseError("saveExtraction", error);
    const saved = await this.getById(id);
    if (!saved) throw new AppError(404, "invoice_not_found", "Invoice not found");
    return saved;
  }

  async saveExtractionFailure(
    id: string,
    input: {
      sourceType: SourceType;
      reason: string;
      rawModelOutput: unknown;
      metadata: Record<string, unknown>;
    },
  ): Promise<InvoiceRecord> {
    const issue: ValidationIssue = {
      code: "extraction_failed",
      field: "document",
      message: input.reason,
      severity: "error",
    };
    const { error } = await this.client
      .from("invoices")
      .update({
        status: "needs_review",
        source_type: input.sourceType,
        overall_confidence: 0,
        uncertain_fields: ["vendorName", "invoiceNumber", "invoiceDate", "lineItems", "grandTotal"],
        validation_issues: [issue],
        raw_model_output: input.rawModelOutput,
        extraction_metadata: input.metadata,
      })
      .eq("id", id);
    if (error) this.throwDatabaseError("saveExtractionFailure", error);
    const saved = await this.getById(id);
    if (!saved) throw new AppError(404, "invoice_not_found", "Invoice not found");
    return saved;
  }

  async saveCorrection(
    id: string,
    correction: InvoiceCorrection,
    issues: ValidationIssue[],
  ): Promise<InvoiceRecord> {
    const previous = await this.getById(id);
    if (!previous) throw new AppError(404, "invoice_not_found", "Invoice not found");
    const finalStatus: InvoiceStatus =
      correction.status === "approved" && issues.length === 0 ? "approved" : "needs_review";
    const changedFields: string[] = (
      [
        ["vendorName", previous.vendorName, correction.vendorName],
        ["invoiceNumber", previous.invoiceNumber, correction.invoiceNumber],
        ["invoiceDate", previous.invoiceDate, correction.invoiceDate],
        ["currency", previous.currency, correction.currency],
        ["grandTotal", previous.grandTotal, correction.grandTotal],
      ] as const
    )
      .filter(([, before, after]) => before !== after)
      .map(([field]) => field);
    const changedLines =
      correction.lineItems.length !== previous.lineItems?.length ||
      correction.lineItems.some((line, index) => {
        const prior = previous.lineItems?.[index];
        return (
          !prior ||
          prior.description !== line.description ||
          prior.quantity !== line.quantity ||
          prior.unitPrice !== line.unitPrice ||
          prior.lineTotal !== line.lineTotal
        );
      });
    if (changedLines) changedFields.push("lineItems");
    const fields = Array.from(new Set([...previous.manuallyCorrectedFields, ...changedFields]));
    const invoiceData = {
      vendor_name: correction.vendorName,
      invoice_number: correction.invoiceNumber,
      invoice_date: correction.invoiceDate,
      currency: correction.currency,
      grand_total: correction.grandTotal,
      status: finalStatus,
      validation_issues: issues,
      uncertain_fields: issues.map((issue) => issue.field),
      manually_corrected_fields: fields,
      overall_confidence: previous.overallConfidence,
    };
    const lines = correction.lineItems.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: line.lineTotal,
      confidence: 1,
      needs_review: issues.some((issue) => issue.field.startsWith("lineItems." + line.position)),
      manually_corrected:
        line.manuallyCorrected &&
        (previous.lineItems?.[line.position]?.manuallyCorrected ||
          !previous.lineItems?.[line.position] ||
          previous.lineItems[line.position]?.description !== line.description ||
          previous.lineItems[line.position]?.quantity !== line.quantity ||
          previous.lineItems[line.position]?.unitPrice !== line.unitPrice ||
          previous.lineItems[line.position]?.lineTotal !== line.lineTotal),
      position: line.position,
    }));
    const { error } = await this.client.rpc("replace_invoice_data", {
      p_invoice_id: id,
      p_data: invoiceData,
      p_lines: lines,
      p_is_correction: true,
    });
    if (error) this.throwDatabaseError("saveCorrection", error);
    const saved = await this.getById(id);
    if (!saved) throw new AppError(404, "invoice_not_found", "Invoice not found");
    return saved;
  }
}
