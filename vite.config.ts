import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Recomendado por la documentación de @excalidraw/excalidraw para Vite.
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
});
