import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Vite 6 rechaza peticiones con un Host desconocido por defecto — sin
    // esto, un túnel de ngrok (u otro dominio externo) recibe "This host is
    // not allowed" en vez de la página. Solo afecta al servidor de
    // desarrollo, nunca al build de producción.
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
