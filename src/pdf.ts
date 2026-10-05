import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { jsPDF } from "jspdf";
import { getPageFrames } from "./a4";

/** Resolución del PNG respecto a 96 ppp (3 → 288 ppp). */
const EXPORT_SCALE = 3;

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Exporta cada hoja A4 (frame) como una página del PDF, en orden vertical.
 * Solo se incluye lo que está dentro de cada hoja.
 */
export async function exportPagesToPdf(
  api: ExcalidrawImperativeAPI,
  fileName = "documento.pdf",
) {
  const elements = api.getSceneElements();
  const frames = getPageFrames(elements);
  if (frames.length === 0) {
    throw new Error("No hay ninguna hoja A4 para exportar.");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (const [index, frame] of frames.entries()) {
    const blob = await exportToBlob({
      elements,
      files: api.getFiles(),
      exportingFrame: frame,
      mimeType: "image/png",
      appState: {
        exportBackground: true,
        viewBackgroundColor: "#ffffff",
        exportWithDarkMode: false,
      },
      getDimensions: (width: number, height: number) => ({
        width: width * EXPORT_SCALE,
        height: height * EXPORT_SCALE,
        scale: EXPORT_SCALE,
      }),
    });
    if (index > 0) {
      pdf.addPage("a4", "portrait");
    }
    pdf.addImage(
      await blobToDataURL(blob),
      "PNG",
      0,
      0,
      pageWidth,
      pageHeight,
      undefined,
      "FAST",
    );
  }

  pdf.save(fileName);
}
