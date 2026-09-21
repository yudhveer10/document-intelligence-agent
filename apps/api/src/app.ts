import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type RequestHandler } from "express";
import multer from "multer";
import { idParameterSchema, invoiceCorrectionSchema } from "@invoice/shared";
import type { AppConfig } from "./config.js";
import { AppError, asyncHandler, errorHandler, notFoundHandler } from "./errors.js";
import { ExtractionService } from "./extraction.js";
import type { LlmProvider } from "./llm.js";
import type { InvoiceRepository } from "./repository.js";
import { validateCorrection } from "./validation.js";

interface AppDependencies {
  config: AppConfig;
  repository?: InvoiceRepository;
  provider?: LlmProvider;
}

const acceptedFiles: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ],
  ".xls": ["application/vnd.ms-excel", "application/octet-stream"],
};

async function hasValidSignature(filePath: string, extension: string): Promise<boolean> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, 8, 0);
    if (extension === ".pdf")
      return bytesRead >= 5 && header.subarray(0, 5).toString("ascii") === "%PDF-";
    if (extension === ".xlsx")
      return bytesRead >= 4 && header.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (extension === ".xls")
      return (
        bytesRead >= 8 &&
        header.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
      );
    return false;
  } finally {
    await handle.close();
  }
}

export function createApp({ config, repository, provider }: AppDependencies) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  const storage = multer.diskStorage({
    destination: config.uploadDir,
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, crypto.randomUUID() + extension);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: config.maxUploadBytes, files: 1 },
    fileFilter: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const allowedMimeTypes = acceptedFiles[extension];
      if (!allowedMimeTypes?.includes(file.mimetype)) {
        callback(
          new AppError(415, "unsupported_file", "Only PDF, XLSX, and XLS files are accepted"),
        );
        return;
      }
      callback(null, true);
    },
  });

  const requireRepository: RequestHandler = (_request, _response, next) => {
    if (!repository) {
      next(
        new AppError(
          503,
          "database_not_configured",
          "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        ),
      );
      return;
    }
    next();
  };

  app.get("/api/health", (_request, response) => {
    response.json({
      status: repository && provider ? "ok" : "degraded",
      services: { database: Boolean(repository), gemini: Boolean(provider) },
      version: "1.0.0",
    });
  });

  app.post(
    "/api/documents",
    requireRepository,
    upload.single("document"),
    asyncHandler(async (request, response) => {
      if (!request.file)
        throw new AppError(400, "file_required", "Attach a document using the document field");
      const id = crypto.randomUUID();
      try {
        if (
          !(await hasValidSignature(
            request.file.path,
            path.extname(request.file.originalname).toLowerCase(),
          ))
        ) {
          throw new AppError(
            415,
            "invalid_file_signature",
            "The file contents do not match its PDF or Excel extension",
          );
        }
        const invoice = await repository!.createUpload({
          id,
          originalFileName: path.basename(request.file.originalname),
          storedFileName: request.file.filename,
          mimeType: request.file.mimetype,
          rawSourceReference: "/api/documents/" + id + "/source",
        });
        response.status(201).json({ invoiceId: invoice.id, status: invoice.status });
      } catch (error) {
        await fs.promises.unlink(request.file.path).catch(() => undefined);
        throw error;
      }
    }),
  );

  app.post(
    "/api/documents/:id/extract",
    requireRepository,
    asyncHandler(async (request, response) => {
      const { id } = idParameterSchema.parse(request.params);
      if (!provider)
        throw new AppError(
          503,
          "llm_not_configured",
          "Gemini is not configured. Set GEMINI_API_KEY.",
        );
      const invoice = await new ExtractionService(repository!, provider, config.uploadDir).extract(
        id,
      );
      response.json({ invoice });
    }),
  );

  app.get(
    "/api/documents/:id/source",
    requireRepository,
    asyncHandler(async (request, response) => {
      const { id } = idParameterSchema.parse(request.params);
      const invoice = await repository!.getById(id);
      if (!invoice) throw new AppError(404, "invoice_not_found", "Invoice not found");
      const safeName = path.basename(invoice.storedFileName);
      const filePath = path.join(config.uploadDir, safeName);
      if (!fs.existsSync(filePath))
        throw new AppError(404, "source_not_found", "Source document is unavailable");
      response.setHeader(
        "Content-Disposition",
        "inline; filename*=UTF-8''" + encodeURIComponent(invoice.originalFileName),
      );
      response.type(invoice.mimeType).sendFile(filePath);
    }),
  );

  app.get(
    "/api/invoices",
    requireRepository,
    asyncHandler(async (_request, response) =>
      response.json({ invoices: await repository!.list() }),
    ),
  );

  app.get(
    "/api/invoices/:id",
    requireRepository,
    asyncHandler(async (request, response) => {
      const { id } = idParameterSchema.parse(request.params);
      const invoice = await repository!.getById(id);
      if (!invoice) throw new AppError(404, "invoice_not_found", "Invoice not found");
      response.json({ invoice });
    }),
  );

  app.patch(
    "/api/invoices/:id",
    requireRepository,
    asyncHandler(async (request, response) => {
      const { id } = idParameterSchema.parse(request.params);
      if (!(await repository!.getById(id)))
        throw new AppError(404, "invoice_not_found", "Invoice not found");
      const input = invoiceCorrectionSchema.parse(request.body);
      const checked = validateCorrection(input);
      if (checked.issues.length > 0)
        throw new AppError(
          422,
          "correction_invalid",
          "Corrections did not pass deterministic validation",
          { issues: checked.issues },
        );
      const invoice = await repository!.saveCorrection(id, checked.correction, []);
      response.json({ invoice });
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
