import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./index.css";
import App from "./App.tsx";

// Las fuentes de Excalidraw se sirven desde public/excalidraw-assets
// (copiadas por scripts/copy-excalidraw-fonts.mjs).
window.EXCALIDRAW_ASSET_PATH = `${import.meta.env.BASE_URL}excalidraw-assets/`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
