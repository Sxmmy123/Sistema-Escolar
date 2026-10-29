import { todayIso, saveTeacherTrimesterPreference } from "../../services/teacherData.js";
import { activeCommunications, watchActiveCommunications } from "../../services/comunicadosDocentes.js";
import { dimensionesInicial, firmaRegistrosInicial, trimestresInicial } from "../../services/modeloInicial.js";
import { crearAccionesActividades } from "./AccionesActividadesInicial.js";
import { crearAccionesAsistenciaInicial } from "./AccionesAsistenciaInicial.js";
import { animarSeleccionActividad } from "./AnimacionRegistroInicial.js";
import { animarCambioAlumnoInicial, medirSeleccionAlumnoInicial } from "./AnimacionAlumnoInicial.js";
import { animarSelectorAlumnosInicial } from "./AnimacionSelectorAlumnoInicial.js";
import { animarSeleccionResumenInicial } from "./AnimacionResumenInicial.js";
import { crearNavegacionMapaInicial } from "./NavegacionMapaInicial.js";
import { generarInformeConIA, geminiInicialDisponible } from "../../services/informeInicialIA.js";
import { crearDatosInicial } from "./datosInicial.js";
import { e, fechaInicial, icon, puedeRegistrarInicial } from "./ComponentesInicial.js";
import { alumnoInicial, cuadriculaAlumnosInicial } from "./SeguimientoInicial.js";
import { estadoInformeInicial } from "./InformeInicial.js";
import { listaResumenInicial, materiasSeguimientoInicial } from "./ResumenesInicial.js";
import { recopilarInformesCursoInicial, selectorImpresionInformesInicial, imprimirInformesCursoInicial } from "./ImpresionInformesInicial.js";
import { exigirTrimestreDocente, puedeRegistrarTrimestre, trimestresDeAsignacion } from "../../services/relevoDocente.js";

export function crearControladorInicial(context, views, dependencies = {}) {
  const data = dependencies.data || crearDatosInicial(context);
  const mapNavigation = crearNavegacionMapaInicial();
  const saveTerm = dependencies.saveTerm || saveTeacherTrimesterPreference;
  const generate = dependencies.generateReport || generarInformeConIA;
  const watch = dependencies.watchCommunications || watchActiveCommunications;
  const date = todayIso().slice(0, 4) === context.gestionId ? todayIso() : `${context.gestionId}-01-01`;
  const drafts = new Map(), notes = new Map(), reports = new Map(), attendanceNotes = new Map();
  const newId = () => data.nuevoId();
  const state = {
    context, data, courseId: context.courses[0]?.id || "", termId: puedeRegistrarTrimestre(context, context.profile?.trimestreActivo) ? context.profile.trimestreActivo : trimestresDeAsignacion(context)[0] || "t1", date,
    route: "/docente", studentId: "", subjectId: "lenguaje", dimension: "ser", message: "", error: false, busy: false, loading: false, loadError: "",
    iaAvailable: dependencies.iaAvailable ?? geminiInicialDisponible(),
    activityId: "", activityLimit: 5, activityView: "board", activityArchive: false, registrationStudentSelected: false, autoSaving: false,
    attendanceMode: "lista", attendanceStudentId: "", attendanceGuidedIndex: 0, attendanceSavingId: "",
    summaryStudentId: "", summaryCategory: "ser", summarySearch: "", summarySubjectId: "all",
    advanceDraft() {
      const key = JSON.stringify([state.courseId, state.termId, state.activityId, alumnoInicial(state)?.id]);
      if (!drafts.has(key)) drafts.set(key, {});
      return drafts.get(key);
    },
    attendanceNote(studentId) {
      const key = JSON.stringify([state.courseId, state.termId, state.date, studentId]);
      if (!attendanceNotes.has(key)) attendanceNotes.set(key, { observacion: data.leer("attendance", state.courseId, state.termId, state.date)?.[studentId]?.observacion || "" });
      return attendanceNotes.get(key);
    },
    noteDraft() {
      const key = JSON.stringify([state.courseId, state.termId, alumnoInicial(state)?.id]);
      if (!notes.has(key)) notes.set(key, { id: newId(), descripcion: "" });
      return notes.get(key);
    },
    reportDraft() {
      const studentId = alumnoInicial(state)?.id;
      const key = JSON.stringify([state.courseId, state.termId, studentId]);
      if (!reports.has(key)) {
        const rows = data.leer("records", state.courseId, state.termId) || [];
        const saved = rows.find((item) => item.tipo === "informe" && item.alumnoId === studentId);
        reports.set(key, { descripcion: saved?.descripcion || "", origen: saved?.origen || "docente", fuentesFirma: saved?.fuentesFirma || firmaRegistrosInicial(rows, studentId) });
      }
      return reports.get(key);
    }
  };
  let bindings = null, stopWatch = null, modalBindings = null, main = null;
  let alive = true, revision = 0, loadRevision = 0;
  let journalEditorOpen = false, redrawAfterJournal = false;
  let activityTransition = null, studentTransition = null, studentPickerTransition = null;
  let summaryTransition = null;
  let communications = [], communicationsError = "";
  const currentView = () => (views[state.route] || views["/docente"])(state);
  const students = () => data.leer("students", state.courseId) || [];
  const records = () => data.leer("records", state.courseId, state.termId) || [];
  const isCurrent = (request) => alive && revision === request;
  const showMessage = (message, error = false) => { state.message = message; state.error = error; };
  const activityActions = crearAccionesActividades({ state, data, dialog, draw, run, assertWritable, selectActivity, generate: dependencies.generateCriteria, refreshIcons: dependencies.refreshIcons });
  const attendanceActions = crearAccionesAsistenciaInicial({ state, data, dialog, draw, run, assertWritable });
  function cancelActivityTransition() {
    activityTransition?.cancel(); activityTransition = null;
  }
  function cancelStudentPickerTransition() {
    studentPickerTransition?.cancel(); studentPickerTransition = null;
  }
  function animateStudentPicker(host, trigger, reverse = false) {
    cancelStudentPickerTransition();
    const transition = (dependencies.animateStudentPicker || animarSelectorAlumnosInicial)(host, trigger, reverse);
    studentPickerTransition = transition;
    return transition.finished.then((completed) => {
      if (studentPickerTransition !== transition) return false;
      studentPickerTransition = null;
      return completed;
    }, () => { if (studentPickerTransition === transition) { transition.cancel(); studentPickerTransition = null; } return false; });
  }
  function selectActivity(button, activate) {
    if (activityTransition) return;
    studentTransition?.cancel(); studentTransition = null;
    const request = revision, host = main;
    const transition = (dependencies.animateActivity || animarSeleccionActividad)(host, button);
    activityTransition = transition;
    transition.finished.then(async (completed) => {
      if (activityTransition !== transition) return;
      activityTransition = null;
      if (!completed || !isCurrent(request) || main !== host) return;
      activate();
      activityTransition = transition;
      const revealed = await (transition.reveal?.(host) ?? true);
      if (activityTransition !== transition) return;
      activityTransition = null;
      const focus = transition.focusTarget?.() || main.querySelector("[data-activity-grid]");
      transition.cancel();
      if (revealed && isCurrent(request) && main === host) focus?.focus({ preventScroll: true });
    }).catch(() => { if (activityTransition === transition) activityTransition = null; }).finally(() => transition.cancel());
  }
  function draw() {
    if (!main || !alive) return;
    if (journalEditorOpen) { redrawAfterJournal = true; return; }
    mapNavigation.guardarPosicion();
    summaryTransition?.cancel(); summaryTransition = null;
    const previousStudent = medirSeleccionAlumnoInicial(main);
    studentTransition?.cancel(); studentTransition = null;
    cancelActivityTransition();
    cancelStudentPickerTransition();
    state.soloContenido = true; main.innerHTML = currentView(); state.soloContenido = false;
    const studentStrip = main.querySelector(".initial-registration-students"), selectedStudent = studentStrip?.querySelector('[aria-pressed="true"]');
    if (selectedStudent && studentStrip.scrollWidth > studentStrip.clientWidth) studentStrip.scrollLeft = Math.max(0, selectedStudent.offsetLeft - 4);
    dependencies.refreshIcons?.();
    mapNavigation.vincular(main);
    studentTransition = animarCambioAlumnoInicial(main, previousStudent);
    attendanceActions.renderGuide();
  }
  function selectSummaryStudent(id, button) {
    if (summaryTransition) return;
    const request = revision, host = main;
    const change = () => {
      if (!isCurrent(request) || main !== host) return;
      state.summaryStudentId = state.summaryStudentId === id ? "" : id; state.summarySubjectId = "all"; draw();
      [...(main.querySelectorAll?.("[data-initial-summary-student]") || [])].find((item) => item.dataset.initialSummaryStudent === id)?.focus({ preventScroll: true });
    };
    const transition = (dependencies.animateSummary || animarSeleccionResumenInicial)(host, button);
    if (!transition) { change(); return; }
    summaryTransition = transition;
    transition.finished.then(async (completed) => {
      if (summaryTransition !== transition || !completed || !isCurrent(request) || main !== host) return;
      summaryTransition = null; change(); summaryTransition = transition;
      const revealed = await transition.reveal(host);
      if (summaryTransition !== transition) return;
      summaryTransition = null;
      if (revealed && isCurrent(request)) transition.focusTarget?.()?.focus({ preventScroll: true });
    }).catch(() => {}).finally(() => { if (summaryTransition === transition) summaryTransition = null; transition.cancel(); });
  }
  function assertWritable() {
    exigirTrimestreDocente(context, state.termId);
    if (!puedeRegistrarInicial(state)) throw new Error("Administracion debe habilitar la gestion para registrar cambios.");
  }
  async function run(operation, success = "") {
    if (state.busy || !alive) return;
    const request = revision, autoSave = state.autoSaving;
    state.busy = true; showMessage(autoSave ? "" : "Procesando..."); draw();
    try { await operation(() => isCurrent(request)); if (isCurrent(request)) showMessage(autoSave ? "" : success); }
    catch (error) { if (isCurrent(request)) showMessage(error?.code === "permission-denied" ? "No se pudo guardar. Verifica la asignacion y publica las reglas actualizadas de Inicial." : error?.message || "No se pudo completar la operacion.", true); }
    finally { if (alive) { state.busy = false; if (!isCurrent(request)) showMessage(""); draw(); } }
  }
  async function loadView(force = false) {
    const ticket = ++loadRevision, request = revision;
    if (!state.courseId || context.errorModalidad || state.route === "/docente/resumenes" && !force) { state.loading = false; state.loadError = ""; draw(); return; }
    const course = state.courseId, term = state.termId, route = state.route, dateKey = state.date;
    state.loading = true; state.loadError = ""; draw();
    try {
      const tasks = [];
      if (route !== "/docente/horario") tasks.push(data.cargar("students", course, "", "", force));
      if (["/docente", "/docente/horario"].includes(route)) tasks.push(data.cargar("schedule", course, "", "", force));
      if (["/docente/actividades", "/docente/registro"].includes(route)) tasks.push(data.cargar("activities", course, term, "", force));
      if (route === "/docente/asistencia") tasks.push(data.cargar("attendance", course, term, dateKey, force));
      else if (route !== "/docente/horario") tasks.push(data.cargar("records", course, term, "", force));
      if (route === "/docente") context.courses.filter((item) => item.id !== course).forEach((item) => tasks.push(data.cargar("students", item.id, "", "", force)));
      await Promise.all(tasks);
      if (!isCurrent(request) || ticket !== loadRevision) return;
      if (!students().some((item) => item.id === state.studentId)) state.studentId = students()[0]?.id || "";
    } catch (error) {
      if (isCurrent(request) && ticket === loadRevision) state.loadError = error.code === "permission-denied" ? "No se pudieron consultar los registros. Verifica los permisos de Inicial." : "No se pudieron cargar los datos. Comprueba la conexion.";
    } finally { if (isCurrent(request) && ticket === loadRevision) { state.loading = false; draw(); } }
  }
  function dialog(title, content, onClose = () => {}, beforeClose = null) {
    cancelStudentPickerTransition();
    modalBindings?.abort(); modalBindings = new AbortController();
    const binding = modalBindings;
    const host = main.querySelector("[data-initial-dialog-host]");
    host.innerHTML = `<div class="initial-dialog-backdrop"><section class="initial-dialog" role="dialog" aria-modal="true" aria-labelledby="initial-dialog-title"><header><h2 id="initial-dialog-title">${e(title)}</h2><button type="button" class="initial-icon-button" data-initial-close aria-label="Cerrar">${icon("x")}</button></header>${content}</section></div>`;
    const element = host.querySelector(".initial-dialog"), previousFocus = document.activeElement;
    let closing = false;
    const finish = () => { if (binding.signal.aborted) return; binding.abort(); host.innerHTML = ""; previousFocus?.focus(); onClose(); };
    const close = () => {
      if (closing || binding.signal.aborted) return;
      closing = true;
      if (!beforeClose) { finish(); return; }
      Promise.resolve().then(() => binding.signal.aborted ? false : beforeClose()).then((completed) => { if (completed !== false) finish(); }, finish);
    };
    host.querySelector("[data-initial-close]").addEventListener("click", close, { signal: modalBindings.signal });
    host.querySelector("[data-initial-cancel-term]")?.addEventListener("click", close, { signal: modalBindings.signal });
    host.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const controls = [...element.querySelectorAll("button:not([disabled]), input, textarea, select, a[href]")], first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }, { signal: modalBindings.signal });
    dependencies.refreshIcons?.(); host.querySelector("button")?.focus();
    return { host, close, signal: modalBindings.signal };
  }
  function confirmTerm(next) {
    if (state.route !== "/docente" || !puedeRegistrarTrimestre(context, next) || !trimestresInicial.some((item) => item.id === next) || next === state.termId || state.busy) return;
    const label = trimestresInicial.find((item) => item.id === next).label, writable = puedeRegistrarInicial(state);
    const { host, close, signal } = dialog("Cambiar trimestre activo", `<p class="initial-dialog-context">Los registros de asistencia, SER, SABER, HACER, bitacora e informe corresponderan a ${e(label)}. Los borradores de otros trimestres se conservan en esta sesion.</p><div class="initial-dialog-actions"><button type="button" class="initial-button" data-initial-cancel-term>Cancelar</button><button type="button" class="initial-button is-primary" data-initial-confirm-term>${icon("check")}Confirmar cambio</button></div>`);
    host.querySelector("[data-initial-confirm-term]").addEventListener("click", () => {
      close(); run(async () => { if (writable) { assertWritable(); await saveTerm(context.uid, next); } if (!alive) return; state.termId = next; if (writable && context.profile) context.profile.trimestreActivo = next; await loadView(); }, "Trimestre actualizado.");
    }, { signal });
  }
  function saveNote() {
    const student = alumnoInicial(state), draft = state.noteDraft();
    const input = { ...draft, cursoId: state.courseId, trimestreId: state.termId, alumnoId: student?.id, tipo: "bitacora", materiaId: "" };
    run(async () => { assertWritable(); await data.guardarRegistro(input); if (draft.descripcion === input.descripcion) { draft.descripcion = ""; draft.id = newId(); } }, "Observacion agregada a la bitacora.");
  }
  function selectStudent() {
    if (!["/docente/informe", "/docente/bitacora"].includes(state.route) || state.busy || studentPickerTransition || !students().length) return;
    const request = revision, route = state.route, animated = route === "/docente/bitacora";
    const trigger = main.querySelector('[data-initial-action="select-student"]');
    let chosenId = "", opening = animated, closing = false;
    const { host, close, signal } = dialog("Seleccionar alumno", cuadriculaAlumnosInicial(state), () => {
      if (!chosenId || !isCurrent(request) || state.route !== route) return;
      state.studentId = chosenId; showMessage(""); draw();
      main.querySelector('[data-initial-action="select-student"]')?.focus({ preventScroll: true });
    }, animated ? () => { closing = true; return animateStudentPicker(host, trigger, true); } : null);
    host.querySelector(".initial-dialog").classList.add("initial-report-student-dialog");
    host.addEventListener("click", (event) => {
      const id = event.target.closest("[data-initial-picker-student]")?.dataset.initialPickerStudent;
      if (!id || opening || closing || state.busy || !isCurrent(request) || !students().some((student) => student.id === id)) return;
      chosenId = id; closing = true; close();
    }, { signal });
    host.querySelector('[data-initial-picker-student][aria-pressed="true"]')?.focus({ preventScroll: true });
    if (animated) animateStudentPicker(host, trigger).then(() => { opening = false; });
  }
  function saveReport() {
    const info = estadoInformeInicial(state);
    const input = { cursoId: state.courseId, trimestreId: state.termId, alumnoId: info.student?.id, tipo: "informe", descripcion: info.draft.descripcion, origen: info.draft.origen, fuentesFirma: info.signature, aprobado: true };
    run(async () => { assertWritable(); await data.guardarRegistro(input); info.draft.fuentesFirma = input.fuentesFirma; }, "Informe aprobado y guardado.");
  }
  function approveReport() {
    const info = estadoInformeInicial(state);
    if (!info.draft.descripcion.trim() || info.draft.descripcion.length > 200) return;
    const { host, close, signal } = dialog("Aprobar informe trimestral", `<p class="initial-dialog-context">${e(info.student.nombre)} · ${e(trimestresInicial.find((item) => item.id === state.termId)?.label)}</p><p class="initial-report-preview">${e(info.draft.descripcion)}</p><div class="initial-dialog-actions"><button type="button" class="initial-button" data-initial-cancel-term>Cancelar</button><button type="button" class="initial-button is-primary" data-initial-confirm-report>${icon("check-check")}Aprobar y guardar</button></div>`);
    host.querySelector("[data-initial-confirm-report]").addEventListener("click", () => { close(); saveReport(); }, { signal });
  }
  function generateReport() {
    if (!state.iaAvailable) return;
    const info = estadoInformeInicial(state); if (!info.sources.length) return;
    const { host, close, signal } = dialog("Generar borrador con Gemini", `<p class="initial-dialog-context">Se enviaran a Google Gemini los registros y comentarios de este estudiante del trimestre seleccionado. Los comentarios pueden contener datos personales. No se envia su CI ni su ficha de cuenta. Se reemplazara el borrador visible, sin aprobarlo ni guardarlo.</p><div class="initial-dialog-actions"><button type="button" class="initial-button" data-initial-cancel-term>Cancelar</button><button type="button" class="initial-button is-primary" data-initial-confirm-generate>${icon("sparkles")}Generar borrador</button></div>`);
    const input = { cursoId: state.courseId, trimestreId: state.termId, alumnoId: info.student.id };
    host.querySelector("[data-initial-confirm-generate]").addEventListener("click", () => {
      close(); run(async (current) => {
        assertWritable(); const result = await generate(context, input); if (!current()) return;
        if (result.fuentesFirma !== firmaRegistrosInicial(records(), input.alumnoId)) await data.cargar("records", input.cursoId, input.trimestreId, "", true);
        if (!current()) return;
        if (result.fuentesFirma !== firmaRegistrosInicial(records(), input.alumnoId)) throw new Error("Los registros cambiaron durante la generacion. Revisa las fuentes y vuelve a intentar.");
        if (typeof result.texto !== "string" || !result.texto.trim() || result.texto.length > 200) throw new Error("Gemini no devolvio un informe valido de hasta 200 caracteres.");
        Object.assign(info.draft, { descripcion: result.texto.trim(), origen: "ia", fuentesFirma: result.fuentesFirma });
      }, "Borrador generado. Pendiente de revision docente.");
    }, { signal });
  }
  async function printCourseReports() {
    if (state.route !== "/docente/informe") return;
    const request = revision, courseId = state.courseId;
    let rows;
    await run(async (current) => {
      const loaded = await Promise.all(trimestresInicial.map(async (term) => [term.id, await data.cargar("records", courseId, term.id, "", true)]));
      if (current()) rows = recopilarInformesCursoInicial(students(), Object.fromEntries(loaded));
    });
    if (!rows || !isCurrent(request) || state.route !== "/docente/informe") return;
    if (!rows.some((row) => Object.values(row.informes).some(Boolean))) { showMessage("No hay informes aprobados y actualizados para imprimir.", true); draw(); return; }
    const course = context.courses.find((item) => item.id === courseId), selected = new Set(rows.map((row) => row.student.id));
    const { host, close, signal } = dialog("Imprimir informes del curso", `<p class="initial-dialog-context">${e(course.nombre)} · Gestion ${e(context.gestionId)}</p>${selectorImpresionInformesInicial(rows)}`);
    host.querySelector(".initial-dialog").classList.add("initial-course-print-dialog");
    const all = host.querySelector("[data-initial-print-all]"), print = host.querySelector("[data-initial-confirm-print]");
    const sync = () => {
      host.querySelectorAll("[data-initial-print-student]").forEach((item) => { item.checked = selected.has(item.dataset.initialPrintStudent); });
      all.checked = selected.size === rows.length; all.indeterminate = selected.size > 0 && selected.size < rows.length;
      host.querySelector("[data-initial-print-count]").textContent = `${selected.size}/${rows.length} seleccionados`;
      print.disabled = !rows.some((row) => selected.has(row.student.id) && Object.values(row.informes).some(Boolean));
    };
    host.addEventListener("change", (event) => {
      if (event.target === all) { selected.clear(); if (all.checked) rows.forEach((row) => selected.add(row.student.id)); }
      else if (event.target.matches("[data-initial-print-student]")) {
        const id = event.target.dataset.initialPrintStudent;
        if (!rows.some((row) => row.student.id === id)) return;
        if (event.target.checked) selected.add(id); else selected.delete(id);
      } else return;
      sync();
    }, { signal });
    print.addEventListener("click", async () => {
      const chosen = rows.filter((row) => selected.has(row.student.id));
      if (!isCurrent(request) || print.disabled || !chosen.length) return;
      print.disabled = true;
      try {
        const loaded = await Promise.all(trimestresInicial.map(async (term) => [term.id, await data.cargar("records", courseId, term.id, "", true)]));
        if (!isCurrent(request) || signal.aborted) return;
        const currentRows = recopilarInformesCursoInicial(chosen.map((row) => row.student), Object.fromEntries(loaded));
        if (JSON.stringify(currentRows) !== JSON.stringify(chosen)) {
          close(); showMessage("Los registros o informes cambiaron. Revisa y aprueba los informes actualizados antes de imprimir.", true); draw(); return;
        }
        close();
        (dependencies.printReports || imprimirInformesCursoInicial)({ rows: currentRows, course, year: context.gestionId, teacher: context.profile?.nombre || "Docente" });
      } catch { if (!isCurrent(request) || signal.aborted) return; close(); showMessage("No se pudieron verificar los informes actuales. Comprueba la conexion e intenta de nuevo.", true); draw(); }
    }, { signal });
    sync();
  }
  function editJournal(id) {
    const record = records().find((item) => item.id === id && item.tipo === "bitacora" && item.docenteUid === context.uid);
    if (state.route !== "/docente/resumenes" || !record || !puedeRegistrarInicial(state)) return;
    const student = students().find((item) => item.id === record.alumnoId), request = revision;
    if (!student) return;
    const { host, close, signal } = dialog("Editar observacion de bitacora", `<p class="initial-dialog-context">${e(student.nombre)}</p><label class="initial-field" for="initial-edit-journal">Observacion</label><textarea id="initial-edit-journal" data-initial-edit-journal-text maxlength="5000" rows="7">${e(record.descripcion)}</textarea><div class="initial-form-footer"><span data-initial-edit-journal-count>${record.descripcion.length}/5000</span></div><p class="initial-status is-error" data-initial-edit-journal-error role="alert" hidden></p><div class="initial-dialog-actions"><button type="button" class="initial-button" data-initial-cancel-term>Cancelar</button><button type="button" class="initial-button is-primary" data-initial-confirm-edit-journal>${icon("save")}Guardar cambios</button></div>`, () => {
      journalEditorOpen = false;
      if (redrawAfterJournal) { redrawAfterJournal = false; draw(); }
    });
    journalEditorOpen = true;
    const text = host.querySelector("[data-initial-edit-journal-text]"), save = host.querySelector("[data-initial-confirm-edit-journal]"), error = host.querySelector("[data-initial-edit-journal-error]");
    text.addEventListener("input", () => { text.value = text.value.slice(0, 5000); host.querySelector("[data-initial-edit-journal-count]").textContent = `${text.value.length}/5000`; save.disabled = !text.value.trim() || text.value === record.descripcion; }, { signal });
    save.disabled = true;
    save.addEventListener("click", async () => {
      if (state.busy || !text.value.trim() || text.value.length > 5000 || !isCurrent(request)) return;
      const input = { id: record.id, cursoId: state.courseId, trimestreId: state.termId, alumnoId: student.id, descripcionAnterior: record.descripcion, descripcion: text.value };
      state.busy = true; text.disabled = true; save.disabled = true; error.hidden = true;
      let saved = false;
      try {
        assertWritable(); await data.editarBitacora(input); saved = true;
        if (isCurrent(request) && !signal.aborted) { close(); showMessage("Observacion de bitacora actualizada."); }
      } catch (failure) {
        if (isCurrent(request) && !signal.aborted) { error.textContent = failure.code === "permission-denied" ? "No se pudo editar. Publica las reglas actualizadas de Bitacora." : failure.message || "No se pudo guardar la observacion."; error.hidden = false; text.disabled = false; save.disabled = false; }
      } finally { state.busy = false; if (alive && (saved || signal.aborted)) draw(); }
    }, { signal });
  }
  function renderCommunications() {
    const current = activeCommunications(communications);
    document.querySelectorAll("[data-teacher-alert-badge]").forEach((badge) => { badge.textContent = String(current.length); badge.classList.toggle("hidden", !current.length); });
    const content = document.querySelector("[data-teacher-alert-content]");
    if (content) content.innerHTML = `<h3 class="initial-communication-title">Avisos de direccion</h3>${communicationsError ? `<p class="p-4 text-sm text-red-700">${e(communicationsError)}</p>` : current.length ? current.map((item) => `<article class="initial-communication"><h4>${e(item.titulo)}</h4><p>${e(item.motivo)}</p><span>${e(fechaInicial(item.fechaEvento))} · ${e(item.horaEvento || "")}</span></article>`).join("") : `<p class="p-4 text-sm text-slate-500">No hay comunicados vigentes.</p>`}`;
  }
  function bindCommunications(signal) {
    const panel = document.querySelector("[data-teacher-alert-panel]"), toggles = [...document.querySelectorAll("[data-teacher-alert-toggle]")];
    const close = () => { panel?.classList.add("hidden"); toggles.forEach((button) => button.setAttribute("aria-expanded", "false")); };
    const startWatch = () => {
      if (stopWatch) return;
      stopWatch = watch((items) => { if (!alive) return; communications = items; communicationsError = ""; renderCommunications(); }, () => { if (!alive) return; communicationsError = "No se pudieron consultar los avisos de direccion."; renderCommunications(); });
    };
    toggles.forEach((button) => button.addEventListener("click", () => { const open = panel.classList.contains("hidden"); close(); if (open) { panel.classList.remove("hidden"); toggles.forEach((item) => item.setAttribute("aria-expanded", "true")); startWatch(); renderCommunications(); } }, { signal }));
    document.querySelector("[data-teacher-alert-close]")?.addEventListener("click", close, { signal });
    document.querySelector("[data-teacher-alert-refresh]")?.addEventListener("click", () => { stopWatch?.(); stopWatch = null; startWatch(); }, { signal });
    document.addEventListener("click", (event) => { if (!panel?.contains(event.target) && !event.target.closest("[data-teacher-alert-toggle]")) close(); }, { signal });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); }, { signal });
    if (!context.errorModalidad) startWatch(); renderCommunications();
  }
  function bind(route) {
    cancelActivityTransition();
    cancelStudentPickerTransition();
    studentTransition?.cancel(); studentTransition = null;
    modalBindings?.abort(); journalEditorOpen = false; redrawAfterJournal = false; bindings?.abort(); bindings = new AbortController(); revision++;
    state.route = route; if (route !== "/docente/asistencia") attendanceActions.reset(); main = document.querySelector("[data-teacher-ui]"); if (!main) return;
    const { signal } = bindings;
    document.querySelectorAll("[data-current-user-name]").forEach((element) => { element.textContent = context.profile?.nombre || "Docente"; });
    main.addEventListener("click", (event) => {
      const button = event.target.closest("button"); if (!button || button.disabled || state.busy || activityTransition || summaryTransition || context.errorModalidad) return;
      if (activityActions.click(button)) return;
      if (attendanceActions.click(button)) return;
      const targetCourse = button.dataset.initialCourse;
      if (targetCourse && context.courses.some((item) => item.id === targetCourse)) { attendanceActions.reset(); state.courseId = targetCourse; state.summaryStudentId = ""; state.summarySearch = ""; state.summarySubjectId = "all"; revision++; showMessage(""); loadView(); return; }
      if (button.dataset.initialSelectTerm) { confirmTerm(button.dataset.initialSelectTerm); return; }
      if (button.dataset.initialSubject) { state.subjectId = button.dataset.initialSubject === "general" ? "" : button.dataset.initialSubject; draw(); return; }
      if (button.dataset.initialDimension && dimensionesInicial.some((item) => item.id === button.dataset.initialDimension)) { state.dimension = button.dataset.initialDimension; draw(); return; }
      if (button.dataset.initialSummaryStudent && students().some((item) => item.id === button.dataset.initialSummaryStudent)) {
        selectSummaryStudent(button.dataset.initialSummaryStudent, button); return;
      }
      if (button.dataset.initialSummaryCategory && ["ser", "saber", "hacer", "bitacora"].includes(button.dataset.initialSummaryCategory)) { state.summaryCategory = button.dataset.initialSummaryCategory; state.summarySubjectId = "all"; draw(); main.querySelector(`[data-initial-summary-category="${state.summaryCategory}"]`)?.focus({ preventScroll: true }); return; }
      if (button.dataset.initialSummarySubject) {
        const id = button.dataset.initialSummarySubject;
        if (id !== "all" && !materiasSeguimientoInicial(records(), state.summaryStudentId, state.summaryCategory).some((item) => item.id === id)) return;
        state.summarySubjectId = id; draw(); main.querySelector(`[data-initial-summary-subject="${id}"]`)?.focus({ preventScroll: true }); return;
      }
      if (button.dataset.initialEditJournal) { editJournal(button.dataset.initialEditJournal); return; }
      if (button.dataset.initialMapPan) { mapNavigation.desplazar(button.dataset.initialMapPan); return; }
      const action = button.dataset.initialAction;
      if (action === "load" || action === "retry") loadView(action === "load");
      if (action === "select-student") selectStudent();
      if (action === "approve-report") approveReport();
      if (action === "generate-report") generateReport();
      if (action === "print-course-reports") printCourseReports();
    }, { signal });
    main.addEventListener("scroll", (event) => mapNavigation.alDesplazar(event.target), { signal, capture: true });
    main.addEventListener("change", (event) => {
      if (state.busy) return;
      if (event.target.matches("[data-initial-date]") && /^20\d{2}-\d{2}-\d{2}$/.test(event.target.value) && event.target.value.startsWith(context.gestionId)) { attendanceActions.reset(); state.date = event.target.value; revision++; showMessage(""); loadView(); }
    }, { signal });
    main.addEventListener("input", (event) => {
      if (state.busy) return; const target = event.target;
      if (attendanceActions.input(target)) return;
      if (target.matches("[data-initial-summary-search]") && state.route === "/docente/resumenes") {
        state.summarySearch = target.value;
        summaryTransition?.cancel(); summaryTransition = null;
        const results = main.querySelector("[data-initial-summary-results]");
        if (results) { results.innerHTML = listaResumenInicial(state); dependencies.refreshIcons?.(); }
        return;
      }
      if (target.matches("[data-initial-journal-note]")) {
        state.noteDraft().descripcion = target.value.slice(0, 5000);
        const count = main.querySelector("[data-initial-note-count]"), save = main.querySelector("[data-initial-save-note]");
        if (count) count.textContent = `${target.value.length}/5000`;
        if (save) save.disabled = !puedeRegistrarInicial(state) || !target.value.trim();
      }
      if (target.matches("[data-initial-report-text]")) {
        target.value = target.value.slice(0, 200); state.reportDraft().descripcion = target.value;
        const count = main.querySelector("[data-initial-report-count]"), status = main.querySelector("[data-initial-report-status]");
        if (count) count.textContent = `${target.value.length}/200 caracteres`;
        const info = estadoInformeInicial(state);
        if (status) { status.textContent = info.status; status.classList.toggle("is-approved", info.printable); }
        main.querySelectorAll('[data-initial-action="approve-report"]').forEach((control) => { control.disabled = !puedeRegistrarInicial(state) || !target.value.trim(); });
      }
    }, { signal });
    main.addEventListener("submit", (event) => { if (!event.target.matches("[data-initial-note-form]")) return; event.preventDefault(); if (!state.busy) saveNote(); }, { signal });
    bindCommunications(signal); loadView();
  }
  return {
    state, vista(route) { if (state.route !== route && !state.busy) showMessage(""); state.route = route; return currentView(); }, vincular: bind,
    desmontar() { alive = false; revision++; loadRevision++; cancelActivityTransition(); cancelStudentPickerTransition(); summaryTransition?.cancel(); summaryTransition = null; studentTransition?.cancel(); modalBindings?.abort(); bindings?.abort(); stopWatch?.(); mapNavigation.desmontar(); data.desmontar(); drafts.clear(); notes.clear(); reports.clear(); attendanceNotes.clear(); main = null; }
  };
}
