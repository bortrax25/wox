// Copia las fuentes de Excalidraw a public/ para servirlas localmente
// (sin depender del CDN). Se omite Xiaolai (CJK, ~13 MB): si se necesita,
// Excalidraw la busca en su CDN de respaldo.
import { cpSync, existsSync, rmSync } from "node:fs";

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
console.log(`Fuentes de Excalidraw copiadas a ${dest}`);
