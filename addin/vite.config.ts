import fs from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Office yêu cầu HTTPS. Đặt PVTA_CERT và PVTA_KEY (chứng chỉ cục bộ, ví dụ tạo bằng office-addin-dev-certs).
const cert = process.env.PVTA_CERT;
const key = process.env.PVTA_KEY;

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 3000,
    https: cert && key ? { cert: fs.readFileSync(cert), key: fs.readFileSync(key) } : undefined,
  },
  build: { rollupOptions: { input: {main: "index.html", desktop: "desktop.html"} }, outDir: "dist", target: "es2020", sourcemap: false },
});
