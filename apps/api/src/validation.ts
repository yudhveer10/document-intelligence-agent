import Decimal from "decimal.js";
import type {
  ExtractionResponse,
  InvoiceCorrection,
  SourceType,
  ValidationIssue,
} from "@invoice/shared";

export const MONETARY_ABSOLUTE_TOLERANCE = new Decimal("0.02");

export interface NormalizedInvoice {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  grandTotal: string | null;
  lineItems: Array<{
    description: string | null;
    quantity: string | null;
    unitPrice: string | null;
    lineTotal: string | null;
    confidence: number;
    uncertainFields: string[];
  }>;
  fieldConfidence: ExtractionResponse["fieldConfidence"];
  uncertainFields: string[];
  notes: string[];
}

function cleanText(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeAmount(value: string | number | null): string | null {
  if (value === null) return null;
  let text = String(value).trim();
  const negativeByParentheses = /^\(.*\)$/.test(text);
  text = text.replace(/[,$£€₹\s]/g, "").replace(/^\((.*)\)$/, "$1");
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
  try {
    const decimal = new Decimal(text).toDecimalPlaces(6);
    return (negativeByParentheses ? decimal.negated() : decimal).toFixed();
  } catch {
    return null;
  }
}

export function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const common = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (common) {
    const first = Number(common[1]);
    const second = Number(common[2]);
    if (first <= 12 && second <= 12) return null;
    if (first <= 12 && second > 12) {
      month = first;
      day = second;
    } else {
      day = first;
      month = second;
    }
    year = Number(common[3]);
  } else {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.valueOf())) return null;
    year = parsed.getUTCFullYear();
    month = parsed.getUTCMonth() + 1;
    day = parsed.getUTCDate();
  }
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  )
    return null;
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function normalizeExtraction(extraction: ExtractionResponse): {
  invoice: NormalizedInvoice;
  warnings: ValidationIssue[];
} {
  const warnings: ValidationIssue[] = [];
  const invoiceDate = normalizeDate(extraction.invoiceDate);
  if (extraction.invoiceDate && !invoiceDate)
    warnings.push({
      code: "date_normalization_failed",
      field: "invoiceDate",
      message: "Invoice date is invalid or ambiguous",
      severity: "error",
    });
  const grandTotal = normalizeAmount(extraction.grandTotal);
  if (extraction.grandTotal !== null && grandTotal === null)
    warnings.push({
      code: "amount_normalization_failed",
      field: "grandTotal",
      message: "Grand total is malformed",
      severity: "error",
    });
  const lineItems = extraction.lineItems.map((line, index) => {
    const quantity = normalizeAmount(line.quantity);
    const unitPrice = normalizeAmount(line.unitPrice);
    const lineTotal = normalizeAmount(line.lineTotal);
    for (const [field, original, normalized] of [
      ["quantity", line.quantity, quantity],
      ["unitPrice", line.unitPrice, unitPrice],
      ["lineTotal", line.lineTotal, lineTotal],
    ] as const) {
      if (original !== null && normalized === null)
        warnings.push({
          code: "amount_normalization_failed",
          field: "lineItems." + index + "." + field,
          message: "Line item " + (index + 1) + " has a malformed " + field,
          severity: "error",
        });
    }
    return {
      description: cleanText(line.description),
      quantity,
      unitPrice,
      lineTotal,
      confidence: line.confidence,
      uncertainFields: line.uncertainFields,
    };
  });
  return {
    invoice: {
      vendorName: cleanText(extraction.vendorName),
      invoiceNumber: cleanText(extraction.invoiceNumber),
      invoiceDate,
      currency: extraction.currency?.toUpperCase() ?? null,
      grandTotal,
      lineItems,
      fieldConfidence: extraction.fieldConfidence,
      uncertainFields: extraction.uncertainFields,
      notes: extraction.notes,
    },
    warnings,
  };
}

function approximatelyEqual(actual: Decimal, expected: Decimal): boolean {
  return actual.sub(expected).abs().lte(MONETARY_ABSOLUTE_TOLERANCE);
}

export function validateInvoice(
  invoice: NormalizedInvoice,
  sourceType: SourceType,
  normalizationWarnings: ValidationIssue[] = [],
): ValidationIssue[] {
  const issues = [...normalizationWarnings];
  for (const [field, value] of [
    ["vendorName", invoice.vendorName],
    ["invoiceNumber", invoice.invoiceNumber],
    ["invoiceDate", invoice.invoiceDate],
    ["grandTotal", invoice.grandTotal],
  ] as const) {
    if (!value)
      issues.push({
        code: "missing_required_field",
        field,
        message: field + " is missing or unreadable",
        severity: "error",
      });
  }
  if (!invoice.currency)
    issues.push({
      code: "missing_currency",
      field: "currency",
      message: "Currency is missing or unreadable",
      severity: "warning",
    });
  if (invoice.invoiceDate) {
    const date = new Date(invoice.invoiceDate + "T00:00:00Z");
    const earliest = new Date("1990-01-01T00:00:00Z");
    const latest = new Date();
    latest.setUTCFullYear(latest.getUTCFullYear() + 1);
    if (date < earliest || date > latest)
      issues.push({
        code: "implausible_date",
        field: "invoiceDate",
        message: "Invoice date falls outside the plausible range",
        severity: "error",
      });
  }
  if (invoice.lineItems.length === 0)
    issues.push({
      code: "missing_line_items",
      field: "lineItems",
      message: "No line items were extracted",
      severity: "error",
    });
  let sum = new Decimal(0);
  let canSum = invoice.lineItems.length > 0;
  invoice.lineItems.forEach((line, index) => {
    const prefix = "lineItems." + index;
    if (!line.description)
      issues.push({
        code: "empty_description",
        field: prefix + ".description",
        message: "Line item " + (index + 1) + " has no description",
        severity: "error",
      });
    const quantity = line.quantity === null ? null : new Decimal(line.quantity);
    const unitPrice = line.unitPrice === null ? null : new Decimal(line.unitPrice);
    const lineTotal = line.lineTotal === null ? null : new Decimal(line.lineTotal);
    if (quantity === null)
      issues.push({
        code: "missing_quantity",
        field: prefix + ".quantity",
        message: "Line item " + (index + 1) + " has no quantity",
        severity: "error",
      });
    else if (quantity.lte(0))
      issues.push({
        code: "non_positive_quantity",
        field: prefix + ".quantity",
        message: "Line item " + (index + 1) + " quantity must be positive",
        severity: "error",
      });
    if (unitPrice === null)
      issues.push({
        code: "missing_unit_price",
        field: prefix + ".unitPrice",
        message: "Line item " + (index + 1) + " has no unit price",
        severity: "error",
      });
    else if (unitPrice.isNegative())
      issues.push({
        code: "negative_unit_price",
        field: prefix + ".unitPrice",
        message: "Line item " + (index + 1) + " unit price is negative",
        severity: "error",
      });
    if (lineTotal === null) {
      canSum = false;
      issues.push({
        code: "missing_line_total",
        field: prefix + ".lineTotal",
        message: "Line item " + (index + 1) + " has no line total",
        severity: "error",
      });
    } else {
      if (lineTotal.isNegative())
        issues.push({
          code: "negative_line_total",
          field: prefix + ".lineTotal",
          message: "Line item " + (index + 1) + " total is negative",
          severity: "error",
        });
      sum = sum.add(lineTotal);
    }
    if (
      quantity &&
      unitPrice &&
      lineTotal &&
      !approximatelyEqual(lineTotal, quantity.mul(unitPrice))
    )
      issues.push({
        code: "line_total_mismatch",
        field: prefix + ".lineTotal",
        message:
          "Line item " + (index + 1) + " total does not match quantity multiplied by unit price",
        severity: "error",
      });
  });
  if (
    canSum &&
    invoice.grandTotal !== null &&
    !approximatelyEqual(sum, new Decimal(invoice.grandTotal))
  )
    issues.push({
      code: "grand_total_mismatch",
      field: "grandTotal",
      message: "Grand total does not match the sum of line totals",
      severity: "error",
    });
  if (sourceType === "scanned_pdf")
    issues.push({
      code: "scanned_source",
      field: "document",
      message: "Image-only source requires human review because visual noise can hide characters",
      severity: "warning",
    });
  return issues;
}

export function scoreConfidence(
  invoice: NormalizedInvoice,
  issues: ValidationIssue[],
  sourceQuality: number,
): number {
  const required = [
    invoice.vendorName,
    invoice.invoiceNumber,
    invoice.invoiceDate,
    invoice.grandTotal,
    invoice.lineItems.length ? "lines" : null,
  ];
  const completeness = required.filter(Boolean).length / required.length;
  const modelValues = Object.values(invoice.fieldConfidence);
  const model = modelValues.reduce((total, value) => total + value, 0) / modelValues.length;
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const deterministic = Math.max(0, 1 - errorCount * 0.18 - warningCount * 0.05);
  const score = completeness * 0.35 + deterministic * 0.3 + sourceQuality * 0.2 + model * 0.15;
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

export function validateCorrection(correction: InvoiceCorrection): {
  correction: InvoiceCorrection;
  issues: ValidationIssue[];
} {
  const date = normalizeDate(correction.invoiceDate);
  const grandTotal = normalizeAmount(correction.grandTotal);
  const issues: ValidationIssue[] = [];
  if (!date)
    issues.push({
      code: "invalid_date",
      field: "invoiceDate",
      message: "Enter an unambiguous valid date",
      severity: "error",
    });
  if (grandTotal === null)
    issues.push({
      code: "invalid_amount",
      field: "grandTotal",
      message: "Enter a valid grand total",
      severity: "error",
    });
  const normalizedLines = correction.lineItems.map((line, index) => {
    const quantity = normalizeAmount(line.quantity);
    const unitPrice = normalizeAmount(line.unitPrice);
    const lineTotal = normalizeAmount(line.lineTotal);
    if (quantity === null || unitPrice === null || lineTotal === null)
      issues.push({
        code: "invalid_line_amount",
        field: "lineItems." + index,
        message: "Line item " + (index + 1) + " contains an invalid amount",
        severity: "error",
      });
    return {
      ...line,
      quantity: quantity ?? line.quantity,
      unitPrice: unitPrice ?? line.unitPrice,
      lineTotal: lineTotal ?? line.lineTotal,
    };
  });
  if (issues.length === 0) {
    const normalized: NormalizedInvoice = {
      vendorName: correction.vendorName,
      invoiceNumber: correction.invoiceNumber,
      invoiceDate: date,
      currency: correction.currency,
      grandTotal,
      lineItems: normalizedLines.map((line) => ({ ...line, confidence: 1, uncertainFields: [] })),
      fieldConfidence: {
        vendorName: 1,
        invoiceNumber: 1,
        invoiceDate: 1,
        currency: 1,
        grandTotal: 1,
        lineItems: 1,
      },
      uncertainFields: [],
      notes: [],
    };
    issues.push(...validateInvoice(normalized, "digital_pdf"));
  }
  return {
    correction: {
      ...correction,
      invoiceDate: date ?? correction.invoiceDate,
      grandTotal: grandTotal ?? correction.grandTotal,
      lineItems: normalizedLines,
    },
    issues,
  };
}
