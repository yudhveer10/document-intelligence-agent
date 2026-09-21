import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { InvoicePage } from "./pages/InvoicePage.js";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="invoices/:id" element={<InvoicePage />} />
        <Route
          path="*"
          element={
            <div className="panel">
              <h1 className="text-xl font-semibold">Page not found</h1>
              <p className="mt-2 text-[var(--muted)]">Return to the invoice records to continue.</p>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
