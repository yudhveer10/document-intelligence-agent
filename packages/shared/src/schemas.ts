import { z } from "zod";

export const invoiceStatusSchema = z.enum([
  "uploaded",
  "processing",
  "extracted",
  "needs_review",
  "approved",
  "failed",
]);

export const sourceTypeSchema = z.enum(["digital_pdf", "scanned_pdf", "excel"]);
export const confidenceSchema = z.number().min(0).max(1);
export const nullableTextSchema = z.string().trim().min(1).nullable();
export const nullableAmountSchema = z.union([z.string().trim().min(1), z.number()]).nullable();

export const extractedLineItemSchema = z
  .object({
    description: nullableTextSchema,
    quantity: nullableAmountSchema,
    unitPrice: nullableAmountSchema,
    lineTotal: nullableAmountSchema,
    confidence: confidenceSchema,
    uncertainFields: z.array(z.enum(["description", "quantity", "unitPrice", "lineTotal"])),
  })
  .strict();

export const extractionResponseSchema = z
  .object({
    vendorName: nullableTextSchema,
    invoiceNumber: nullableTextSchema,
    invoiceDate: nullableTextSchema,
    currency: z.string().trim().length(3).nullable(),
    lineItems: z.array(extractedLineItemSchema),
    grandTotal: nullableAmountSchema,
    fieldConfidence: z
      .object({
        vendorName: confidenceSchema,
        invoiceNumber: confidenceSchema,
        invoiceDate: confidenceSchema,
        currency: confidenceSchema,
        grandTotal: confidenceSchema,
        lineItems: confidenceSchema,
      })
      .strict(),
    uncertainFields: z.array(z.string().trim().min(1)),
    notes: z.array(z.string().trim().min(1)),
  })
  .strict();

export const correctedLineItemSchema = z
  .object({
    id: z.string().uuid().optional(),
    description: z.string().trim().min(1, "Description is required"),
    quantity: z.string().trim().min(1),
    unitPrice: z.string().trim().min(1),
    lineTotal: z.string().trim().min(1),
    position: z.number().int().min(0),
    manuallyCorrected: z.boolean().default(true),
  })
  .strict();

export const invoiceCorrectionSchema = z
  .object({
    vendorName: z.string().trim().min(1, "Vendor name is required"),
    invoiceNumber: z.string().trim().min(1, "Invoice number is required"),
    invoiceDate: z.string().trim().min(1, "Invoice date is required"),
    currency: z.string().trim().length(3).toUpperCase(),
    grandTotal: z.string().trim().min(1, "Grand total is required"),
    lineItems: z.array(correctedLineItemSchema).min(1, "At least one line item is required"),
    status: z.enum(["needs_review", "approved"]),
  })
  .strict();

export const idParameterSchema = z.object({ id: z.string().uuid() }).strict();

export const uploadResponseSchema = z.object({
  invoiceId: z.string().uuid(),
  status: invoiceStatusSchema,
});
