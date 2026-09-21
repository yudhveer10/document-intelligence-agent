import { describe, expect, it } from "vitest";
import { extractionResponseSchema, invoiceCorrectionSchema } from "./schemas.js";

const validExtraction = {
  vendorName: "Northstar Office Supply",
  invoiceNumber: "NOS-1048",
  invoiceDate: "2026-02-14",
  currency: "USD",
  lineItems: [
    {
      description: "Archival paper",
      quantity: "2",
      unitPrice: "14.50",
      lineTotal: "29.00",
      confidence: 0.98,
      uncertainFields: [],
    },
  ],
  grandTotal: "29.00",
  fieldConfidence: {
    vendorName: 0.99,
    invoiceNumber: 0.99,
    invoiceDate: 0.97,
    currency: 0.99,
    grandTotal: 0.99,
    lineItems: 0.96,
  },
  uncertainFields: [],
  notes: [],
};

describe("shared schemas", () => {
  it("accepts a valid structured extraction", () => {
    expect(extractionResponseSchema.parse(validExtraction).invoiceNumber).toBe("NOS-1048");
  });

  it("allows unreadable required values to be explicit nulls", () => {
    expect(
      extractionResponseSchema.parse({ ...validExtraction, invoiceNumber: null }).invoiceNumber,
    ).toBeNull();
  });

  it("rejects omitted required keys and unknown keys", () => {
    const missing = { ...validExtraction } as Partial<typeof validExtraction>;
    delete missing.grandTotal;
    expect(extractionResponseSchema.safeParse(missing).success).toBe(false);
    expect(extractionResponseSchema.safeParse({ ...validExtraction, guessed: true }).success).toBe(
      false,
    );
  });

  it("requires corrections to include line items", () => {
    expect(
      invoiceCorrectionSchema.safeParse({
        vendorName: "Northstar",
        invoiceNumber: "1",
        invoiceDate: "2026-02-14",
        currency: "USD",
        grandTotal: "29.00",
        lineItems: [],
        status: "approved",
      }).success,
    ).toBe(false);
  });
});
