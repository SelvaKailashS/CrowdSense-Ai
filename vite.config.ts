import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    postcss: {
      plugins: [],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "next/link": path.resolve(__dirname, "src/shim/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "src/shim/next-navigation.ts"),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
