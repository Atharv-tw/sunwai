import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("./frontend", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8765", changeOrigin: true } } },
  build: {
    outDir: "../web",
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, "index.html") },
  },
});
