import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: "../..",
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
