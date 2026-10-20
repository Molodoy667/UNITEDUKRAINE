import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": root } },
  server: { host: "0.0.0.0", port: 5173, proxy: { "/api": "http://127.0.0.1:4174", "/online.json": "http://127.0.0.1:4174", "/Project/info.json": "http://127.0.0.1:4174" } },
  build: { outDir: "dist" },
});
