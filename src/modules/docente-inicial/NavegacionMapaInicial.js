export function crearNavegacionMapaInicial({ Observer = globalThis.ResizeObserver, reduceMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches } = {}) {
  const positions = new Map();
  let root = null, viewport = null, observer = null;
  const guardarPosicion = () => {
    if (viewport?.dataset.initialMapKey) positions.set(viewport.dataset.initialMapKey, { left: viewport.scrollLeft, top: viewport.scrollTop });
  };
  const sync = () => {
    if (!viewport) return;
    const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const left = root.querySelector('[data-initial-map-pan="-1"]'), right = root.querySelector('[data-initial-map-pan="1"]');
    if (left) left.disabled = viewport.scrollLeft <= 1;
    if (right) right.disabled = viewport.scrollLeft >= maximum - 1;
  };
  return {
    guardarPosicion,
    vincular(element) {
      observer?.disconnect(); observer = null; root = element;
      viewport = root?.querySelector("[data-initial-map-viewport]") || null;
      if (!viewport) return;
      const previous = positions.get(viewport.dataset.initialMapKey);
      if (previous) { viewport.scrollLeft = previous.left; viewport.scrollTop = previous.top; }
      sync();
      if (Observer) { observer = new Observer(sync); observer.observe(viewport); }
    },
    desplazar(direction) {
      if (!viewport || ![-1, 1].includes(Number(direction))) return;
      viewport.scrollBy({ left: Number(direction) * Math.max(220, viewport.clientWidth - 48), behavior: reduceMotion() ? "auto" : "smooth" });
    },
    alDesplazar(element) { if (element === viewport) { guardarPosicion(); sync(); } },
    desmontar() { observer?.disconnect(); observer = null; viewport = null; root = null; positions.clear(); }
  };
}
