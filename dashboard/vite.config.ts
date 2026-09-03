import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/admin/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      "/v1": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      "/health": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      "/ready": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    emptyOutDir: true,
  },
});
