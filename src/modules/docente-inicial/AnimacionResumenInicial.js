import { desplazamientoActividad, marcoTarjetaActividad } from "./AnimacionRegistroInicial.js";

export function aspirarAlumnoSeguimiento(rect, selected, index) {
  const { x, y } = desplazamientoActividad(rect, selected);
  return [
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: `translate(${x * .4}px, ${y * .2}px) rotate(${index % 2 ? 3 : -3}deg) scale(.8)`, opacity: .9, offset: .45 },
    { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(.08)`, opacity: 0 }
  ];
}

export function animarSeleccionResumenInicial(root, selected) {
  const list = root?.querySelector(".initial-summary-list"), rows = [...(list?.querySelectorAll?.(".initial-summary-student") || [])];
  const chosen = selected?.closest?.(".initial-summary-student"), returning = list?.classList.contains("is-focused");
  if (!chosen || !rows.includes(chosen) || !rows.every((row) => row.animate) || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
  const origin = chosen.getBoundingClientRect(), id = selected.dataset.initialSummaryStudent;
  const workspace = root.querySelector(".initial-summary-section"), previousHeight = workspace?.getBoundingClientRect().height;
  const animations = [], pending = [], visibility = chosen.style.visibility, overflow = workspace?.style.overflow;
  const previousBusy = list.getAttribute("aria-busy");
  let cancelled = false, layer = null, card = null, destination = null, destinationVisibility = "", currentWorkspace = null, currentOverflow = "";
  const animate = (element, frames, options = {}) => {
    const animation = element.animate(frames, { duration: 340, easing: "cubic-bezier(.22,.7,.25,1)", fill: "both", ...options });
    animations.push(animation);
    const done = animation.finished.then(() => true, () => false); pending.push(done); return done;
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true; animations.forEach((animation) => animation.cancel()); layer?.remove();
    chosen.style.visibility = visibility;
    if (destination) destination.style.visibility = destinationVisibility;
    if (workspace) workspace.style.overflow = overflow;
    if (currentWorkspace) currentWorkspace.style.overflow = currentOverflow;
    list.classList.remove("is-collecting");
    if (previousBusy === null) list.removeAttribute("aria-busy"); else list.setAttribute("aria-busy", previousBusy);
  };
  list.classList.add("is-collecting"); list.setAttribute("aria-busy", "true");
  try {
    const document = root.ownerDocument;
    if (document?.body && chosen.cloneNode) {
      layer = document.createElement("div"); layer.className = "initial-workspace initial-summary-transition-layer"; layer.setAttribute("aria-hidden", "true");
      card = chosen.cloneNode(true); card.classList.add("initial-summary-transition-card");
      card.querySelectorAll("button").forEach((button) => { button.tabIndex = -1; button.removeAttribute("data-initial-summary-student"); });
      Object.assign(card.style, marcoTarjetaActividad(origin)); layer.append(card); document.body.append(layer); chosen.style.visibility = "hidden";
    }
    if (returning) {
      const detail = root.querySelector(".initial-summary-detail");
      if (detail?.animate) animate(detail, [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-8px)" }], { duration: 180 });
    } else {
      rows.forEach((row, index) => { if (row !== chosen) animate(row, aspirarAlumnoSeguimiento(row.getBoundingClientRect(), origin, index), { delay: Math.min(index * 18, 160) }); });
    }
  } catch { cancel(); return null; }
  return {
    finished: Promise.all(pending).then((results) => !cancelled && results.every(Boolean)),
    async reveal(currentRoot) {
      if (cancelled) return false;
      const trigger = [...currentRoot.querySelectorAll("[data-initial-summary-student]")].find((button) => button.dataset.initialSummaryStudent === id);
      destination = trigger?.closest(".initial-summary-student");
      if (!destination) return false;
      const target = destination.getBoundingClientRect(), incoming = [];
      if (card) {
        destinationVisibility = destination.style.visibility; destination.style.visibility = "hidden";
        incoming.push(animate(card, [marcoTarjetaActividad(origin), marcoTarjetaActividad(target)], { duration: 360 }));
      }
      currentWorkspace = currentRoot.querySelector(".initial-summary-section");
      if (currentWorkspace?.animate && Number.isFinite(previousHeight)) {
        currentOverflow = currentWorkspace.style.overflow; currentWorkspace.style.overflow = "hidden";
        incoming.push(animate(currentWorkspace, [{ height: `${previousHeight}px` }, { height: `${currentWorkspace.getBoundingClientRect().height}px` }], { duration: 360 }));
      }
      if (returning) {
        [...currentRoot.querySelectorAll(".initial-summary-student")].forEach((row, index) => {
          if (row !== destination && row.animate) incoming.push(animate(row, aspirarAlumnoSeguimiento(row.getBoundingClientRect(), origin, index), { direction: "reverse", duration: 400, delay: 50 + Math.min(index * 20, 200) }));
        });
      } else {
        const detail = currentRoot.querySelector(".initial-summary-detail");
        if (detail?.animate) incoming.push(animate(detail, [{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 260, delay: 200 }));
      }
      return (await Promise.all(incoming)).every(Boolean) && !cancelled;
    },
    focusTarget: () => destination?.querySelector("[data-initial-summary-student]"),
    cancel
  };
}
