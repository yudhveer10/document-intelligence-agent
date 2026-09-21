import type { InvoiceStatus } from "@invoice/shared";

const statusStyles: Record<InvoiceStatus, string> = {
  uploaded: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  extracted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  needs_review: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={
        "inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold " +
        statusStyles[status]
      }
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function ConfidenceBadge({ value }: { value: number }) {
  const style =
    value >= 0.82
      ? "text-emerald-700 dark:text-emerald-300"
      : value >= 0.65
        ? "text-amber-700 dark:text-amber-300"
        : "text-red-700 dark:text-red-300";
  return (
    <span className={"font-mono text-sm font-semibold tabular-nums " + style}>
      {Math.round(value * 100)}%
    </span>
  );
}
