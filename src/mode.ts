import {
  CaptureUpdateAction,
  FONT_FAMILY,
  bumpVersion,
  restoreElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

/**
 * Estilo del documento:
 * - Modo 1: Liberation Sans (métricas de Arial).
 * - Modo 2: estilo del editor Zed, con IBM Plex Mono. Excalidraw no admite
 *   fuentes propias, así que se usa su familia "Cascadia" (oculta en la
 *   interfaz), que scripts/copy-excalidraw-fonts.mjs sirve con el archivo
 *   de IBM Plex Mono.
 * El modo claro/oscuro es independiente (theme.ts).
 */
export type DocMode = 1 | 2;

export const MODE_FONT: Record<DocMode, number> = {
  1: FONT_FAMILY["Liberation Sans"],
  2: FONT_FAMILY.Cascadia,
};

/**
 * Interlineado de cada modo: el de Liberation Sans en Excalidraw y el
 * "comfortable" de Zed (1.618).
 */
export const MODE_LINE_HEIGHT: Record<DocMode, number> = {
  1: 1.15,
  2: 1.618,
};

const KEY = "wox:mode";

export function loadMode(): DocMode {
  try {
    return localStorage.getItem(KEY) === "2" ? 2 : 1;
  } catch {
    return 1;
  }
}

export function saveMode(mode: DocMode) {
  try {
    localStorage.setItem(KEY, String(mode));
  } catch {
    // Sin persistencia: el modo dura solo esta sesión.
  }
}

/** Mide con la fuente real: hay que cargarla antes de recalcular textos. */
async function loadModeFont(mode: DocMode) {
  if (mode !== 2) {
    // Liberation Sans ya la carga Excalidraw al iniciar con el Modo 1.
    await document.fonts.load('16px "Liberation Sans"');
    return;
  }
  const url = new URL(
    "fonts/Cascadia/CascadiaCode-Regular.woff2",
    String(window.EXCALIDRAW_ASSET_PATH),
  );
  const face = new FontFace("Cascadia", `url(${url})`);
  document.fonts.add(await face.load());
}

type TextElement = Extract<ExcalidrawElement, { type: "text" }>;

const needsRestyle = (el: ExcalidrawElement, mode: DocMode) =>
  el.type === "text" &&
  !el.isDeleted &&
  (el.fontFamily !== MODE_FONT[mode] ||
    el.lineHeight !== MODE_LINE_HEIGHT[mode]);

/**
 * Pone la fuente e interlineado del modo en los textos que no los tengan y
 * recalcula su tamaño (y los saltos de línea de los párrafos de ancho fijo)
 * para que no se descuadren. La fuente debe estar ya cargada.
 */
function restyleTexts(
  api: ExcalidrawImperativeAPI,
  mode: DocMode,
  elements: readonly ExcalidrawElement[],
) {
  const changedIds = new Set<string>();
  const next = elements.map((el) => {
    if (!needsRestyle(el, mode)) {
      return el;
    }
    changedIds.add(el.id);
    return {
      ...el,
      fontFamily: MODE_FONT[mode],
      lineHeight: MODE_LINE_HEIGHT[mode] as TextElement["lineHeight"],
      // Partir de originalText para volver a calcular los saltos de línea.
      text: (el as TextElement).originalText,
    } as ExcalidrawElement;
  });
  if (!changedIds.size) {
    return false;
  }
  api.updateScene({
    elements: restoreElements(next, null, {
      refreshDimensions: true,
      repairBindings: true,
    }).map((el) => (changedIds.has(el.id) ? bumpVersion(el) : el)),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
}

/** Cambia el documento entero al modo indicado. */
export async function applyMode(api: ExcalidrawImperativeAPI, mode: DocMode) {
  await loadModeFont(mode);
  api.updateScene({
    appState: { currentItemFontFamily: MODE_FONT[mode] },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  if (restyleTexts(api, mode, api.getSceneElementsIncludingDeleted())) {
    // Deshacer después del cambio mezclaría textos de ambos modos.
    api.history.clear();
  }
}

/**
 * Excalidraw crea cada texto con el interlineado propio de la fuente; al
 * terminar de escribirlo se le aplica el del modo.
 */
export function keepModeStyle(
  api: ExcalidrawImperativeAPI,
  mode: DocMode,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
) {
  if (
    appState.editingTextElement ||
    !elements.some((el) => needsRestyle(el, mode))
  ) {
    return;
  }
  restyleTexts(api, mode, elements);
}
