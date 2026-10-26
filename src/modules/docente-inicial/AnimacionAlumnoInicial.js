const sinAnimacion = () => ({ finished: Promise.resolve(true), cancel() {} });

export function medirSeleccionAlumnoInicial(root) {
  const student = root?.querySelector("[data-activity-student].is-active"), bubble = root?.querySelector(".initial-student-bubble"), session = root?.querySelector(".initial-student-session");
  const tiles = Object.fromEntries([...(root?.querySelectorAll?.("[data-activity-student]") || [])].map((item) => [item.dataset.activityStudent, item.getBoundingClientRect()]));
  return { studentId: student?.dataset.activityStudent || "", bubble: bubble?.getBoundingClientRect(), session: session?.getBoundingClientRect(), tiles };
}

export function animarCambioAlumnoInicial(root, previous = {}) {
  const current = medirSeleccionAlumnoInicial(root), bubble = root?.querySelector(".initial-student-bubble"), session = root?.querySelector(".initial-student-session");
  if (!bubble?.animate || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return sinAnimacion();
  const changed = current.studentId !== previous.studentId, resized = Math.abs((previous.bubble?.height || 0) - current.bubble.height) > 1;
  if (!changed && !resized) return sinAnimacion();
  const animations = [], overflow = session?.style.overflow || "";
  let cancelled = false;
  const animate = (element, frames, options = {}) => {
    if (!element?.animate) return;
    const animation = element.animate(frames, { duration: 300, easing: "cubic-bezier(.22,.7,.25,1)", fill: "both", ...options });
    animations.push(animation);
    return animation.finished.then(() => true, () => false);
  };
  const pending = [];
  if (session && previous.session) {
    session.style.overflow = "hidden";
    pending.push(animate(session, [{ height: `${previous.session.height}px` }, { height: `${current.session.height}px` }]));
  }
  pending.push(animate(bubble.querySelector(".initial-student-bubble-frame"), [{ height: `${previous.bubble?.height || current.bubble.height * .8}px`, width: `${previous.bubble?.width || current.bubble.width}px` }, { height: `${current.bubble.height}px`, width: `${current.bubble.width}px` }]));
  if (changed) {
    // Move the chosen tile into the frame, returning the previous pupil to the roster.
    for (const item of root.querySelectorAll?.("[data-activity-student]") || []) {
      const from = previous.tiles?.[item.dataset.activityStudent], to = item.getBoundingClientRect();
      if (from) pending.push(animate(item, [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "translate(0, 0)" }]));
    }
    pending.push(animate(bubble.querySelector(".initial-assessment-content"), [{ opacity: .35 }, { opacity: 1 }], { duration: 200, delay: 40 }));
  }
  const cleanup = () => { animations.forEach((animation) => animation.cancel()); if (session) session.style.overflow = overflow; };
  return { finished: Promise.all(pending).then((results) => { if (!cancelled) cleanup(); return results.every(Boolean) && !cancelled; }), cancel() { if (cancelled) return; cancelled = true; cleanup(); } };
}
