import type { InvoiceCorrection, InvoiceRecord } from "@invoice/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, init);
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; details?: unknown };
  };
  if (!response.ok)
    throw new ApiError(payload.error?.message ?? "Request failed", payload.error?.details);
  return payload as T;
}

export async function listInvoices() {
  return (await request<{ invoices: InvoiceRecord[] }>("/invoices")).invoices;
}
export async function getInvoice(id: string) {
  return (await request<{ invoice: InvoiceRecord }>("/invoices/" + id)).invoice;
}
export async function uploadDocument(file: File) {
  const body = new FormData();
  body.append("document", file);
  return request<{ invoiceId: string; status: string }>("/documents", { method: "POST", body });
}
export async function extractDocument(id: string) {
  return (
    await request<{ invoice: InvoiceRecord }>("/documents/" + id + "/extract", { method: "POST" })
  ).invoice;
}
export async function updateInvoice(id: string, correction: InvoiceCorrection) {
  return (
    await request<{ invoice: InvoiceRecord }>("/invoices/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(correction),
    })
  ).invoice;
}
export function sourceUrl(id: string) {
  return API_URL + "/documents/" + id + "/source";
}
