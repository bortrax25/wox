import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  // Rutas relativas: el build funciona servido desde cualquier subcarpeta
  // (p. ej. GitHub Pages en /wox/).
  base: "./",
  plugins: [
    react(),
    // App instalable (Dock del Mac, pantalla de inicio del móvil) y que
    // funciona sin conexión: un service worker guarda todos los archivos.
    VitePWA({
      registerType: "autoUpdate",
      // Se registra a mano en main.tsx (no dentro del visor de claude.ai).
      injectRegister: null,
      manifest: {
        name: "Wox",
        short_name: "Wox",
        description:
          "Hoja A4 para colocar texto e imágenes libremente y descargarla en PDF.",
        lang: "es",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#1f1f1f",
        theme_color: "#1f1f1f",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,ttf,svg,png}"],
        // El núcleo de Excalidraw pesa ~1,8 MB.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  define: {
    // Recomendado por la documentación de @excalidraw/excalidraw para Vite.
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
});
