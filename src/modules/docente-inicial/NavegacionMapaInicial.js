export function conectarNodosMapaInicial(origin, targets) {
  if (!targets.length) return "";
  const start = origin.top + origin.height / 2;
  const centers = targets.map((item) => item.top + item.height / 2);
  const junction = (origin.right + Math.min(...targets.map((item) => item.left))) / 2;
  return [`M ${origin.right} ${start} H ${junction}`, `M ${junction} ${Math.min(start, ...centers)} V ${Math.max(start, ...centers)}`, ...targets.map((item, index) => `M ${junction} ${centers[index]} H ${item.left}`)].join(" ");
}

function dibujarConexiones(viewport) {
  const map = viewport.querySelector?.("[data-initial-summary-map]");
  const svg = map?.querySelector("[data-initial-map-connectors]");
  if (!svg?.getClientRects().length) return;
  const bounds = map.getBoundingClientRect();
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left - bounds.left, right: rect.right - bounds.left, top: rect.top - bounds.top, height: rect.height };
  };
  const origin = map.querySelector(".initial-map-root");
  const branches = [...map.querySelectorAll(".initial-map-branch")];
  if (!origin || !branches.length) return;
  const labels = branches.map((branch) => branch.querySelector(".initial-map-branch-label"));
  const paths = [conectarNodosMapaInicial(box(origin), labels.map(box))];
  branches.forEach((branch, index) => paths.push(conectarNodosMapaInicial(box(labels[index]), [...branch.querySelectorAll("[data-initial-map-record]")].map(box))));
  svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
  svg.querySelector("path").setAttribute("d", paths.join(" "));
}

export function crearNavegacionMapaInicial({ Observer = globalThis.ResizeObserver, reduceMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches } = {}) {
  const positions = new Map();
  let root = null, viewport = null, observer = null;
  const guardarPosicion = () => {
    if (viewport?.dataset.initialMapKey) positions.set(viewport.dataset.initialMapKey, { left: viewport.scrollLeft, top: viewport.scrollTop });
  };
  const sync = () => {
    if (!viewport) return;
    dibujarConexiones(viewport);
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
      if (Observer) {
        observer = new Observer(sync); observer.observe(viewport);
        const map = viewport.querySelector?.("[data-initial-summary-map]");
        if (map) [map, ...map.querySelectorAll(".initial-map-root, .initial-map-branch-label, [data-initial-map-record]")].forEach((node) => observer.observe(node));
      }
    },
    desplazar(direction) {
      if (!viewport || ![-1, 1].includes(Number(direction))) return;
      viewport.scrollBy({ left: Number(direction) * Math.max(220, viewport.clientWidth - 48), behavior: reduceMotion() ? "auto" : "smooth" });
    },
    alDesplazar(element) { if (element === viewport) { guardarPosicion(); sync(); } },
    desmontar() { observer?.disconnect(); observer = null; viewport = null; root = null; positions.clear(); }
  };
}
