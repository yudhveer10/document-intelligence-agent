import { useRef, useState } from "react";
import { FileArrowUp, WarningCircle } from "@phosphor-icons/react";
import { extractDocument, uploadDocument } from "../api.js";

interface Props {
  onComplete: (id: string) => void;
}

export function UploadPanel({ onComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "extracting">("idle");
  const [error, setError] = useState<string | null>(null);

  async function process(file: File) {
    setError(null);
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose a file no larger than 10 MB.");
      return;
    }
    if (!/\.(pdf|xlsx|xls)$/i.test(file.name)) {
      setError("Choose a PDF, XLSX, or XLS file.");
      return;
    }
    try {
      setPhase("uploading");
      const uploaded = await uploadDocument(file);
      setPhase("extracting");
      await extractDocument(uploaded.invoiceId);
      onComplete(uploaded.invoiceId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The document could not be processed.");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <section
      aria-labelledby="upload-heading"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
    >
      <div className="mb-4">
        <h2 id="upload-heading" className="text-lg font-semibold">
          Add an invoice
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          PDF, XLSX, or XLS. Maximum 10 MB. Extraction starts after upload.
        </p>
      </div>
      <button
        type="button"
        className={
          "flex min-h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600 " +
          (dragging
            ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
            : "border-[var(--border-strong)] bg-[var(--canvas)] hover:border-emerald-600")
        }
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void process(file);
        }}
        disabled={phase !== "idle"}
      >
        <FileArrowUp size={32} className="mb-3 text-emerald-700 dark:text-emerald-400" />
        <span className="font-medium">
          {phase === "uploading"
            ? "Uploading document"
            : phase === "extracting"
              ? "Extracting and validating"
              : "Drop a document or choose a file"}
        </span>
        {phase !== "idle" && (
          <span className="mt-3 h-1.5 w-44 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <span className="block h-full w-2/3 animate-pulse rounded-full bg-emerald-600" />
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void process(file);
          event.target.value = "";
        }}
      />
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
        >
          <WarningCircle className="mt-0.5 shrink-0" size={18} />
          {error}
        </div>
      )}
    </section>
  );
}
