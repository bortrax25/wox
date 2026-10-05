import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, FONT_FAMILY } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  UIOptions,
} from "@excalidraw/excalidraw/types";
import {
  DEFAULT_FONT_SIZE,
  addPage,
  createPage,
  getPageFrames,
  protectPages,
  scrollToPage,
} from "./a4";
import { exportPagesToPdf, type PdfMode } from "./pdf";
import { createAutosave, loadScene } from "./storage";
import { loadTheme, saveTheme, type Theme } from "./theme";

const UI_OPTIONS: UIOptions = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveAsImage: false,
    saveToActiveFile: false,
    toggleTheme: false,
  },
  tools: { image: true },
};

/** Herramientas visibles en la barra; los atajos a otras se ignoran. */
const ALLOWED_TOOLS = new Set<string>(["selection", "hand", "text", "image"]);

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [autosave] = useState(createAutosave);

  const initialData = useMemo<ExcalidrawInitialDataState>(() => {
    const saved = loadScene();
    const savedElements = saved?.elements ?? [];
    const elements =
      getPageFrames(savedElements).length > 0
        ? savedElements
        : [...savedElements, ...createPage()];
    if (saved) {
      autosave.markFilesSaved(saved.files);
    }
    return {
      elements,
      files: saved?.files,
      appState: {
        // Lienzo transparente: el color alrededor de la hoja lo pone el CSS
        // de cada tema (index.css), sin pasar por el filtro del modo oscuro.
        viewBackgroundColor: "transparent",
        // Estilo limpio, no "dibujado a mano".
        currentItemRoughness: 0,
        currentItemStrokeColor: "#000000",
        currentItemBackgroundColor: "transparent",
        // Liberation Sans: incluida en Excalidraw, mismas métricas que Arial.
        currentItemFontFamily: FONT_FAMILY["Liberation Sans"],
        currentItemFontSize: DEFAULT_FONT_SIZE,
        currentItemTextAlign: "left",
        currentItemRoundness: "sharp",
        frameRendering: {
          enabled: true,
          clip: true,
          name: false,
          outline: false,
        },
        ...saved?.appState,
      },
      scrollToContent: false,
    };
  }, [autosave]);

  // Guardar lo pendiente al cerrar o recargar la pestaña.
  useEffect(() => {
    const flush = () => autosave.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autosave]);

  const onApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api;
      let storageErrorShown = false;
      autosave.setErrorHandler((error) => {
        console.error("No se pudo guardar en localStorage", error);
        if (!storageErrorShown) {
          storageErrorShown = true;
          api.setToast({
            message:
              "No se pudo guardar automáticamente (¿imágenes demasiado grandes?).",
            closable: true,
            duration: 8000,
          });
        }
      });
      if (import.meta.env.DEV) {
        // Facilita la depuración desde la consola del navegador.
        Object.assign(window, {
          excalidrawAPI: api,
          exportPdf: (mode: PdfMode) =>
            exportPagesToPdf(api, "documento.pdf", mode),
        });
      }
      // Esperar a que la escena inicial esté montada antes de centrar la hoja.
      requestAnimationFrame(() => {
        const [firstPage] = getPageFrames(api.getSceneElements());
        if (firstPage) {
          scrollToPage(api, firstPage);
        }
      });
    },
    [autosave],
  );

  const [exporting, setExporting] = useState(false);

  const handleExportPdf = useCallback(async () => {
    const api = apiRef.current;
    if (!api || exporting) {
      return;
    }
    setExporting(true);
    try {
      await exportPagesToPdf(api);
    } catch (error) {
      console.error(error);
      api.setToast({ message: "No se pudo generar el PDF.", closable: true });
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  const renderTopRightUI = useCallback(
    () => (
      <div className="a4-actions">
        <button
          type="button"
          className="a4-button a4-button--icon"
          onClick={toggleTheme}
          title={
            theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
          }
          aria-label={
            theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
          }
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          className="a4-button"
          onClick={() => apiRef.current && addPage(apiRef.current)}
          title="Agregar una hoja A4 debajo de la última"
        >
          + Hoja
        </button>
        <button
          type="button"
          className="a4-button a4-button--primary"
          onClick={handleExportPdf}
          disabled={exporting}
          title="Descargar la hoja como PDF"
        >
          {exporting ? "Generando…" : "PDF"}
        </button>
      </div>
    ),
    [exporting, handleExportPdf, theme, toggleTheme],
  );

  const onChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      if (!ALLOWED_TOOLS.has(appState.activeTool.type)) {
        apiRef.current?.setActiveTool({ type: "selection" });
      }
      if (apiRef.current) {
        protectPages(apiRef.current, elements, appState);
      }
      autosave.save(elements, appState, files);
    },
    [autosave],
  );

  return (
    <div className="app">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={onApi}
        onChange={onChange}
        UIOptions={UI_OPTIONS}
        renderTopRightUI={renderTopRightUI}
        langCode="es-ES"
        theme={theme}
      />
    </div>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function MoonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
