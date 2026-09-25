import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** When VITE_API_URL is empty, the browser talks to Vite and these proxies reach the API. */
const apiProxy = {
  "/api": {
    target: "http://localhost:3000",
    changeOrigin: true,
  },
  "/health": {
    target: "http://localhost:3000",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: apiProxy,
  },
  preview: {
    port: 5173,
    host: true,
    proxy: apiProxy,
  },
});
