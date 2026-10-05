import { getNonDeletedElements } from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  FileId,
} from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

const KEYS = {
  elements: "wox:elements",
  files: "wox:files",
  appState: "wox:appState",
} as const;

const SAVE_DELAY_MS = 500;

/**
 * El proyecto se llamaba "Editor A4" y guardaba con el prefijo "editor-a4:".
 * Copia esos datos a "wox:" (sin pisar nada) para no perder documentos.
 */
export function migrateLegacyStorage() {
  try {
    for (const name of ["elements", "files", "appState", "theme", "mode"]) {
      const legacy = localStorage.getItem(`editor-a4:${name}`);
      if (legacy !== null && localStorage.getItem(`wox:${name}`) === null) {
        localStorage.setItem(`wox:${name}`, legacy);
      }
      localStorage.removeItem(`editor-a4:${name}`);
    }
  } catch (error) {
    console.warn("No se pudieron migrar los datos guardados", error);
  }
}

/** Preferencias del usuario que vale la pena conservar entre sesiones. */
type SavedAppState = Pick<
  AppState,
  "currentItemFontSize" | "currentItemTextAlign"
>;

export type SavedScene = {
  elements: ExcalidrawElement[];
  files: BinaryFiles;
  appState: Partial<SavedAppState>;
};

const readJSON = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn(`No se pudo leer ${key} de localStorage`, error);
    return null;
  }
};

export function loadScene(): SavedScene | null {
  const elements = readJSON<ExcalidrawElement[]>(KEYS.elements);
  if (!elements?.length) {
    return null;
  }
  return {
    elements,
    files: readJSON<BinaryFiles>(KEYS.files) ?? {},
    appState: readJSON<Partial<SavedAppState>>(KEYS.appState) ?? {},
  };
}

/**
 * Guarda la escena en localStorage con debounce. Los archivos binarios
 * (imágenes en dataURL) solo se reescriben cuando cambia el conjunto de
 * imágenes usadas, porque son lo más pesado.
 */
export function createAutosave() {
  let onError: (error: unknown) => void = (error) =>
    console.error("No se pudo guardar en localStorage", error);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;
  let lastFilesKey = "";

  const write = (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    try {
      const liveElements = getNonDeletedElements(elements);
      localStorage.setItem(KEYS.elements, JSON.stringify(liveElements));

      const usedFileIds = new Set<FileId>();
      for (const el of liveElements) {
        if (el.type === "image" && el.fileId && files[el.fileId]) {
          usedFileIds.add(el.fileId);
        }
      }
      const filesKey = [...usedFileIds].sort().join(",");
      if (filesKey !== lastFilesKey) {
        const usedFiles: BinaryFiles = {};
        for (const id of usedFileIds) {
          usedFiles[id] = files[id];
        }
        localStorage.setItem(KEYS.files, JSON.stringify(usedFiles));
        lastFilesKey = filesKey;
      }

      const saved: SavedAppState = {
        currentItemFontSize: appState.currentItemFontSize,
        currentItemTextAlign: appState.currentItemTextAlign,
      };
      localStorage.setItem(KEYS.appState, JSON.stringify(saved));
    } catch (error) {
      // Normalmente QuotaExceededError por imágenes grandes.
      onError(error);
    }
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const run = pending;
    pending = null;
    run?.();
  };

  const save = (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    pending = () => write(elements, appState, files);
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, SAVE_DELAY_MS);
  };

  /** Archivos ya guardados al cargar: evita reescribirlos sin cambios. */
  const markFilesSaved = (files: BinaryFiles) => {
    lastFilesKey = Object.keys(files).sort().join(",");
  };

  const setErrorHandler = (handler: (error: unknown) => void) => {
    onError = handler;
  };

  return { save, flush, markFilesSaved, setErrorHandler };
}
