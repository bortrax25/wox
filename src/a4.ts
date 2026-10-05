import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  ExcalidrawFrameElement,
  NonDeleted,
} from "@excalidraw/excalidraw/element/types";

/** A4 a 96 ppp: 210 × 297 mm. */
export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;
/** Separación vertical entre hojas (fase de varias páginas). */
export const PAGE_GAP = 40;

/** 16 px a 96 ppp = 12 pt. */
export const DEFAULT_FONT_SIZE = 16;

/** Color del lienzo alrededor de la hoja. */
export const CANVAS_BACKGROUND = "#e9ecef";

type A4Role = "page-frame" | "page-background";

const roleOf = (el: ExcalidrawElement): A4Role | undefined =>
  el.customData?.a4 as A4Role | undefined;

export const isPageFrame = (
  el: ExcalidrawElement,
): el is ExcalidrawFrameElement =>
  el.type === "frame" && roleOf(el) === "page-frame";

export const isPageBackground = (el: ExcalidrawElement) =>
  roleOf(el) === "page-background";

/** Frames de hoja no borrados, ordenados de arriba a abajo. */
export const getPageFrames = (
  elements: readonly ExcalidrawElement[],
): NonDeleted<ExcalidrawFrameElement>[] =>
  elements
    .filter(
      (el): el is NonDeleted<ExcalidrawFrameElement> =>
        !el.isDeleted && isPageFrame(el),
    )
    .sort((a, b) => a.y - b.y);

/**
 * Crea una hoja A4: un frame (que recorta y define lo que se exporta) con un
 * rectángulo blanco de fondo. Ambos bloqueados para que no se puedan
 * seleccionar ni mover por accidente.
 */
export const createPage = (y = 0, x = 0) => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const frameId = `a4-frame-${suffix}`;
  const backgroundId = `a4-bg-${suffix}`;

  const elements = convertToExcalidrawElements(
    [
      {
        type: "rectangle",
        id: backgroundId,
        x,
        y,
        width: A4_WIDTH,
        height: A4_HEIGHT,
        backgroundColor: "#ffffff",
        fillStyle: "solid",
        strokeColor: "transparent",
        strokeWidth: 1,
        roughness: 0,
        roundness: null,
        locked: true,
        customData: { a4: "page-background" },
      },
      {
        type: "frame",
        id: frameId,
        children: [backgroundId],
        x,
        y,
        width: A4_WIDTH,
        height: A4_HEIGHT,
        name: "A4",
        locked: true,
        customData: { a4: "page-frame" },
      },
    ],
    { regenerateIds: false },
  );
  // convertToExcalidrawElements ajusta el frame a sus hijos con un margen;
  // lo devolvemos al tamaño exacto de la hoja.
  return elements.map((el) =>
    el.id === frameId
      ? { ...el, x, y, width: A4_WIDTH, height: A4_HEIGHT }
      : el,
  );
};
