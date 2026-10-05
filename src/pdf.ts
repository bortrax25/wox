import {
  FONT_FAMILY,
  exportToCanvas,
  exportToSvg,
} from "@excalidraw/excalidraw";
import type { ExcalidrawFrameElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { jsPDF } from "jspdf";
import "svg2pdf.js";
import { getPageFrames } from "./a4";
import type { Theme } from "./theme";

/** Resolución del PNG respecto a 96 ppp (3 → 288 ppp). */
const EXPORT_SCALE = 3;

/**
 * Fuentes que el PDF vectorial sabe embeber, con el nombre de familia que
 * Excalidraw pone en el SVG y los caracteres que cubre cada TTF.
 * "Cascadia" es la fuente del Modo 2, servida con IBM Plex Mono (mode.ts);
 * en el PDF se registra con su nombre real (pdfName).
 */
const PDF_FONTS = [
  {
    fontFamily: FONT_FAMILY["Liberation Sans"],
    family: "Liberation Sans",
    pdfName: "Liberation Sans",
    file: "Liberation/LiberationSans-Regular.ttf",
    // Latín, griego, cirílico y signos.
    covers: /^[\s\u0020-\u052F\u2000-\u206F\u20A0-\u20BF\u2100-\u214F]*$/,
  },
  {
    fontFamily: FONT_FAMILY.Cascadia,
    family: "Cascadia",
    pdfName: "IBM Plex Mono",
    file: "Cascadia/IBMPlexMono-Regular.ttf",
    // Latín y cirílico.
    covers: /^[\s\u0020-\u024F\u0400-\u04FF\u2000-\u206F\u20A0-\u20BF]*$/,
  },
];

const fontUrl = (file: string) =>
  `${import.meta.env.BASE_URL}excalidraw-assets/fonts/${file}`;

export type PdfMode = "vector" | "raster";

type PageRenderer = (
  pdf: jsPDF,
  api: ExcalidrawImperativeAPI,
  frame: ExcalidrawFrameElement,
  theme: Theme,
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

/*
 * Noche: el PDF reproduce la pantalla, que oscurece la hoja con el filtro
 * de index.css: invert(1) hue-rotate(180deg) contrast(0.7361)
 * brightness(0.9216), que lleva el blanco a #1f1f1f y el negro a #cccccc.
 */
const NIGHT_CONTRAST = 0.7361;
const NIGHT_BRIGHTNESS = 0.9216;

/** Aplica a un color el mismo filtro de noche que usa la pantalla. */
const nightColor = (hex: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return hex;
  }
  const [r, g, b] = [0, 2, 4].map(
    (i) => 1 - parseInt(match[1].slice(i, i + 2), 16) / 255,
  );
  // hue-rotate(180deg), matriz de la especificación de filtros CSS.
  const rotated = [
    -0.574 * r + 1.43 * g + 0.144 * b,
    0.426 * r + 0.43 * g + 0.144 * b,
    0.426 * r + 1.43 * g - 0.856 * b,
  ];
  return (
    "#" +
    rotated
      .map((v) => {
        const c =
          ((Math.min(1, Math.max(0, v)) - 0.5) * NIGHT_CONTRAST + 0.5) *
          NIGHT_BRIGHTNESS;
        return Math.round(Math.min(1, Math.max(0, c)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
};

/** Fase 1: la hoja como PNG a escala 3. Fiable, pero el texto no es seleccionable. */
const renderRasterPage: PageRenderer = async (pdf, api, frame, theme) => {
  const dark = theme === "dark";
  const exported = await exportToCanvas({
    elements: api.getSceneElements(),
    files: api.getFiles(),
    exportingFrame: frame,
    // De noche Excalidraw invierte la hoja (invert(93%) hue-rotate(180deg))
    // y deja las imágenes con sus colores; luego se ajustan los tonos.
    appState: { ...exportAppState, exportWithDarkMode: dark },
    getDimensions: (width: number, height: number) => ({
      width: width * EXPORT_SCALE,
      height: height * EXPORT_SCALE,
      scale: EXPORT_SCALE,
    }),
  });
  if (dark) {
    // Su modo oscuro deja el blanco en 17 y el negro en 237 (medido); este
    // ajuste lineal los lleva a #1f1f1f (31) y #cccccc (204), como en
    // pantalla.
    const ctx = exported.getContext("2d")!;
    const image = ctx.getImageData(0, 0, exported.width, exported.height);
    const scale = (204 - 31) / (237 - 17);
    const { data } = image;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 31 + (data[i] - 17) * scale;
      data[i + 1] = 31 + (data[i + 1] - 17) * scale;
      data[i + 2] = 31 + (data[i + 2] - 17) * scale;
    }
    ctx.putImageData(image, 0, 0);
  }
  const { pageSize } = pdf.internal;
  pdf.addImage(
    exported.toDataURL("image/png"),
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

/**
 * El PDF vectorial solo es fiel si la página usa lo que jsPDF/svg2pdf saben
 * dibujar: texto en una de PDF_FONTS con caracteres que esa fuente cubre y
 * sin máscaras (las usan las imágenes recortadas). Si no, esa página va en
 * PNG.
 */
const canRenderAsVector = (svg: SVGSVGElement) => {
  if (svg.querySelector("mask")) {
    return false;
  }
  return Array.from(svg.querySelectorAll("text")).every((text) => {
    const family = text.getAttribute("font-family") ?? "";
    const font = PDF_FONTS.find((f) => family.startsWith(f.family));
    return font?.covers.test(text.textContent ?? "") ?? false;
  });
};

/** Fase 2: SVG → PDF vectorial; el texto queda seleccionable y nítido. */
const renderVectorPage: PageRenderer = async (pdf, api, frame, theme) => {
  const svg = await exportToSvg({
    elements: api.getSceneElements(),
    files: api.getFiles(),
    exportingFrame: frame,
    appState: exportAppState,
    // jsPDF no usa las @font-face del SVG; la fuente se registra aparte.
    skipInliningFonts: true,
  });
  if (!canRenderAsVector(svg)) {
    return renderRasterPage(pdf, api, frame, theme);
  }
  inlineImageSymbols(svg);
  if (theme === "dark") {
    // Colores de la hoja y del texto como en pantalla; las imágenes quedan
    // con sus colores originales.
    svg.querySelectorAll("[fill], [stroke]").forEach((el: Element) => {
      for (const attr of ["fill", "stroke"]) {
        const value = el.getAttribute(attr);
        if (value) {
          el.setAttribute(attr, nightColor(value));
        }
      }
    });
  }
  svg.querySelectorAll("text").forEach((text: SVGTextElement) => {
    const family = text.getAttribute("font-family") ?? "";
    const font = PDF_FONTS.find((f) => family.startsWith(f.family));
    if (font) {
      text.setAttribute("font-family", font.pdfName);
    }
  });
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

const fontCache = new Map<string, Promise<string>>();

/** TTF en base64, como lo pide jsPDF. Se descarga una vez por sesión. */
const loadFontBase64 = (file: string) => {
  let font = fontCache.get(file);
  if (!font) {
    const url = fontUrl(file);
    font = fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`No se pudo cargar ${url} (${res.status})`);
        }
        return res.blob();
      })
      .then(blobToDataURL)
      .then((dataUrl) => dataUrl.slice(dataUrl.indexOf(",") + 1))
      .catch((error) => {
        fontCache.delete(file);
        throw error;
      });
    fontCache.set(file, font);
  }
  return font;
};

async function buildPdf(
  api: ExcalidrawImperativeAPI,
  mode: PdfMode,
  theme: Theme,
) {
  const frames = getPageFrames(api.getSceneElements());
  if (frames.length === 0) {
    throw new Error("No hay ninguna hoja A4 para exportar.");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  if (mode === "vector") {
    // Solo las fuentes que usa el documento (cada una se embebe entera).
    const used = new Set(
      api
        .getSceneElements()
        .flatMap((el) => (el.type === "text" ? [el.fontFamily] : [])),
    );
    for (const { fontFamily, pdfName, file } of PDF_FONTS) {
      if (!used.has(fontFamily)) {
        continue;
      }
      const name = file.split("/").pop()!;
      pdf.addFileToVFS(name, await loadFontBase64(file));
      pdf.addFont(name, pdfName, "normal");
    }
  }
  const renderPage = mode === "vector" ? renderVectorPage : renderRasterPage;

  for (const [index, frame] of frames.entries()) {
    if (index > 0) {
      pdf.addPage("a4", "portrait");
    }
    if (theme === "dark") {
      // Fondo de noche en toda la página, para que el redondeo en los
      // bordes no deje una línea clara.
      const { pageSize } = pdf.internal;
      pdf.setFillColor(31, 31, 31);
      pdf.rect(0, 0, pageSize.getWidth(), pageSize.getHeight(), "F");
    }
    await renderPage(pdf, api, frame, theme);
  }
  return pdf;
}

/**
 * Exporta cada hoja A4 (frame) como una página del PDF, en orden vertical.
 * Solo se incluye lo que está dentro de cada hoja, con el aspecto de la
 * pantalla (día o noche; la letra ya es la del modo). Intenta el PDF
 * vectorial y, si falla, recurre a la versión en imagen.
 */
export async function exportPagesToPdf(
  api: ExcalidrawImperativeAPI,
  theme: Theme,
  fileName = "documento.pdf",
  mode: PdfMode = "vector",
) {
  let pdf: jsPDF;
  try {
    pdf = await buildPdf(api, mode, theme);
  } catch (error) {
    if (mode === "raster") {
      throw error;
    }
    console.warn("PDF vectorial falló; se usa la versión en imagen.", error);
    pdf = await buildPdf(api, "raster", theme);
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
