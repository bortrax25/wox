import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawFrameElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { jsPDF } from "jspdf";
import "svg2pdf.js";
import { getPageFrames } from "./a4";

/** Resolución del PNG respecto a 96 ppp (3 → 288 ppp). */
const EXPORT_SCALE = 3;

const FONT_FILE = "LiberationSans-Regular.ttf";
const FONT_URL = `${import.meta.env.BASE_URL}excalidraw-assets/fonts/Liberation/${FONT_FILE}`;

export type PdfMode = "vector" | "raster";

type PageRenderer = (
  pdf: jsPDF,
  api: ExcalidrawImperativeAPI,
  frame: ExcalidrawFrameElement,
) => Promise<void>;

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const exportAppState = {
  exportBackground: true,
  viewBackgroundColor: "#ffffff",
  exportWithDarkMode: false,
};

/** Fase 1: la hoja como PNG a escala 3. Fiable, pero el texto no es seleccionable. */
const renderRasterPage: PageRenderer = async (pdf, api, frame) => {
  const blob = await exportToBlob({
    elements: api.getSceneElements(),
    files: api.getFiles(),
    exportingFrame: frame,
    mimeType: "image/png",
    appState: exportAppState,
    getDimensions: (width: number, height: number) => ({
      width: width * EXPORT_SCALE,
      height: height * EXPORT_SCALE,
      scale: EXPORT_SCALE,
    }),
  });
  const { pageSize } = pdf.internal;
  pdf.addImage(
    await blobToDataURL(blob),
    "PNG",
    0,
    0,
    pageSize.getWidth(),
    pageSize.getHeight(),
    undefined,
    "FAST",
  );
};

/**
 * Excalidraw dibuja cada imagen como <use href="#image-…"> apuntando a un
 * <symbol> con un <image width="100%">; svg2pdf no resuelve bien ese caso y
 * deforma la imagen. Se sustituye cada <use> por la imagen directamente.
 */
const inlineImageSymbols = (svg: SVGSVGElement) => {
  for (const use of Array.from(svg.querySelectorAll("use"))) {
    const ref = use.getAttribute("href") ?? use.getAttribute("xlink:href");
    const image = ref?.startsWith("#")
      ? svg.querySelector(`symbol[id="${CSS.escape(ref.slice(1))}"] > image`)
      : null;
    if (!image) {
      continue;
    }
    const replacement = image.cloneNode(true) as SVGImageElement;
    // "100%" = tamaño del <use>; si no, el <image> trae su tamaño explícito.
    for (const dim of ["width", "height"]) {
      if (replacement.getAttribute(dim)?.endsWith("%")) {
        replacement.setAttribute(dim, use.getAttribute(dim) ?? "0");
      }
    }
    for (const attr of ["x", "y", "opacity", "transform"]) {
      const value = use.getAttribute(attr);
      if (value !== null) {
        replacement.setAttribute(attr, value);
      }
    }
    use.replaceWith(replacement);
  }
};

/** Caracteres cubiertos por Liberation Sans (latín, griego, cirílico, signos). */
const SUPPORTED_TEXT = /^[\s -\u052F-\u206F\u20A0-\u20BF\u2100-\u214F]*$/;

/**
 * El PDF vectorial solo es fiel si la página usa lo que jsPDF/svg2pdf saben
 * dibujar: texto en Liberation Sans con caracteres que la fuente cubre y sin
 * máscaras (las usan las imágenes recortadas). Si no, esa página va en PNG.
 */
const canRenderAsVector = (svg: SVGSVGElement) => {
  if (svg.querySelector("mask")) {
    return false;
  }
  return Array.from(svg.querySelectorAll("text")).every(
    (text) =>
      (text.getAttribute("font-family") ?? "").startsWith("Liberation Sans") &&
      SUPPORTED_TEXT.test(text.textContent ?? ""),
  );
};

/** Fase 2: SVG → PDF vectorial; el texto queda seleccionable y nítido. */
const renderVectorPage: PageRenderer = async (pdf, api, frame) => {
  const svg = await exportToSvg({
    elements: api.getSceneElements(),
    files: api.getFiles(),
    exportingFrame: frame,
    appState: exportAppState,
    // jsPDF no usa las @font-face del SVG; la fuente se registra aparte.
    skipInliningFonts: true,
  });
  if (!canRenderAsVector(svg)) {
    return renderRasterPage(pdf, api, frame);
  }
  inlineImageSymbols(svg);
  // svg2pdf necesita estilos calculados: el SVG debe estar en el documento.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden";
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    const { pageSize } = pdf.internal;
    await pdf.svg(svg, {
      x: 0,
      y: 0,
      width: pageSize.getWidth(),
      height: pageSize.getHeight(),
    });
  } finally {
    host.remove();
  }
};

let fontBase64: Promise<string> | null = null;

const loadFontBase64 = () => {
  fontBase64 ??= fetch(FONT_URL)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`No se pudo cargar ${FONT_URL} (${res.status})`);
      }
      return res.blob();
    })
    .then(blobToDataURL)
    .then((dataUrl) => dataUrl.slice(dataUrl.indexOf(",") + 1))
    .catch((error) => {
      fontBase64 = null;
      throw error;
    });
  return fontBase64;
};

async function buildPdf(api: ExcalidrawImperativeAPI, mode: PdfMode) {
  const frames = getPageFrames(api.getSceneElements());
  if (frames.length === 0) {
    throw new Error("No hay ninguna hoja A4 para exportar.");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  if (mode === "vector") {
    // Mismo nombre de familia que usa Excalidraw en el SVG.
    pdf.addFileToVFS(FONT_FILE, await loadFontBase64());
    pdf.addFont(FONT_FILE, "Liberation Sans", "normal");
  }
  const renderPage = mode === "vector" ? renderVectorPage : renderRasterPage;

  for (const [index, frame] of frames.entries()) {
    if (index > 0) {
      pdf.addPage("a4", "portrait");
    }
    await renderPage(pdf, api, frame);
  }
  return pdf;
}

/**
 * Exporta cada hoja A4 (frame) como una página del PDF, en orden vertical.
 * Solo se incluye lo que está dentro de cada hoja. Intenta el PDF vectorial
 * y, si falla, recurre a la versión en imagen.
 */
export async function exportPagesToPdf(
  api: ExcalidrawImperativeAPI,
  fileName = "documento.pdf",
  mode: PdfMode = "vector",
) {
  let pdf: jsPDF;
  try {
    pdf = await buildPdf(api, mode);
  } catch (error) {
    if (mode === "raster") {
      throw error;
    }
    console.warn("PDF vectorial falló; se usa la versión en imagen.", error);
    pdf = await buildPdf(api, "raster");
  }
  await savePdf(pdf, fileName);
}

/**
 * Dentro del visor de artefactos de claude.ai las descargas directas están
 * bloqueadas; allí el archivo se ofrece con su capacidad "downloads". Se
 * pide al cargar porque puede tardar en responder.
 */
type DownloadsCapability = {
  save: (request: { filename: string; data: Blob }) => Promise<unknown>;
};

const downloadsCapability = (
  window.claude?.use("downloads") ?? Promise.resolve(null)
).catch(() => null) as Promise<DownloadsCapability | null>;

async function savePdf(pdf: jsPDF, fileName: string) {
  const downloads = await downloadsCapability;
  if (!downloads) {
    pdf.save(fileName);
    return;
  }
  try {
    await downloads.save({ filename: fileName, data: pdf.output("blob") });
  } catch (error) {
    // "declined": la persona canceló el diálogo; no es un error.
    if ((error as { code?: string })?.code !== "declined") {
      throw error;
    }
  }
}
