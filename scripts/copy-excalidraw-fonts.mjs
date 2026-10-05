// Copia las fuentes de Excalidraw a public/ para servirlas localmente
// (sin depender del CDN). Se omite Xiaolai (CJK, ~13 MB): si se necesita,
// Excalidraw la busca en su CDN de respaldo.
//
// Además genera un TTF de Liberation Sans a partir del woff2: jsPDF solo
// acepta TTF y lo necesita para el PDF vectorial (texto seleccionable).
//
// Modo 2 (estilo Zed): Excalidraw no permite registrar fuentes propias, así
// que su fuente "Cascadia" (oculta en la interfaz) se sirve con el archivo
// de IBM Plex Mono, la base de la letra del editor Zed. También su TTF.
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import wawoff2 from "wawoff2";

const src = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
const dest = "public/excalidraw-assets/fonts";

if (!existsSync(src)) {
  console.error(`No se encontró ${src}. ¿Ejecutaste npm install?`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, {
  recursive: true,
  filter: (path) => !path.includes("Xiaolai"),
});

const woff2 = `${dest}/Liberation/LiberationSans-Regular.woff2`;
const ttf = await wawoff2.decompress(readFileSync(woff2));
writeFileSync(`${dest}/Liberation/LiberationSans-Regular.ttf`, ttf);

const plexWoff2 = readFileSync(
  "node_modules/@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-Regular.woff2",
);
writeFileSync(`${dest}/Cascadia/CascadiaCode-Regular.woff2`, plexWoff2);
writeFileSync(
  `${dest}/Cascadia/IBMPlexMono-Regular.ttf`,
  await wawoff2.decompress(plexWoff2),
);

console.log(`Fuentes de Excalidraw copiadas a ${dest}`);
