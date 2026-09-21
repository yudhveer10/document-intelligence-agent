import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Files, WarningCircle } from "@phosphor-icons/react";
import { Link, useNavigate } from "react-router-dom";
import type { InvoiceRecord } from "@invoice/shared";
import { listInvoices } from "../api.js";
import { ConfidenceBadge, StatusBadge } from "../components/Badge.js";
import { UploadPanel } from "../components/UploadPanel.js";

function currency(value: string | null, code: string | null) {
  if (!value) return "Not extracted";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: code ?? "USD" }).format(
    numeric,
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setInvoices(await listInvoices());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invoices could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0" aria-labelledby="records-heading">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 id="records-heading" className="text-3xl font-semibold tracking-tight">
              Invoice records
            </h1>
            <p className="mt-2 text-[var(--muted)]">
              Review low-confidence extractions before approval.
            </p>
          </div>
          <span className="font-mono text-sm text-[var(--muted)]">{invoices.length} records</span>
        </div>
        {error && (
          <div
            role="alert"
            className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          >
            <WarningCircle className="shrink-0" size={20} />
            {error}
          </div>
        )}
        {loading ? (
          <div aria-label="Loading invoices" className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-20 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="grid min-h-72 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <div>
              <Files size={36} className="mx-auto mb-3 text-[var(--muted)]" />
              <h2 className="font-semibold">No invoices yet</h2>
              <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
                Upload one of the generated samples or a vendor invoice to create the first record.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--subtle)] text-xs text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="w-12">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--subtle)]"
                  >
                    <td className="px-4 py-4 font-medium">
                      {invoice.vendorName ?? "Pending extraction"}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">{invoice.invoiceNumber ?? "-"}</td>
                    <td className="px-4 py-4">{invoice.invoiceDate ?? "-"}</td>
                    <td className="px-4 py-4 text-right font-mono">
                      {currency(invoice.grandTotal, invoice.currency)}
                    </td>
                    <td className="px-4 py-4">
                      <ConfidenceBadge value={invoice.overallConfidence} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        className="grid size-8 place-items-center rounded-md hover:bg-[var(--border)] focus-visible:outline-2 focus-visible:outline-emerald-600"
                        to={"/invoices/" + invoice.id}
                        aria-label={"Review " + (invoice.invoiceNumber ?? "invoice")}
                      >
                        <ArrowRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <UploadPanel
          onComplete={(id) => {
            void load();
            navigate("/invoices/" + id);
          }}
        />
      </aside>
    </div>
  );
}
