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
  CANVAS_BACKGROUND,
  DEFAULT_FONT_SIZE,
  createPage,
  getPageFrames,
} from "./a4";
import { exportPagesToPdf } from "./pdf";
import { createAutosave, loadScene } from "./storage";

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
  const storageErrorShown = useRef(false);

  const [autosave] = useState(() =>
    createAutosave((error) => {
      console.error("No se pudo guardar en localStorage", error);
      if (!storageErrorShown.current) {
        storageErrorShown.current = true;
        apiRef.current?.setToast({
          message:
            "No se pudo guardar automáticamente (¿imágenes demasiado grandes?).",
          closable: true,
          duration: 8000,
        });
      }
    }),
  );

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
        viewBackgroundColor: CANVAS_BACKGROUND,
        // Estilo limpio, no "dibujado a mano".
        currentItemRoughness: 0,
        currentItemStrokeColor: "#000000",
        currentItemBackgroundColor: "transparent",
        currentItemFontFamily: FONT_FAMILY.Nunito,
        currentItemFontSize: DEFAULT_FONT_SIZE,
        currentItemTextAlign: "left",
        currentItemRoundness: "sharp",
        frameRendering: { enabled: true, clip: true, name: false, outline: false },
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

  const onApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    if (import.meta.env.DEV) {
      // Facilita la depuración desde la consola del navegador.
      (window as unknown as { excalidrawAPI: unknown }).excalidrawAPI = api;
    }
    // Esperar a que la escena inicial esté montada antes de centrar la hoja.
    requestAnimationFrame(() => {
      const [firstPage] = getPageFrames(api.getSceneElements());
      if (firstPage) {
        api.scrollToContent(firstPage, {
          fitToViewport: true,
          viewportZoomFactor: 0.95,
          // Dejar libre el espacio de la barra superior y del pie.
          canvasOffsets: { top: 72, bottom: 64, left: 16, right: 16 },
        });
      }
    });
  }, []);

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

  const renderTopRightUI = useCallback(
    () => (
      <div className="a4-actions">
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
    [exporting, handleExportPdf],
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
      />
    </div>
  );
}
