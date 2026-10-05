import { useCallback, useMemo, useRef } from "react";
import { Excalidraw, FONT_FAMILY } from "@excalidraw/excalidraw";
import type {
  AppState,
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
  const initialData = useMemo<ExcalidrawInitialDataState>(
    () => ({
      elements: createPage(),
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
      },
      scrollToContent: false,
    }),
    [],
  );

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

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

  const onChange = useCallback(
    (_elements: unknown, appState: AppState) => {
      if (!ALLOWED_TOOLS.has(appState.activeTool.type)) {
        apiRef.current?.setActiveTool({ type: "selection" });
      }
    },
    [],
  );

  return (
    <div className="app">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={onApi}
        onChange={onChange}
        UIOptions={UI_OPTIONS}
        langCode="es-ES"
      />
    </div>
  );
}
