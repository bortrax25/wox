export type Theme = "light" | "dark";

const KEY = "editor-a4:theme";

/** Tema guardado; la primera vez sigue la preferencia del sistema. */
export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // localStorage no disponible: se usa la preferencia del sistema.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Sin persistencia: el tema dura solo esta sesión.
  }
}
