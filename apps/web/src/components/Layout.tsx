import { FileText, ShieldCheck } from "@phosphor-icons/react";
import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="min-h-[100dvh] bg-[var(--canvas)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-3 font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-700 text-white">
              <FileText size={20} weight="duotone" />
            </span>
            <span>Invoice Review Desk</span>
          </Link>
          <div className="hidden items-center gap-2 text-sm text-[var(--muted)] sm:flex">
            <ShieldCheck size={18} /> Human verification required
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
