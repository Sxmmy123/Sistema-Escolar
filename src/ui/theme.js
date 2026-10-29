import { icon } from "./dom.js";

export const THEME_STORAGE_KEY = "colegio-tema";
const validTheme = (theme) => theme === "dark" || theme === "light";
const browserStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export function readTheme(storage = browserStorage()) {
  try { const value = storage?.getItem(THEME_STORAGE_KEY); return validTheme(value) ? value : "light"; }
  catch { return "light"; }
}

export function applyTheme(theme, root = document.documentElement) {
  root.dataset.theme = validTheme(theme) ? theme : "light";
  return root.dataset.theme;
}

export function initializeTheme({ root = document.documentElement, storage = browserStorage() } = {}) {
  return applyTheme(readTheme(storage), root);
}

export function themeToggle() {
  return `<button type="button" class="sidebar-tool-button theme-toggle" data-theme-toggle aria-label="Activar tema oscuro" aria-pressed="false" title="Activar tema oscuro">
    <span class="theme-icon-moon" aria-hidden="true">${icon("moon", "h-4 w-4")}</span>
    <span class="theme-icon-sun" aria-hidden="true">${icon("sun", "h-4 w-4")}</span>
    <span class="sidebar-tooltip" role="tooltip" data-theme-tooltip>Tema oscuro</span>
  </button>`;
}

export function bindThemeButtons({ root = document, themeRoot = root.documentElement, storage = browserStorage(), events = globalThis.window, signal } = {}) {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const sync = () => root.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const dark = themeRoot.dataset.theme === "dark";
    const label = `Activar tema ${dark ? "claro" : "oscuro"}`;
    button.setAttribute("aria-label", label); button.setAttribute("aria-pressed", String(dark)); button.title = label;
    const tooltip = button.querySelector("[data-theme-tooltip]");
    if (tooltip) tooltip.textContent = `Tema ${dark ? "claro" : "oscuro"}`;
  });
  root.querySelectorAll("[data-theme-toggle]").forEach((button) => button.addEventListener("click", () => {
    const theme = applyTheme(themeRoot.dataset.theme === "dark" ? "light" : "dark", themeRoot);
    try { storage?.setItem(THEME_STORAGE_KEY, theme); } catch { /* The current view still changes without storage. */ }
    sync();
  }, options));
  events?.addEventListener("storage", (event) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyTheme(validTheme(event.newValue) ? event.newValue : "light", themeRoot); sync();
  }, options);
  sync();
  const dispose = () => controller.abort();
  if (signal?.aborted) dispose(); else signal?.addEventListener("abort", dispose, { once: true });
  return dispose;
}
