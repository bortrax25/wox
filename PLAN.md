# Plan: Editor A4 minimalista con Excalidraw

## Objetivo
Una app web de una sola pantalla basada en **Excalidraw**, donde el área de trabajo es una **hoja blanca A4**. En ella coloco texto (en Arial o equivalente) e imágenes que muevo libremente y con fluidez, y con **un único botón "PDF"** exporto la hoja. Estilo limpio, no "dibujado a mano".

Boceto de referencia:
- Botón `PDF` en la esquina superior derecha.
- Párrafo de texto a todo el ancho.
- Imagen a la izquierda + texto a la derecha.
- Párrafo a todo el ancho.
- Texto + imagen al centro + texto.

## Stack
- Vite + React + TypeScript
- `@excalidraw/excalidraw` (componente React, **no** forkear el repo completo)
- `jspdf` (+ `svg2pdf.js` solo en la fase vectorial)
- Sin backend. Sin login.

> Antes de escribir código, revisa la documentación actual (docs.excalidraw.com → "@excalidraw/excalidraw") y la versión instalada en `node_modules`. Verifica en la versión instalada: importación del CSS, `excalidrawAPI`, `UIOptions`, `renderTopRightUI`, `convertToExcalidrawElements`, `exportToSvg`/`exportToBlob` y la opción para exportar solo un frame (`exportingFrame` o equivalente). No inventes nombres de API.

## Alcance

### Incluido
1. **Hoja A4 como frame**: al iniciar, crear un frame de **794 × 1123 px** (A4 a 96 ppp) con un rectángulo blanco de fondo bloqueado (`locked: true`), y un fondo de lienzo gris claro para que la hoja resalte. Hacer scroll/zoom para que la hoja quede centrada y entera en pantalla.
2. **Estilo limpio por defecto** (en `initialData.appState`):
   - `currentItemRoughness: 0` (líneas rectas)
   - `currentItemStrokeColor: "#000000"`
   - `currentItemFontFamily`: la fuente sans normal de Excalidraw
   - Tamaño de texto por defecto pequeño (equivalente a ~11–12 pt).
3. **Tipografía Arial**:
   - Paso 1: usar la fuente sans "Normal" que trae Excalidraw.
   - Paso 2: investigar en la versión instalada cómo registrar una fuente personalizada y agregar **Arimo** (libre, mismas medidas que Arial; archivos en Google Fonts) o Arial del sistema. Documentar lo que funcione.
4. **Interfaz mínima** con `UIOptions` y CSS:
   - Ocultar menú principal, colaboración, librería, ayuda, cambio de tema, exportar/guardar nativos.
   - Dejar en la barra solo: seleccionar, texto, imagen (y, si es fácil, mano para desplazar).
   - Ocultar o reducir el panel de propiedades de estilo; dejar solo tamaño de texto y alineación si se puede.
5. **Imágenes**: insertar con la herramienta de imagen, pegar y arrastrar desde el escritorio (soportado por Excalidraw). Se mueven y redimensionan libremente.
6. **Botón PDF** en la esquina superior derecha (`renderTopRightUI` o un botón fijo propio):
   - **Fase 1 (simple y confiable)**: `exportToBlob` del contenido del frame en PNG a escala 3, fondo blanco, e insertarlo en `jsPDF` a 210 × 297 mm. Descargar `documento.pdf`.
   - **Fase 2 (vectorial, opcional)**: `exportToSvg` + `svg2pdf.js` para que el texto quede seleccionable y nítido. Cuidado: jsPDF necesita que la fuente (TTF de Arimo) esté registrada para dibujar el texto correctamente; si no, saldrá con otra fuente.
   - Solo se exporta lo que está dentro de la hoja A4; lo que quede fuera se ignora.
7. **Autoguardado** en `localStorage` (elementos + archivos binarios de imágenes + appState relevante), con debounce y try/catch. Al recargar, restaurar.

### Fase opcional: varias páginas
- Botón "+ Hoja" que agrega otro frame A4 debajo del anterior (con separación de 40 px).
- El PDF exporta cada frame como una página, en orden vertical.

### Fuera de alcance (no agregar)
Colaboración en vivo, librerías de formas, dibujo a mano alzada, flechas y diagramas, tema oscuro, varios documentos.

## Limitaciones conocidas (aceptadas)
- El texto **no fluye**: cada texto es una caja independiente. Si un párrafo crece, no empuja a lo de abajo; se reacomoda a mano.
- No hay salto de página automático.
- Para párrafos largos conviene fijar el ancho del contenedor de texto para que haga salto de línea automático (verificar soporte de "auto-wrap" con ancho fijo en la versión instalada).

## Pasos
1. Crear proyecto: `npm create vite@latest editor-a4-excalidraw -- --template react-ts`, instalar `@excalidraw/excalidraw` y `jspdf`.
2. Montar `<Excalidraw />` a pantalla completa (el contenedor necesita altura definida) e importar su CSS.
3. Crear el frame A4 y el fondo blanco bloqueado al iniciar; centrar la vista en la hoja.
4. Aplicar estilo limpio por defecto (roughness 0, fuente sans, tamaño pequeño).
5. Reducir la interfaz con `UIOptions` y CSS hasta dejar solo seleccionar, texto e imagen.
6. Botón PDF (fase 1, PNG → jsPDF). Verificar que el PDF es A4 y coincide con la hoja.
7. Autoguardado en `localStorage`.
8. Fuente Arimo/Arial personalizada.
9. Opcional: PDF vectorial (fase 2) y varias hojas.

## Criterios de aceptación
- [ ] Al abrir, veo una hoja A4 blanca centrada y el botón PDF; la interfaz es mínima.
- [ ] Puedo escribir texto con líneas limpias y fuente sans (idealmente Arial/Arimo).
- [ ] Puedo insertar, pegar y arrastrar imágenes, y moverlas/redimensionarlas con fluidez.
- [ ] Puedo replicar el boceto: texto ancho, imagen + texto, texto + imagen + texto.
- [ ] El botón PDF descarga un PDF A4 con exactamente lo que está dentro de la hoja.
- [ ] La hoja de fondo no se puede mover ni seleccionar por accidente.
- [ ] Al recargar, el contenido sigue ahí.

## Notas
- Excalidraw es MIT.
- Si en algún momento se necesita escribir mucho texto corrido, considerar el plan BlockNote en paralelo.
