import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

vi.stubGlobal(
  "fetch",
  vi.fn(
    async () =>
      new Response(JSON.stringify({ invoices: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  ),
);

describe("App", () => {
  it("renders the empty review workflow", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("No invoices yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop a document/i })).toBeInTheDocument();
  });
});
