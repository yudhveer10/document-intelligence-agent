import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MemoryInvoiceRepository } from "./testing/memoryRepository.js";

let directory: string;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-api-"));
});
afterAll(async () => fs.rm(directory, { recursive: true, force: true }));

describe("API", () => {
  it("reports service readiness", async () => {
    const app = createApp({
      config: loadConfig({ NODE_ENV: "test", UPLOAD_DIR: directory }),
      repository: new MemoryInvoiceRepository(),
    });
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body.status).toBe("degraded");
    expect(response.body.services.database).toBe(true);
  });

  it("uploads a supported document and lists its record", async () => {
    const repository = new MemoryInvoiceRepository();
    const app = createApp({
      config: loadConfig({ NODE_ENV: "test", UPLOAD_DIR: directory }),
      repository,
    });
    const upload = await request(app)
      .post("/api/documents")
      .attach("document", Buffer.from("%PDF-1.4 sample"), {
        filename: "vendor.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    expect(upload.body.status).toBe("uploaded");
    const list = await request(app).get("/api/invoices").expect(200);
    expect(list.body.invoices).toHaveLength(1);
  });

  it("rejects invalid correction arithmetic", async () => {
    const repository = new MemoryInvoiceRepository();
    const record = await repository.createUpload({
      id: "624b0758-907a-4bed-9d7b-b5e84598436b",
      originalFileName: "x.pdf",
      storedFileName: "x.pdf",
      mimeType: "application/pdf",
      rawSourceReference: "/source",
    });
    const app = createApp({
      config: loadConfig({ NODE_ENV: "test", UPLOAD_DIR: directory }),
      repository,
    });
    const response = await request(app)
      .patch("/api/invoices/" + record.id)
      .send({
        vendorName: "Copper Finch",
        invoiceNumber: "CF-1",
        invoiceDate: "2026-04-18",
        currency: "USD",
        grandTotal: "100.00",
        status: "approved",
        lineItems: [
          {
            description: "Design",
            quantity: "2",
            unitPrice: "25.00",
            lineTotal: "40.00",
            position: 0,
            manuallyCorrected: true,
          },
        ],
      })
      .expect(422);
    expect(response.body.error.code).toBe("correction_invalid");
  });
});
