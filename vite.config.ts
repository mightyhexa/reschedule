import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev the browser talks to /api on the same origin; Vite forwards it to the FastAPI server.
// That keeps cookies first-party and avoids CORS. In production put both behind one domain
// (site at /, API at /api) or set VITE_API_URL to the API's address.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    port: 5173,
    open: true,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false, rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
