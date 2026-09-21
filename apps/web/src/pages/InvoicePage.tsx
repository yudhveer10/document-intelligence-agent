import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowSquareOut,
  FloppyDisk,
  Plus,
  Trash,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { Link, useParams } from "react-router-dom";
import type { InvoiceCorrection, InvoiceRecord } from "@invoice/shared";
import { ApiError, getInvoice, sourceUrl, updateInvoice } from "../api.js";
import { ConfidenceBadge, StatusBadge } from "../components/Badge.js";

type EditLine = InvoiceCorrection["lineItems"][number];

function makeForm(invoice: InvoiceRecord): InvoiceCorrection {
  return {
    vendorName: invoice.vendorName ?? "",
    invoiceNumber: invoice.invoiceNumber ?? "",
    invoiceDate: invoice.invoiceDate ?? "",
    currency: invoice.currency ?? "USD",
    grandTotal: invoice.grandTotal ?? "",
    status: "needs_review",
    lineItems: (invoice.lineItems ?? []).map((line) => ({
      id: line.id,
      description: line.description ?? "",
      quantity: line.quantity ?? "",
      unitPrice: line.unitPrice ?? "",
      lineTotal: line.lineTotal ?? "",
      position: line.position,
      manuallyCorrected: true,
    })),
  };
}

export function InvoicePage() {
  const { id = "" } = useParams();
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [form, setForm] = useState<InvoiceCorrection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getInvoice(id)
      .then((value) => {
        setInvoice(value);
        setForm(makeForm(value));
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Invoice could not be loaded."),
      )
      .finally(() => setLoading(false));
  }, [id]);

  async function save(status: "needs_review" | "approved") {
    if (!form) return;
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const saved = await updateInvoice(id, { ...form, status });
      setInvoice(saved);
      setForm(makeForm(saved));
      setNotice(
        status === "approved" ? "Invoice approved." : "Corrections saved for further review.",
      );
    } catch (caught) {
      const suffix =
        caught instanceof ApiError && caught.details
          ? " Check the highlighted values and arithmetic."
          : "";
      setError((caught instanceof Error ? caught.message : "Changes could not be saved.") + suffix);
    } finally {
      setSaving(false);
    }
  }

  function setLine(index: number, patch: Partial<EditLine>) {
    if (!form) return;
    setForm({
      ...form,
      lineItems: form.lineItems.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    });
  }

  if (loading)
    return (
      <div aria-label="Loading invoice" className="space-y-4">
        <div className="h-10 w-72 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-96 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  if (!invoice || !form)
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
      >
        {error ?? "Invoice not found."}
      </div>
    );
  const uncertain = new Set(invoice.uncertainFields);
  const fieldClass = (field: string) => "input " + (uncertain.has(field) ? "input-uncertain" : "");

  return (
    <div>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={18} /> Back to records
      </Link>
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={invoice.status} />
            <ConfidenceBadge value={invoice.overallConfidence} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {invoice.vendorName ?? "Unidentified vendor"}
          </h1>
          <p className="mt-2 font-mono text-sm text-[var(--muted)]">{invoice.originalFileName}</p>
        </div>
        <a
          href={sourceUrl(invoice.id)}
          target="_blank"
          rel="noreferrer"
          className="button-secondary"
        >
          <ArrowSquareOut size={18} /> View source
        </a>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-5 flex gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
        >
          <WarningCircle size={19} className="shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
        >
          {notice}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="panel" aria-labelledby="invoice-fields">
            <h2 id="invoice-fields" className="panel-title">
              Invoice fields
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="field">
                <span>Vendor name</span>
                <input
                  className={fieldClass("vendorName")}
                  value={form.vendorName}
                  onChange={(event) => setForm({ ...form, vendorName: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Invoice number</span>
                <input
                  className={fieldClass("invoiceNumber")}
                  value={form.invoiceNumber}
                  onChange={(event) => setForm({ ...form, invoiceNumber: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Invoice date</span>
                <input
                  type="date"
                  className={fieldClass("invoiceDate")}
                  value={form.invoiceDate}
                  onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Currency</span>
                <input
                  maxLength={3}
                  className={fieldClass("currency")}
                  value={form.currency}
                  onChange={(event) =>
                    setForm({ ...form, currency: event.target.value.toUpperCase() })
                  }
                />
              </label>
              <label className="field">
                <span>Grand total</span>
                <input
                  inputMode="decimal"
                  className={fieldClass("grandTotal")}
                  value={form.grandTotal}
                  onChange={(event) => setForm({ ...form, grandTotal: event.target.value })}
                />
              </label>
            </div>
          </section>
          <section className="panel" aria-labelledby="line-items">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="line-items" className="panel-title mb-0">
                Line items
              </h2>
              <button
                type="button"
                className="button-secondary"
                onClick={() =>
                  setForm({
                    ...form,
                    lineItems: [
                      ...form.lineItems,
                      {
                        description: "",
                        quantity: "1",
                        unitPrice: "",
                        lineTotal: "",
                        position: form.lineItems.length,
                        manuallyCorrected: true,
                      },
                    ],
                  })
                }
              >
                <Plus size={17} /> Add item
              </button>
            </div>
            <div className="space-y-4">
              {form.lineItems.map((line, index) => (
                <div
                  key={line.id ?? "new-" + index}
                  className={
                    "rounded-xl border p-4 " +
                    (invoice.lineItems?.[index]?.needsReview
                      ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20"
                      : "border-[var(--border)]")
                  }
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-xs text-[var(--muted)]">Item {index + 1}</span>
                    <button
                      type="button"
                      className="icon-button text-red-700 dark:text-red-300"
                      aria-label={"Remove item " + (index + 1)}
                      onClick={() =>
                        setForm({
                          ...form,
                          lineItems: form.lineItems
                            .filter((_item, itemIndex) => itemIndex !== index)
                            .map((item, itemIndex) => ({ ...item, position: itemIndex })),
                        })
                      }
                    >
                      <Trash size={18} />
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(220px,2fr)_repeat(3,minmax(110px,1fr))]">
                    <label className="field">
                      <span>Description</span>
                      <input
                        className="input"
                        value={line.description}
                        onChange={(event) => setLine(index, { description: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Quantity</span>
                      <input
                        inputMode="decimal"
                        className="input"
                        value={line.quantity}
                        onChange={(event) => setLine(index, { quantity: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Unit price</span>
                      <input
                        inputMode="decimal"
                        className="input"
                        value={line.unitPrice}
                        onChange={(event) => setLine(index, { unitPrice: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Line total</span>
                      <input
                        inputMode="decimal"
                        className="input"
                        value={line.lineTotal}
                        onChange={(event) => setLine(index, { lineTotal: event.target.value })}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="button-secondary"
              disabled={saving}
              onClick={() => void save("needs_review")}
            >
              <FloppyDisk size={18} /> Save corrections
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={saving}
              onClick={() => void save("approved")}
            >
              {saving ? "Validating" : "Approve invoice"}
            </button>
          </div>
        </div>
        <aside className="space-y-6">
          <section className="panel">
            <h2 className="panel-title">Validation notes</h2>
            {invoice.validationIssues.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No deterministic validation issues remain.
              </p>
            ) : (
              <ul className="space-y-3">
                {invoice.validationIssues.map((issue, index) => (
                  <li key={issue.code + index} className="flex gap-2 text-sm">
                    <Warning
                      size={18}
                      className={
                        issue.severity === "error"
                          ? "shrink-0 text-red-600"
                          : "shrink-0 text-amber-600"
                      }
                    />
                    <span>
                      <strong className="block font-medium">{issue.field}</strong>
                      <span className="text-[var(--muted)]">{issue.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel">
            <h2 className="panel-title">Extraction evidence</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Source type</dt>
                <dd>{invoice.sourceType?.replace("_", " ") ?? "Pending"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Embedded characters</dt>
                <dd className="font-mono">
                  {String(invoice.extractionMetadata.extractedCharacterCount ?? "-")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Repair attempted</dt>
                <dd>{invoice.extractionMetadata.repairAttempted ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Manual fields</dt>
                <dd className="text-right">{invoice.manuallyCorrectedFields.length}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
