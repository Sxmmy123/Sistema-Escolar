import { caidaAlumnoInicial } from "./AnimacionRegistroInicial.js";

const quiet = () => ({ finished: Promise.resolve(true), cancel() {} });

export function animarSelectorAlumnosInicial(host, trigger, reverse = false) {
  const grid = host?.querySelector(".initial-report-student-grid"), dialog = host?.querySelector(".initial-dialog"), backdrop = host?.querySelector(".initial-dialog-backdrop");
  const items = [...(grid?.querySelectorAll?.("[data-initial-picker-student]") || [])];
  if (!trigger?.getBoundingClientRect || !grid || !dialog?.animate || !items.length || !items.every((item) => item.animate) || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return quiet();
  const origin = trigger.getBoundingClientRect(), animations = [], pending = [];
  const pointerEvents = grid.style.pointerEvents, busy = grid.getAttribute("aria-busy");
  let cancelled = false;
  const cleanup = () => {
    animations.forEach((animation) => animation.cancel());
    grid.style.pointerEvents = pointerEvents;
    if (busy === null) grid.removeAttribute("aria-busy"); else grid.setAttribute("aria-busy", busy);
  };
  const cancel = () => { if (!cancelled) { cancelled = true; cleanup(); } };
  const animate = (element, frames, options) => {
    if (!element?.animate) return;
    const animation = element.animate(frames, { easing: "cubic-bezier(.22,.7,.25,1)", fill: "both", ...options });
    animations.push(animation);
    pending.push(animation.finished.then(() => true, () => false));
  };
  grid.style.pointerEvents = "none";
  grid.setAttribute("aria-busy", "true");
  try {
    items.forEach((item, index) => animate(item, caidaAlumnoInicial(item.getBoundingClientRect(), origin, index), {
      direction: reverse ? "reverse" : "normal", duration: reverse ? 320 : 420,
      delay: reverse ? Math.min((items.length - index - 1) * 20, 180) : 70 + Math.min(index * 28, 280)
    }));
    const delay = reverse ? 360 : 0;
    animate(dialog, reverse ? [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-8px)" }] : [{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180, delay });
    animate(backdrop, reverse ? [{ backgroundColor: "#14261fb3" }, { backgroundColor: "#14261f00" }] : [{ backgroundColor: "#14261f00" }, { backgroundColor: "#14261fb3" }], { duration: 180, delay });
  } catch {
    cancel();
    return quiet();
  }
  return {
    finished: Promise.all(pending).then((results) => { if (!cancelled) cleanup(); return !cancelled && results.every(Boolean); }),
    cancel
  };
}
