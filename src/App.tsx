import { useCallback, useMemo } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { FONT_FAMILY } from "@excalidraw/excalidraw";
import {
  CANVAS_BACKGROUND,
  DEFAULT_FONT_SIZE,
  createPage,
  getPageFrames,
} from "./a4";

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

  const onApi = useCallback((api: ExcalidrawImperativeAPI) => {
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

  return (
    <div className="app">
      <Excalidraw initialData={initialData} excalidrawAPI={onApi} />
    </div>
  );
}
