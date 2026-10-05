import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
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
import {
  MODE_FONT,
  applyMode,
  keepModeStyle,
  loadMode,
  saveMode,
  type DocMode,
} from "./mode";
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

/** Modo 1: el claro de siempre. Modo 2: oscuro, como el editor Zed. */
const MODES: { mode: DocMode; label: string; title: string }[] = [
  { mode: 1, label: "Modo 1", title: "Texto en Arial" },
  { mode: 2, label: "Modo 2", title: "Estilo del editor Zed (IBM Plex Mono)" },
];

/** Herramientas visibles en la barra; los atajos a otras se ignoran. */
const ALLOWED_TOOLS = new Set<string>(["selection", "hand", "text", "image"]);

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [mode, setMode] = useState<DocMode>(loadMode);
  // Modo vigente para onChange; "ready" cuando su fuente ya está cargada.
  const modeRef = useRef({ mode, ready: false });
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
        currentItemFontFamily: MODE_FONT[loadMode()],
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
        // En desarrollo (StrictMode) Excalidraw se monta dos veces: ignorar
        // la instancia que ya se desmontó.
        if (apiRef.current !== api) {
          return;
        }
        const [firstPage] = getPageFrames(api.getSceneElements());
        if (firstPage) {
          scrollToPage(api, firstPage);
        }
        // Cargar la fuente del modo y dejar todos los textos en su estilo.
        const startMode = modeRef.current.mode;
        applyMode(api, startMode)
          .then(() => {
            if (modeRef.current.mode === startMode) {
              modeRef.current = { mode: startMode, ready: true };
            }
          })
          .catch(console.error);
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

  useEffect(() => {
    document.documentElement.dataset.mode = String(mode);
    saveMode(mode);
  }, [mode]);

  const toggleTheme = useCallback(
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  const changeMode = useCallback(async (next: DocMode) => {
    setMode(next);
    modeRef.current = { mode: next, ready: false };
    const api = apiRef.current;
    if (!api) {
      return;
    }
    try {
      await applyMode(api, next);
      if (modeRef.current.mode === next) {
        modeRef.current = { mode: next, ready: true };
      }
    } catch (error) {
      console.error(error);
      api.setToast({
        message: "No se pudo cambiar la letra del documento.",
        closable: true,
      });
    }
  }, []);

  const renderTopRightUI = useCallback(
    () => (
      <div className="a4-actions">
        <button
          type="button"
          className="a4-button a4-button--icon"
          onClick={toggleTheme}
          title={theme === "dark" ? "Cambiar a día" : "Cambiar a noche"}
          aria-label={theme === "dark" ? "Cambiar a día" : "Cambiar a noche"}
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
        <div
          className="a4-modes"
          role="group"
          aria-label="Estilo del documento"
        >
          {MODES.map(({ mode: value, label, title }) => (
            <button
              key={value}
              type="button"
              className="a4-modes__option"
              aria-pressed={mode === value}
              onClick={() => changeMode(value)}
              title={title}
            >
              {label}
            </button>
          ))}
        </div>
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
    [exporting, handleExportPdf, theme, toggleTheme, mode, changeMode],
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
        if (modeRef.current.ready) {
          keepModeStyle(
            apiRef.current,
            modeRef.current.mode,
            elements,
            appState,
          );
        }
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
