import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./index.css";
import App from "./App.tsx";
import { loadMode } from "./mode";
import { migrateLegacyStorage } from "./storage";
import { loadTheme } from "./theme";

migrateLegacyStorage();

// Aplicar el tema antes del primer pintado para evitar un parpadeo.
document.documentElement.dataset.theme = loadTheme();
document.documentElement.dataset.mode = String(loadMode());

// Las fuentes de Excalidraw se sirven desde public/excalidraw-assets
// (copiadas por scripts/copy-excalidraw-fonts.mjs). URL absoluta: Excalidraw
// resolvería una ruta relativa contra la raíz del dominio, no contra la página.
window.EXCALIDRAW_ASSET_PATH = new URL(
  `${import.meta.env.BASE_URL}excalidraw-assets/`,
  document.baseURI,
).href;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Sin conexión: el service worker guarda la app tras la primera visita y se
// actualiza solo. No dentro del visor de claude.ai, que no lo permite.
if (import.meta.env.PROD && "serviceWorker" in navigator && !window.claude) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("No se pudo activar el modo sin conexión", error);
    });
  });
}
