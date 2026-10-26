export function posicionGloboAlumno(anchor, bounds, size) {
  const gap = 12, inset = 12;
  const above = Math.max(0, anchor.top - bounds.top - inset - gap);
  const below = Math.max(0, bounds.bottom - inset - anchor.bottom - gap);
  const side = size.height <= above || above >= below ? "above" : "below";
  const height = Math.min(size.height, side === "above" ? above : below);
  const left = Math.max(bounds.left + inset, Math.min(anchor.left + anchor.width / 2 - size.width / 2, bounds.right - inset - size.width));
  const top = side === "above" ? anchor.top - gap - height : anchor.bottom + gap;
  const originX = anchor.left + anchor.width / 2 - left;
  const originY = anchor.top + anchor.height / 2 - top;
  return { left, top, height, side, originX, originY, tailX: Math.max(18, Math.min(size.width - 18, originX)) };
}

export function crearGloboAsistenciaAlumno({ target, render, refreshIcons = () => {} }) {
  const view = target?.ownerDocument.defaultView;
  let element = null, trigger = null, phase = "closed", frame = null, timer = null, onEnd = null;
  const reduceMotion = () => view?.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cancelPending = () => {
    if (frame !== null) view.cancelAnimationFrame(frame);
    if (timer !== null) view.clearTimeout(timer);
    if (onEnd) element?.removeEventListener("transitionend", onEnd);
    frame = null; timer = null; onEnd = null;
  };
  const clear = () => {
    cancelPending();
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.classList.remove("student-attendance-note-active");
    element?.remove(); element = null; trigger = null; phase = "closed";
  };
  const position = () => {
    if (!element || !trigger?.isConnected) return clear();
    const icon = trigger.querySelector("svg, i") || trigger;
    const anchor = icon.getBoundingClientRect();
    const dialog = target.querySelector('[role="dialog"]')?.getBoundingClientRect();
    if (!dialog) return clear();
    const scroller = target.querySelector("[data-attendance-scroll]")?.getBoundingClientRect();
    if (scroller && (anchor.bottom < scroller.top || anchor.top > scroller.bottom)) return clear();
    const bounds = { left: Math.max(0, dialog.left), right: Math.min(view.innerWidth, dialog.right), top: Math.max(0, dialog.top), bottom: Math.min(view.innerHeight, dialog.bottom) };
    if (anchor.bottom < bounds.top || anchor.top > bounds.bottom) return clear();
    const maxWidth = Math.min(340, bounds.right - bounds.left - 24);
    element.style.width = "max-content";
    element.style.maxWidth = `${maxWidth}px`;
    const width = Math.min(maxWidth, element.offsetWidth || maxWidth);
    element.style.width = `${width}px`;
    const content = element.querySelector(".student-attendance-balloon-content");
    const geometry = posicionGloboAlumno(anchor, bounds, { width, height: (content?.scrollHeight || element.scrollHeight) + 30 });
    element.style.left = `${geometry.left}px`; element.style.top = `${geometry.top}px`;
    element.style.maxHeight = `${geometry.height}px`;
    element.style.setProperty("--attendance-body-height", `${Math.max(0, geometry.height - 30)}px`);
    element.style.transformOrigin = `${geometry.originX}px ${geometry.originY}px`;
    element.style.setProperty("--attendance-tail-x", `${geometry.tailX}px`);
    element.dataset.side = geometry.side;
  };
  const close = ({ immediate = false } = {}) => {
    if (!element) return;
    const wasVisible = element.classList.contains("is-open");
    cancelPending(); phase = "closing";
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.classList.remove("student-attendance-note-active");
    element.classList.remove("is-open");
    if (immediate || !wasVisible || reduceMotion()) return clear();
    onEnd = (event) => { if (event.target === element && event.propertyName === "transform") clear(); };
    element.addEventListener("transitionend", onEnd);
    timer = view.setTimeout(clear, 320);
  };
  const open = (button, { animate = true } = {}) => {
    const content = render(button.dataset.attendanceNoteDate);
    if (!content) return clear();
    if (trigger === button && element) {
      cancelPending(); phase = "open";
      button.setAttribute("aria-expanded", "true"); button.classList.add("student-attendance-note-active");
      element.classList.add("is-open"); return;
    }
    clear();
    const host = target.querySelector("[data-attendance-balloon-host]");
    if (!host) return;
    host.innerHTML = content; element = host.firstElementChild; trigger = button; phase = "open";
    button.setAttribute("aria-expanded", "true"); button.classList.add("student-attendance-note-active");
    refreshIcons(); position();
    if (!element) return;
    if (!animate || reduceMotion()) element.classList.add("is-open");
    else frame = view.requestAnimationFrame(() => { frame = null; element?.classList.add("is-open"); });
  };
  return {
    get fecha() { return phase === "open" ? trigger?.dataset.attendanceNoteDate || "" : ""; },
    abrir: open,
    alternar(button) { if (button === trigger && phase === "open") close(); else open(button); },
    cerrar: close,
    reubicar: position,
    desmontar: clear
  };
}
