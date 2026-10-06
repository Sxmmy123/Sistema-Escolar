import { auth } from "../../firebase/client.js";
import { claveCache } from "../../services/rutasFirestore.js";
import { findCourse, findSubject } from "../../data/catalog.js";
import { loadTeacherAcademicAlerts, markTeacherAbsenceFollowedUp, markTeacherAlertsViewed } from "../../services/alertasDocente.js";
import { teacherAlertKeys, unseenTeacherAlerts } from "../../services/calcularAlertasDocente.js";
import { activeCommunications, localDateIso, watchActiveCommunications } from "../../services/comunicadosDocentes.js";
import {
  getTeacherContext, getTeacherNotesSnapshot, getTeacherSummarySnapshot,
  refreshTeacherNotesSnapshot, refreshTeacherSummarySnapshot
} from "../../services/teacherData.js";
import { icon } from "../../ui/dom.js";
import { loadSavedTrimester, teacherState } from "./EstadoDocente.js";
import { escapeHtml, refreshIcons } from "./UtilidadesDocente.js";

const CACHE_TTL = 5 * 60 * 1000;
let bindingController = null;
let stopWatching = null;
let watchedUid = "";
let watchedDate = "";
let midnightTimer = null;
let communications = [];
let communicationsError = "";
let academicError = "";
let loadingKey = "";
let academicDirty = false;
let activeAlerts = new Map();
const pendingLoads = new Map();
const backgroundLoadedKeys = new Set();
const seenInMemory = new Map();

function academicCacheKey(uid, trimesterId) {
  return claveCache("alertas_alumnos", uid, trimesterId);
}

function seenStorageKey(uid, trimesterId) {
  return claveCache("avisos_vistos", uid, trimesterId);
}

function localSeenKeys(uid, trimesterId) {
  const key = seenStorageKey(uid, trimesterId);
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return [...new Set([...(Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []), ...(seenInMemory.get(key) || [])])];
  } catch {
    return [...(seenInMemory.get(key) || [])];
  }
}

function saveLocalSeenKeys(uid, trimesterId, keys) {
  const storageKey = seenStorageKey(uid, trimesterId);
  const seen = new Set([...localSeenKeys(uid, trimesterId), ...keys]);
  seenInMemory.set(storageKey, seen);
  try {
    localStorage.setItem(storageKey, JSON.stringify([...seen]));
  } catch {
    // El aviso se oculta durante esta sesion aunque el almacenamiento este bloqueado.
  }
}

function readAcademicCache(uid, trimesterId) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(academicCacheKey(uid, trimesterId)) || "null");
    if (cached?.today !== localDateIso() || Date.now() - Number(cached.updatedAt || 0) > CACHE_TTL) return null;
    return cached;
  } catch {
    return null;
  }
}

function saveAcademicCache(uid, trimesterId, data) {
  try {
    sessionStorage.setItem(academicCacheKey(uid, trimesterId), JSON.stringify({ ...data, updatedAt: Date.now() }));
  } catch {
    // El panel sigue funcionando aunque el almacenamiento este bloqueado.
  }
}

function displayDate(value, options = { day: "numeric", month: "short" }) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-BO", options);
}

function communicationTime(item) {
  const date = new Date(`${item.fechaEvento}T${item.horaEvento || "00:00"}:00`);
  return Number.isNaN(date.getTime())
    ? `${item.fechaEvento || ""} ${item.horaEvento || ""}`
    : date.toLocaleString("es-BO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function alertLabel(item) {
  if (item.kind === "absence") return `${item.count} faltas seguidas`;
  const parts = [];
  if (item.missing.length) parts.push(`${item.missing.length} sin presentar`);
  if (item.pending.length) parts.push(`${item.pending.length} por calificar`);
  return parts.join(" · ");
}

function alertSubtitle(item) {
  const course = findCourse(item.courseId)?.nombre || item.courseId;
  if (item.kind === "absence") return `${course} · ${item.total} faltas en el trimestre`;
  return course;
}

function alertItem(item) {
  const isAbsence = item.kind === "absence";
  const tone = isAbsence || item.missing.length ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700";
  const alertIcon = isAbsence ? "user-x" : item.missing.length ? "clipboard-x" : "clipboard-pen-line";
  return `
    <button type="button" data-teacher-alert-id="${escapeHtml(item.id)}" class="flex w-full items-start gap-2.5 border-b border-slate-100 px-4 py-2.5 text-left transition last:border-0 hover:bg-slate-50">
      <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md ${tone}">${icon(alertIcon, "h-4 w-4")}</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-xs font-medium text-slate-900" title="${escapeHtml(item.student.nombre)}">${escapeHtml(item.student.nombre)}</span>
        <span class="mt-0.5 block text-[11px] font-medium text-slate-700">${escapeHtml(alertLabel(item))}</span>
        <span class="block text-[11px] leading-4 text-slate-500">${escapeHtml(alertSubtitle(item))}</span>
      </span>
      ${icon("chevron-right", "mt-2 h-3.5 w-3.5 shrink-0 text-slate-400")}
    </button>
  `;
}

function section(title, items) {
  if (!items.length) return "";
  return `<section><h3 class="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">${escapeHtml(title)} · ${items.length}</h3>${items.map(alertItem).join("")}</section>`;
}

function renderNotifications() {
  const panel = document.querySelector("[data-teacher-alert-panel]");
  const holder = panel?.querySelector("[data-teacher-alert-content]");
  if (!holder) return;
  const current = activeCommunications(communications);
  const uid = auth.currentUser?.uid || "";
  const trimesterId = teacherState.trimesterId || "t1";
  const academic = readAcademicCache(uid, trimesterId);
  const allAlerts = [...(academic?.absences || []), ...(academic?.studentAlerts || [])];
  const seenKeys = [...localSeenKeys(uid, trimesterId), ...(academic?.seenKeys || [])];
  const alerts = unseenTeacherAlerts(allAlerts, seenKeys);
  const absences = alerts.filter((item) => item.kind === "absence");
  const studentAlerts = alerts.filter((item) => item.kind === "student");
  activeAlerts = new Map(allAlerts.map((item) => [item.id, item]));
  const modal = document.querySelector("[data-teacher-alert-modal]");
  if (modal?.dataset.activeAlertId && !activeAlerts.has(modal.dataset.activeAlertId)) closeAlertModal();
  const count = current.length + alerts.length;
  document.querySelectorAll("[data-teacher-alert-badge]").forEach((badge) => {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("hidden", count === 0);
  });

  holder.innerHTML = `
    <section class="border-b border-slate-200">
      <h3 class="flex items-center gap-2 bg-green-50 px-4 py-2 text-xs font-semibold text-school-green">${icon("megaphone", "h-4 w-4")} Avisos de direccion ${current.length ? `· ${current.length}` : ""}</h3>
      ${current.length ? current.map((item) => `
        <article class="border-b border-green-100 px-4 py-3 last:border-0">
          <p class="text-sm font-semibold text-slate-950">${escapeHtml(item.titulo)}</p>
          <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">${escapeHtml(item.motivo)}</p>
          <p class="mt-1.5 text-[11px] font-medium text-school-green">${escapeHtml(communicationTime(item))}</p>
        </article>
      `).join("") : `<p class="px-4 py-3 text-xs text-slate-500">No hay comunicados vigentes.</p>`}
      ${communicationsError ? `<p class="px-4 pb-3 text-xs text-red-700">${escapeHtml(communicationsError)}</p>` : ""}
    </section>
    <div class="bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800">Seguimiento de alumnos · ${escapeHtml(trimesterId.toUpperCase())}</div>
    ${loadingKey === `${uid}|${trimesterId}` ? `<p class="px-4 py-4 text-xs text-slate-500">Buscando alertas...</p>` : academicError ? `<p class="px-4 py-4 text-xs text-red-700">${escapeHtml(academicError)}</p>` : academic ? `
      ${section("Faltas consecutivas", absences)}
      ${section("Alumnos con actividades por atender", studentAlerts)}
      ${!alerts.length ? `<p class="px-4 py-4 text-xs text-slate-500">No hay avisos nuevos en este trimestre.</p>` : ""}
    ` : `<p class="px-4 py-4 text-xs text-slate-500">Abre la campana para consultar las alertas.</p>`}
  `;
  refreshIcons();
}

function detailRows(item) {
  if (item.kind === "absence") return `<ul class="max-h-[42dvh] overflow-y-auto rounded-md border border-slate-200 px-3 text-sm text-slate-700">${item.dates.map((date) => `<li class="flex justify-between border-b border-slate-100 py-1.5 last:border-0"><span>${escapeHtml(displayDate(date, { weekday: "long", day: "numeric", month: "long" }))}</span><span class="text-red-700">Falta</span></li>`).join("")}</ul>`;
  const rows = (details) => details.map((detail) => `
    <li class="border-b border-slate-100 py-2 last:border-0">
      <span class="block text-slate-900">${escapeHtml(detail.title)}</span>
      <span class="text-xs text-slate-500">${escapeHtml(findSubject(detail.subjectId)?.nombre || detail.subjectId)} · ${escapeHtml(displayDate(detail.date))} · ${escapeHtml(detail.attendance)}</span>
    </li>`).join("");
  return `
    ${item.missing.length ? `<section><h3 class="mb-1 text-xs font-semibold text-red-700">No presentadas · ${item.missing.length}</h3><ul class="rounded-md border border-red-100 px-3 text-sm text-slate-700">${rows(item.missing)}</ul></section>` : ""}
    ${item.pending.length ? `<section class="mt-3"><h3 class="mb-1 text-xs font-semibold text-school-green">Pendientes de calificar · ${item.pending.length}</h3><ul class="rounded-md border border-slate-200 px-3 text-sm text-slate-700">${rows(item.pending)}</ul></section>` : ""}
  `;
}

function openAlertModal(item) {
  const modal = document.querySelector("[data-teacher-alert-modal]");
  const holder = modal?.querySelector("[data-teacher-alert-modal-content]");
  if (!holder) return;
  const academic = readAcademicCache(auth.currentUser?.uid || "", teacherState.trimesterId || "t1");
  const context = item.kind === "absence"
    ? "Solo se cuentan dias en que se tomo asistencia al curso."
    : "No presentada: revision cerrada sin nota positiva. Pendiente de calificar: asistio, pero aun no tiene nota; esto no confirma la entrega.";
  holder.innerHTML = `
    <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
      <div class="min-w-0"><p class="text-xs font-medium text-school-green">${escapeHtml(alertLabel(item))}</p><h2 id="teacher-alert-modal-title" class="mt-1 text-base font-semibold text-slate-950">${escapeHtml(item.student.nombre)}</h2><p class="mt-1 text-xs text-slate-600">${escapeHtml(alertSubtitle(item))}</p></div>
      <button type="button" data-close-teacher-alert-modal aria-label="Cerrar detalle" class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100">${icon("x", "h-4 w-4")}</button>
    </div>
    <div class="px-4 py-3 sm:px-5"><p class="text-xs leading-5 text-slate-600">${context}</p>
      ${item.kind === "absence" ? `<div class="mt-3 flex gap-2 text-xs"><span class="rounded-md bg-red-50 px-2 py-1 font-medium text-red-700">${item.count} seguidas</span><span class="rounded-md bg-slate-100 px-2 py-1 text-slate-700">${item.total} faltas en el trimestre</span></div>` : ""}
      <div class="mt-3 max-h-[42dvh] overflow-y-auto">${detailRows(item)}</div>
      <p data-teacher-alert-modal-status class="mt-3 hidden text-xs text-red-700"></p>
      ${item.kind === "absence" && academic?.followUpUnavailable ? `<p class="mt-3 text-xs text-amber-700">Publica las reglas nuevas de Firestore para guardar el seguimiento.</p>` : ""}
      ${academic?.seenUnavailable ? `<p class="mt-2 text-xs text-amber-700">El aviso visto se guarda en este dispositivo hasta publicar las reglas de Firestore.</p>` : ""}
    </div>
    <div class="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
      ${item.kind === "absence" && !academic?.followUpUnavailable ? `<button type="button" data-alert-follow-up="${escapeHtml(item.id)}" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Seguimiento realizado</button>` : ""}
      ${item.kind === "absence" ? `<button type="button" data-alert-go="${escapeHtml(item.id)}" data-alert-destination="asistencia" class="rounded-md bg-school-green px-3 py-2 text-xs font-medium text-white hover:bg-green-800">Ver asistencia</button>` : ""}
      ${item.kind === "student" && item.missing.length ? `<button type="button" data-alert-go="${escapeHtml(item.id)}" data-alert-destination="regularizacion" class="rounded-md border border-school-green px-3 py-2 text-xs font-medium text-school-green hover:bg-green-50">Abrir Regularizacion</button>` : ""}
      ${item.kind === "student" && item.pending.length ? `<button type="button" data-alert-go="${escapeHtml(item.id)}" data-alert-destination="calificar" class="rounded-md bg-school-green px-3 py-2 text-xs font-medium text-white hover:bg-green-800">Abrir Calificar</button>` : ""}
    </div>`;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  modal.dataset.activeAlertId = item.id;
  document.querySelector("[data-teacher-alert-panel]")?.classList.add("hidden");
  document.querySelectorAll("[data-teacher-alert-toggle]").forEach((button) => button.setAttribute("aria-expanded", "false"));
  holder.querySelector("[data-close-teacher-alert-modal]")?.focus();
  refreshIcons();
}

function closeAlertModal() {
  const modal = document.querySelector("[data-teacher-alert-modal]");
  modal?.classList.add("hidden");
  modal?.classList.remove("flex");
  if (modal) delete modal.dataset.activeAlertId;
}

function markAlertViewed(item) {
  const uid = auth.currentUser?.uid || "";
  const trimesterId = teacherState.trimesterId || "t1";
  const keys = teacherAlertKeys(item);
  if (!uid || !keys.length) return;
  saveLocalSeenKeys(uid, trimesterId, keys);
  renderNotifications();
  markTeacherAlertsViewed({ trimesterId, keys }).catch((error) => {
    console.warn("El aviso visto solo se guardo en este dispositivo", error);
    const modal = document.querySelector("[data-teacher-alert-modal]");
    if (modal?.dataset.activeAlertId !== item.id) return;
    const status = modal.querySelector("[data-teacher-alert-modal-status]");
    if (status) {
      status.textContent = "Visto en este dispositivo. Publica las reglas de Firestore para sincronizarlo.";
      status.classList.remove("hidden");
    }
  });
}

async function loadAcademic(force = false) {
  const uid = auth.currentUser?.uid || "";
  if (!uid) return;
  try {
    const context = teacherState.context?.uid === uid ? teacherState.context : await getTeacherContext(uid);
    if (teacherState.context?.uid !== uid) {
      teacherState.context = context;
      loadSavedTrimester(context);
    }
    const trimesterId = teacherState.trimesterId || context.profile?.trimestreActivo || "t1";
    const key = `${uid}|${trimesterId}`;
    if (!force && !academicDirty && readAcademicCache(uid, trimesterId)) return renderNotifications();
    if (pendingLoads.has(key)) return pendingLoads.get(key);
    academicError = "";
    loadingKey = key;
    renderNotifications();
    const promise = loadTeacherAcademicAlerts(context, trimesterId)
      .then((result) => {
        if (auth.currentUser?.uid !== uid) return;
        saveAcademicCache(uid, trimesterId, result);
        academicDirty = false;
      })
      .catch((error) => {
        if (auth.currentUser?.uid !== uid) return;
        academicError = error?.code === "permission-denied" ? "Sin permiso para consultar alertas. Revisa las reglas de Firestore." : (error.message || "No se pudieron cargar las alertas.");
      })
      .finally(() => {
        pendingLoads.delete(key);
        if (loadingKey === key) loadingKey = "";
        renderNotifications();
      });
    pendingLoads.set(key, promise);
    return promise;
  } catch (error) {
    academicError = error?.message || "No se pudieron cargar las alertas.";
    loadingKey = "";
    renderNotifications();
  }
}

async function goToAlert(item, button, destination) {
  const uid = auth.currentUser?.uid || "";
  const trimesterId = teacherState.trimesterId || "t1";
  const context = teacherState.context?.uid === uid ? teacherState.context : await getTeacherContext(uid);
  const course = context.courses.find((entry) => entry.id === item.courseId);
  if (!course) throw new Error("Ese curso ya no esta asignado al docente.");
  button.disabled = true;
  button.textContent = "Abriendo...";
  let route = "/docente/calificar";
  let activityId = "";
  let subjectId = "";
  if (item.kind === "absence") {
    route = "/docente/resumen";
    if (!await getTeacherSummarySnapshot(context, course, trimesterId)) await refreshTeacherSummarySnapshot(context, course, trimesterId);
  } else if (destination === "regularizacion") {
    route = "/docente/regularizacion";
    if (!await getTeacherNotesSnapshot(context, course, trimesterId)) await refreshTeacherNotesSnapshot(context, course, trimesterId);
    teacherState.regularizationSearch = item.student.nombre;
    teacherState.regularizationReportStudentId = item.student.id;
    subjectId = item.missing[0]?.subjectId || "";
  } else {
    const pending = item.pending[0];
    if (!pending) throw new Error("No quedan actividades pendientes de calificar.");
    activityId = pending.activityId;
    subjectId = pending.subjectId;
    teacherState.gradeScope = pending.date < localDateIso() ? "pendientes" : "dia";
    teacherState.gradeModalActivityId = activityId;
    teacherState.gradeModalClosed = false;
    sessionStorage.setItem("docenteCalificarVista", teacherState.gradeScope);
  }
  teacherState.selectedCourseId = course.id;
  sessionStorage.setItem("docenteCursoId", course.id);
  if (subjectId) {
    teacherState.selectedSubjectId = subjectId;
    sessionStorage.setItem("docenteMateriaId", subjectId);
  }
  teacherState.notificationFocus = { route, studentId: route === "/docente/calificar" ? "" : item.student.id, activityId };
  closeAlertModal();
  if (window.location.hash === `#${route}`) window.dispatchEvent(new Event("hashchange"));
  else window.location.hash = `#${route}`;
}

function stopWatcher() {
  stopWatching?.();
  stopWatching = null;
  if (midnightTimer) clearTimeout(midnightTimer);
  midnightTimer = null;
  watchedUid = "";
  watchedDate = "";
}

function startWatcher(uid) {
  const today = localDateIso();
  if (stopWatching && watchedUid === uid && watchedDate === today) return;
  stopWatcher();
  communications = [];
  communicationsError = "";
  watchedUid = uid;
  watchedDate = today;
  stopWatching = watchActiveCommunications((items) => {
    communications = items;
    communicationsError = "";
    renderNotifications();
  }, (error) => {
    communicationsError = error?.code === "permission-denied" ? "Sin permiso para leer comunicados. Actualiza las reglas de Firestore." : "No se pudieron cargar los comunicados.";
    renderNotifications();
  });
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  midnightTimer = setTimeout(() => {
    if (watchedUid === uid) startWatcher(uid);
  }, midnight.getTime() - now.getTime() + 100);
  renderNotifications();
}

export function bindTeacherNotifications(route) {
  bindingController?.abort();
  if (!route.startsWith("/docente")) {
    stopWatcher();
    backgroundLoadedKeys.clear();
    communications = [];
    communicationsError = "";
    academicError = "";
    loadingKey = "";
    activeAlerts = new Map();
    return;
  }
  const uid = auth.currentUser?.uid || "";
  const panel = document.querySelector("[data-teacher-alert-panel]");
  const modal = document.querySelector("[data-teacher-alert-modal]");
  if (!uid || !panel || !modal) {
    stopWatcher();
    communications = [];
    return;
  }
  bindingController = new AbortController();
  const { signal } = bindingController;
  const setOpen = (open) => {
    panel.classList.toggle("hidden", !open);
    document.querySelectorAll("[data-teacher-alert-toggle]").forEach((button) => button.setAttribute("aria-expanded", String(open)));
    if (open) loadAcademic(academicDirty);
  };
  document.querySelectorAll("[data-teacher-alert-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(panel.classList.contains("hidden"));
    }, { signal });
  });
  document.querySelectorAll('[data-action="open-menu"]').forEach((button) => button.addEventListener("click", () => setOpen(false), { signal }));
  panel.querySelector("[data-teacher-alert-close]")?.addEventListener("click", () => setOpen(false), { signal });
  panel.querySelector("[data-teacher-alert-refresh]")?.addEventListener("click", () => loadAcademic(true), { signal });
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-teacher-alert-id]");
    const item = activeAlerts.get(button?.dataset.teacherAlertId);
    if (item) {
      openAlertModal(item);
      markAlertViewed(item);
    }
  }, { signal });
  modal.addEventListener("click", async (event) => {
    if (event.target === modal || event.target.closest("[data-close-teacher-alert-modal]")) return closeAlertModal();
    const followButton = event.target.closest("[data-alert-follow-up]");
    const goButton = event.target.closest("[data-alert-go]");
    const button = followButton || goButton;
    const item = activeAlerts.get(button?.dataset.alertFollowUp || button?.dataset.alertGo);
    if (!button || !item) return;
    const originalLabel = button.textContent;
    const status = modal.querySelector("[data-teacher-alert-modal-status]");
    try {
      if (followButton) {
        button.disabled = true;
        await markTeacherAbsenceFollowedUp({ studentId: item.student.id, trimesterId: teacherState.trimesterId, lastDate: item.lastDate });
        const academic = readAcademicCache(uid, teacherState.trimesterId);
        if (academic) saveAcademicCache(uid, teacherState.trimesterId, { ...academic, absences: academic.absences.filter((entry) => entry.id !== item.id) });
        closeAlertModal();
        renderNotifications();
      } else {
        await goToAlert(item, button, button.dataset.alertDestination);
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = originalLabel;
      if (status) {
        status.textContent = error?.code === "permission-denied" ? "Sin permiso para guardar el seguimiento. Publica las reglas de Firestore." : (error.message || "No se pudo completar la accion.");
        status.classList.remove("hidden");
      }
    }
  }, { signal });
  document.addEventListener("click", (event) => {
    if (!panel.contains(event.target) && !event.target.closest("[data-teacher-alert-toggle]")) setOpen(false);
  }, { signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { setOpen(false); closeAlertModal(); }
  }, { signal });
  window.addEventListener("teacher-alerts-updated", () => {
    academicDirty = true;
    if (!panel.classList.contains("hidden")) loadAcademic(true);
  }, { signal });
  window.addEventListener("teacher-trimester-changed", () => {
    academicDirty = true;
    renderNotifications();
    loadAcademic(true);
  }, { signal });
  startWatcher(uid);
  renderNotifications();
  if (!backgroundLoadedKeys.has(uid)) {
    backgroundLoadedKeys.add(uid);
    loadAcademic();
  }
}
