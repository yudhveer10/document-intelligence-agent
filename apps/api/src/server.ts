import path from "node:path";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { GeminiLlmProvider } from "./llm.js";
import { SupabaseInvoiceRepository } from "./repository.js";

dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env") });
const config = loadConfig();
const repository =
  config.supabaseUrl && config.supabaseServiceRoleKey
    ? new SupabaseInvoiceRepository(config.supabaseUrl, config.supabaseServiceRoleKey)
    : undefined;
const provider = config.geminiApiKey
  ? new GeminiLlmProvider(config.geminiApiKey, config.geminiModel)
  : undefined;
const app = createApp({
  config,
  ...(repository ? { repository } : {}),
  ...(provider ? { provider } : {}),
});

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "API listening",
      port: config.port,
      databaseConfigured: Boolean(repository),
      geminiConfigured: Boolean(provider),
    }),
  );
});
