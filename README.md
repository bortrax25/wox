# Editor A4 (Excalidraw)

Editor minimalista sobre Excalidraw: el lienzo es una hoja blanca A4 donde se colocan texto e imágenes libremente, con un botón para exportar a PDF.

El plan de implementación está en [PLAN.md](PLAN.md).

## Uso

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/ (sitio estático, sin backend)
npm run lint
```

`npm run dev` y `npm run build` copian antes las fuentes de Excalidraw a `public/excalidraw-assets/` (carpeta ignorada por git) para servirlas localmente, sin depender de un CDN.

- **Texto**: herramienta `T` (o doble clic en la hoja). Para que un párrafo largo haga salto de línea automático, arrastra el borde lateral de la caja de texto: queda con ancho fijo.
- **Imágenes**: herramienta de imagen, pegar (`Ctrl+V`) o arrastrar desde el escritorio. Se mueven y redimensionan libremente.
- **+ Hoja**: agrega otra hoja A4 debajo de la última (`Ctrl+Z` la quita).
- **PDF**: descarga `documento.pdf` con una página por hoja; solo se incluye lo que está dentro de cada hoja.
- Todo se guarda solo en `localStorage` y se restaura al recargar.

## Cómo está hecho

| Archivo | Contenido |
| --- | --- |
| `src/App.tsx` | Monta `<Excalidraw />`, valores por defecto, botones, restricción de herramientas y autoguardado. |
| `src/a4.ts` | Hoja A4: frame de 794 × 1123 px (A4 a 96 ppp) + rectángulo blanco de fondo, ambos `locked`. |
| `src/pdf.ts` | Exportación a PDF (vectorial con respaldo en PNG). |
| `src/storage.ts` | Autoguardado en `localStorage` con debounce. |
| `src/index.css` | Pantalla completa e interfaz mínima (oculta herramientas y paneles con `:has()`). |

Versión verificada: `@excalidraw/excalidraw` **0.18.1**.

### Fuente (Arial)

- Excalidraw 0.18.1 **no tiene API pública para registrar una fuente propia** (como Arimo): el registro (`Fonts.register`) es interno y solo acepta las familias de `FONT_FAMILY`.
- Sí incluye **Liberation Sans** (`FONT_FAMILY["Liberation Sans"]`), que tiene las mismas métricas que Arial (igual que Arimo). Es la fuente por defecto, a 16 px (12 pt).
- El texto escrito con otras fuentes (p. ej. de una sesión anterior) se conserva tal cual.

### PDF

1. **Vectorial (por defecto)**: `exportToSvg` del frame + `svg2pdf.js`. Liberation Sans se embebe en el PDF (jsPDF necesita un TTF, que se genera a partir del woff2 de Excalidraw con `wawoff2`). El texto es nítido y seleccionable.
2. **PNG (respaldo)**: `exportToBlob` del frame a escala 3 (288 ppp) insertado a 210 × 297 mm. Se usa en una página cuando contiene algo que el modo vectorial no reproduce fielmente (imágenes recortadas, texto en otras fuentes o con caracteres que Liberation Sans no cubre, como emojis o CJK), o para todo el documento si el modo vectorial falla.

Antes de pasar el SVG a svg2pdf, cada imagen (`<use>` → `<symbol>`) se sustituye por un `<image>` directo, porque si no svg2pdf la deforma.

## Limitaciones

- El texto no fluye: cada texto es una caja independiente y no hay salto de página automático.
- `localStorage` tiene un límite de ~5 MB; con imágenes grandes el autoguardado puede fallar (se avisa con un mensaje).
- La posición vertical del texto en el PDF vectorial puede diferir < 1 mm de la pantalla (diferencia de línea base entre canvas y SVG).
