interface Window {
  EXCALIDRAW_ASSET_PATH?: string | string[];
  /** Presente solo dentro del visor de artefactos de claude.ai. */
  claude?: { use(name: string): Promise<unknown> };
}
