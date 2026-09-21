import type { z } from "zod";
import type {
  extractionResponseSchema,
  invoiceCorrectionSchema,
  invoiceStatusSchema,
  sourceTypeSchema,
} from "./schemas.js";

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;
export type InvoiceCorrection = z.infer<typeof invoiceCorrectionSchema>;

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
  severity: "warning" | "error";
}

export interface LineItemRecord {
  id: string;
  invoiceId: string;
  description: string | null;
  quantity: string | null;
  unitPrice: string | null;
  lineTotal: string | null;
  confidence: number;
  needsReview: boolean;
  manuallyCorrected: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceRecord {
  id: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  grandTotal: string | null;
  currency: string | null;
  status: InvoiceStatus;
  overallConfidence: number;
  uncertainFields: string[];
  validationIssues: ValidationIssue[];
  rawSourceReference: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  sourceType: SourceType | null;
  extractionMetadata: Record<string, unknown>;
  manuallyCorrectedFields: string[];
  createdAt: string;
  updatedAt: string;
  lineItems?: LineItemRecord[];
}
