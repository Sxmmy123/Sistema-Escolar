export function desplazamientoActividad(origin, target) {
  return { x: target.left + target.width / 2 - origin.left - origin.width / 2, y: target.top + target.height / 2 - origin.top - origin.height / 2 };
}

export function marcoTarjetaActividad(rect) {
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` };
}

export function caidaAlumnoInicial(rect, activity, index) {
  const x = activity.left + activity.width / 2 - rect.left - rect.width / 2;
  const y = Math.min(-28, activity.top + activity.height - rect.top - 12);
  const tilt = index % 2 ? 4 : -4;
  return [
    { transform: `translate(${x}px, ${y}px) rotate(${tilt}deg) scale(.9)`, opacity: 0 },
    { transform: "translate(0, 7px) rotate(1deg) scale(1)", opacity: 1, offset: .72 },
    { transform: "translate(0, -3px) rotate(-.5deg) scale(1)", opacity: 1, offset: .88 },
    { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 }
  ];
}

export function animarSeleccionActividad(root, selected) {
  const returning = selected.hasAttribute?.("data-activity-grid") || false, activityId = selected.dataset?.activityKey;
  const grid = returning ? root.querySelector(".initial-registration-students") : selected.closest?.(".initial-priority-list");
  const items = grid ? returning ? [...(root.querySelectorAll?.("[data-activity-student]") || grid.querySelectorAll("[data-activity-student]"))] : [...grid.querySelectorAll("[data-activity-open]")] : [];
  if (!root?.contains(selected) || !grid || !returning && !items.includes(selected) || !items.every((item) => typeof item.animate === "function") || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return { finished: Promise.resolve(true), reveal: () => Promise.resolve(true), cancel() {} };
  }
  const origin = selected.getBoundingClientRect(), animations = [], pending = [];
  const previousHeight = root.querySelector?.(".initial-registration-workspace")?.getBoundingClientRect().height;
  const easing = "cubic-bezier(.22,.7,.25,1)", document = root.ownerDocument;
  let cancelled = false, layer = null, card = null, destination = null;
  const visibility = selected.style?.visibility || "";
  let destinationVisibility = "", workspace = null, overflow = "";
  const animate = (element, frames, options) => {
    const animation = element.animate(frames, { easing, fill: "both", ...options });
    animations.push(animation);
    const finished = animation.finished.then(() => true, () => false);
    pending.push(finished);
    return finished;
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    animations.forEach((animation) => animation.cancel());
    if (selected.style) selected.style.visibility = visibility;
    if (destination) destination.style.visibility = destinationVisibility;
    if (workspace) workspace.style.overflow = overflow;
    layer?.remove();
    grid.classList.remove("is-collecting");
    selected.classList.remove("is-collecting-selected");
    grid.removeAttribute("aria-busy");
  };
  grid.classList.add("is-collecting");
  selected.classList.add("is-collecting-selected");
  grid.setAttribute("aria-busy", "true");
  try {
    // A shared card bridges both layouts without scaling its text or changing its shape.
    if (document?.body && selected.cloneNode) {
      layer = document.createElement("div");
      layer.className = "initial-workspace initial-activity-transition-layer";
      layer.setAttribute("aria-hidden", "true");
      card = selected.cloneNode(true);
      card.classList.add("initial-activity-transition-card");
      card.removeAttribute("data-activity-open"); card.removeAttribute("data-activity-grid"); card.tabIndex = -1;
      Object.assign(card.style, marcoTarjetaActividad(origin));
      layer.append(card); document.body.append(layer);
      selected.style.visibility = "hidden";
    }
    items.forEach((item, index) => {
      if (item === selected) return;
      if (returning) {
        animate(item, caidaAlumnoInicial(item.getBoundingClientRect(), origin, index), { direction: "reverse", duration: 340, delay: Math.min((items.length - index - 1) * 28, 280) });
        return;
      }
      const { x, y } = desplazamientoActividad(item.getBoundingClientRect(), origin);
      animate(item, [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${x}px, ${y}px) scale(.88)`, opacity: .7, offset: .8 },
        { transform: `translate(${x}px, ${y}px) scale(.84)`, opacity: 0 }
      ], { duration: 200, delay: Math.min(index * 12, 48) });
    });
    if (returning) {
      for (const element of root.querySelectorAll?.(".initial-student-bubble-frame, .initial-student-bubble .initial-registration-controls, .initial-student-bubble h3, .initial-student-bubble .initial-activity-options, .initial-student-session > .initial-empty, .initial-registration-detail > .initial-save-row, .initial-registration-complete") || []) {
        if (element.animate) animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
      }
    }
  } catch {
    cancel();
    return { finished: Promise.resolve(true), reveal: () => Promise.resolve(true), cancel() {} };
  }
  return {
    finished: Promise.all(pending).then(() => !cancelled),
    async reveal(currentRoot) {
      if (cancelled) return false;
      destination = returning ? [...currentRoot.querySelectorAll("[data-activity-open]")].find((item) => item.dataset.activityOpen === activityId) : currentRoot.querySelector("[data-activity-grid]");
      if (!destination) return false;
      const target = destination.getBoundingClientRect(), incoming = [];
      if (card) {
        destinationVisibility = destination.style.visibility;
        destination.style.visibility = "hidden";
        incoming.push(animate(card, [marcoTarjetaActividad(origin), marcoTarjetaActividad(target)], { duration: 380 }));
        const chevron = card.lastElementChild;
        if (chevron?.animate) incoming.push(animate(chevron, [{ transform: `rotate(${returning ? 90 : 0}deg)` }, { transform: `rotate(${returning ? 0 : 90}deg)` }], { duration: 380 }));
      }
      workspace = currentRoot.querySelector(".initial-registration-workspace");
      if (workspace?.animate && Number.isFinite(previousHeight)) {
        overflow = workspace.style.overflow;
        const height = workspace.getBoundingClientRect().height;
        workspace.style.overflow = "hidden";
        incoming.push(animate(workspace, [{ height: `${previousHeight}px` }, { height: `${height}px` }], { duration: 380 }));
      }
      if (returning) {
        [...currentRoot.querySelectorAll("[data-activity-open]")].forEach((item, index) => {
          if (item === destination || !item.animate) return;
          const { x, y } = desplazamientoActividad(item.getBoundingClientRect(), target);
          incoming.push(animate(item, [{ transform: `translate(${x}px, ${y}px) scale(.84)`, opacity: 0 }, { transform: "translate(0, 0) scale(1)", opacity: 1 }], { duration: 360, delay: 80 + Math.min(index * 24, 192) }));
        });
      } else {
        [...currentRoot.querySelectorAll?.("[data-activity-student]") || []].forEach((item, index) => {
          if (item.animate) incoming.push(animate(item, caidaAlumnoInicial(item.getBoundingClientRect(), target, index), { duration: 420, delay: 100 + Math.min(index * 32, 352) }));
        });
      }
      for (const element of currentRoot.querySelectorAll?.(returning ? '.initial-activity-link, [data-initial-action="more-activities"]' : ".initial-student-session > .initial-empty, .initial-registration-detail > .initial-save-row") || []) {
        if (element.animate) incoming.push(animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 240 }));
      }
      return (await Promise.all(incoming)).every(Boolean) && !cancelled;
    },
    focusTarget: () => destination,
    cancel
  };
}
