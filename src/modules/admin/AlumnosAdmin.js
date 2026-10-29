import { createIcons, icons } from "lucide";
import { auth } from "../../firebase/client.js";
import { COURSES, findCourse } from "../../data/catalog.js";
import { importStudents, listStudents } from "../../services/adminData.js";
import { createStudentAuthAccess, setStudentAccessActive } from "../../services/studentAccess.js";
import { registrarTablaAlumnos } from "../../services/registroAlumnos.js";
import { generateStudentPin, initialStudentPassword, normalizeStudentSex } from "../../services/identidadAlumno.js";
import { MAX_STUDENT_ROWS, STUDENT_TABLE_FIELDS, hasStudentData, newStudentRow, pasteStudentCells, sortStudentsByName, validateStudentRows } from "../../services/tablaAlumnos.js";
import { openStudentAccessMigration } from "./AccesosAlumnos.js";
import { openStudentPasswordReset } from "./RestablecerClaveAlumno.js";
import { safeAudit } from "../../services/auditData.js";
import { icon } from "../../ui/dom.js";
import "./AlumnosAdmin.css";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const SEX_LABELS = { F: "Femenino", M: "Masculino" };
const SEX_HELP = "F: Femenino; M: Masculino";
let selectedCourse = COURSES[0].id;

export function AlumnosAdminPanel() {
  return `<section class="students-admin" data-alumnos-admin>
    <div class="students-navigation">
      <div class="students-views" role="tablist" aria-label="Vista de alumnos">
        <button type="button" role="tab" id="students-register-tab" aria-selected="true" aria-controls="students-register-view" data-students-view="register">${icon("table-2")} Registrar</button>
        <button type="button" role="tab" id="students-list-tab" aria-selected="false" aria-controls="students-list-view" data-students-view="list">${icon("users")} Alumnos <span data-registered-count></span></button>
      </div>
      <label class="students-course-label">Curso<select data-students-course aria-label="Curso de alumnos">${COURSES.map((course) => `<option value="${course.id}">${escape(course.nombre)}</option>`).join("")}</select></label>
    </div>
    <section id="students-register-view" role="tabpanel" aria-labelledby="students-register-tab" data-students-register>
      <div class="students-toolbar">
        <label class="students-password-mode">Contrasena inicial<select data-students-password-mode aria-label="Contrasena inicial"><option value="ci">Mismo CI</option><option value="default">123456</option><option value="random">Aleatoria: 6 digitos</option></select></label>
        <div class="students-tools">
          <button type="button" class="students-icon-button" data-students-password-visible aria-label="Ocultar contrasenas" title="Ocultar contrasenas" aria-pressed="true">${icon("eye")}</button>
          <button type="button" class="students-icon-button" data-students-download aria-label="Descargar credenciales nuevas" title="Descargar credenciales nuevas" disabled>${icon("download")}</button>
          <button type="button" data-students-add>${icon("plus")} Anadir fila</button>
        </div>
      </div>
      <div class="students-sheet" data-students-sheet>
        <table class="students-register-table" aria-label="Registro de alumnos">
          <colgroup><col class="students-number-col"><col class="students-name-col"><col class="students-ci-col"><col class="students-password-col"><col class="students-email-col"><col class="students-sex-col"><col class="students-action-col"></colgroup>
          <thead><tr><th scope="col">N</th><th scope="col">Nombre completo</th><th scope="col">CI / Usuario</th><th scope="col">Contrasena</th><th scope="col">Correo (opcional)</th><th scope="col" title="${SEX_HELP}">Sexo</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody data-students-sheet-rows></tbody>
        </table>
      </div>
      <div class="students-save-bar"><span data-students-draft-count></span><button type="button" class="students-primary-button" data-students-save>${icon("save")} Guardar alumnos</button></div>
      <p class="students-security-note">Contrasenas iniciales temporales. El CI y las claves de 6 digitos no son adecuados para datos reales.</p>
    </section>
    <section id="students-list-view" role="tabpanel" aria-labelledby="students-list-tab" data-students-registered hidden>
      <div class="students-toolbar">
        <label class="students-search">${icon("search")}<input type="search" data-students-search aria-label="Buscar alumno" placeholder="Buscar alumno o CI"></label>
        <select data-students-filter aria-label="Estado de alumnos"><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
        <div class="students-tools"><button type="button" data-students-complete hidden>${icon("shield-check")} Completar accesos</button><button type="button" class="students-icon-button" data-students-refresh title="Actualizar alumnos" aria-label="Actualizar alumnos">${icon("refresh-cw")}</button></div>
      </div>
      <div class="students-sheet">
        <table class="students-list-table" aria-label="Alumnos registrados"><thead><tr><th scope="col">N</th><th scope="col">Alumno</th><th scope="col">CI / Usuario</th><th scope="col" title="${SEX_HELP}">Sexo</th><th scope="col">Correo</th><th scope="col">Acceso</th><th scope="col">Estado</th></tr></thead><tbody data-students-list-rows></tbody></table>
      </div>
      <p class="students-list-count" data-students-list-count></p>
    </section>
    <p class="students-status" role="status" aria-live="polite" data-students-page-status hidden></p>
  </section>`;
}

export function bindAlumnosAdmin() {
  const root = document.querySelector("[data-alumnos-admin]");
  if (!root) return;
  const adminUid = auth.currentUser?.uid;
  const $ = (selector) => root.querySelector(selector);
  const drafts = new Map(), cache = new Map(), errors = new Map(), loading = new Map();
  let mode = "ci", view = "register", busy = false, showPasswords = true, changingState = false, resettingPassword = false;
  const rows = () => {
    if (!drafts.has(selectedCourse)) drafts.set(selectedCourse, Array.from({ length: 6 }, () => newStudentRow(mode)));
    return drafts.get(selectedCourse);
  };
  const sessionActive = () => root.isConnected && auth.currentUser?.uid === adminUid;
  const status = (text, error = false) => {
    if (!root.isConnected) return;
    const node = $("[data-students-page-status]");
    node.textContent = text; node.hidden = !text; node.dataset.error = String(error);
  };
  const updateCount = () => {
    const count = rows().filter((row) => !row.saved && hasStudentData(row)).length;
    $("[data-students-draft-count]").textContent = `${count} alumno${count === 1 ? "" : "s"} por guardar`;
    $("[data-students-save]").disabled = busy || !count;
    $("[data-students-download]").disabled = busy || ![...drafts.values()].flat().some((row) => row.saved && row.newPassword);
  };
  const renderSheet = (focus = null) => {
    $("[data-students-sheet-rows]").innerHTML = rows().map((row, index) => {
      const rowErrors = errors.get(row.key) || [];
      const label = `${index + 1}`;
      const errorMessage = rowErrors.join(" ") || (row.error ? row.status : "");
      const errorAttrs = errorMessage ? `aria-invalid="true" aria-describedby="students-error-${row.key}"` : "";
      const cell = (field) => `<input data-sheet-cell="${field}" data-row-key="${row.key}" aria-label="${field === "nombre" ? "Nombre completo" : field === "password" ? "Contrasena" : field === "correo" ? "Correo" : "CI"} fila ${label}" value="${escape(row[field])}" type="${field === "password" && !showPasswords ? "password" : field === "correo" ? "email" : "text"}" autocomplete="off" ${row.saved ? "readonly" : ""} ${busy ? "disabled" : ""} ${errorAttrs} ${field === "password" ? 'minlength="6"' : ""}>`;
      const sexo = normalizeStudentSex(row.sexo);
      const sexCell = `<select data-sheet-cell="sexo" data-row-key="${row.key}" aria-label="Sexo fila ${label}" title="${SEX_LABELS[sexo] || SEX_HELP}" ${busy || row.saved ? "disabled" : ""} ${errorAttrs}><option value="" title="Sin indicar" ${!sexo ? "selected" : ""}>-</option><option value="F" title="Femenino" aria-label="Femenino" ${sexo === "F" ? "selected" : ""}>F</option><option value="M" title="Masculino" aria-label="Masculino" ${sexo === "M" ? "selected" : ""}>M</option>${sexo && !["M", "F"].includes(sexo) ? `<option value="${escape(sexo)}" selected>${escape(sexo)}</option>` : ""}</select>`;
      return `<tr data-sheet-row="${row.key}" data-saved="${row.saved}" data-error="${Boolean(errorMessage)}"><td class="students-row-number">${label}</td><td>${cell("nombre")}</td><td>${cell("ci")}</td><td><div class="students-password-cell">${cell("password")}${row.saved ? "" : `<button type="button" class="students-cell-button" data-students-random="${row.key}" aria-label="Generar contrasena aleatoria fila ${label}" title="Generar 6 digitos" ${busy ? "disabled" : ""}>${icon("dices")}</button>`}</div></td><td>${cell("correo")}</td><td>${sexCell}</td><td><button type="button" class="students-cell-button" data-students-remove="${row.key}" title="${row.saved ? "Quitar de esta vista" : "Quitar fila"}" aria-label="Quitar fila ${label}" ${busy ? "disabled" : ""}>${icon("x")}</button></td></tr>${errorMessage ? `<tr class="students-row-error" data-sheet-error="${row.key}"><td colspan="7" id="students-error-${row.key}">Fila ${label}: ${escape(errorMessage)}</td></tr>` : ""}`;
    }).join("");
    createIcons({ icons }); updateCount();
    if (focus) $("[data-students-sheet-rows]").querySelector(`[data-row-key="${focus.key}"][data-sheet-cell="${focus.field}"]`)?.focus();
  };
  const renderList = () => {
    const students = cache.get(selectedCourse) || [];
    const query = $("[data-students-search]").value.trim().toLocaleLowerCase("es");
    const filter = $("[data-students-filter]").value;
    const filtered = sortStudentsByName(students).filter((student) => `${student.nombre} ${student.ci}`.toLocaleLowerCase("es").includes(query) && (filter === "all" || (filter === "active") === (student.activo !== false)));
    $("[data-registered-count]").textContent = students.length ? String(students.length) : "";
    $("[data-students-complete]").hidden = !students.some((student) => !student.authUid && student.activo !== false);
    $("[data-students-list-rows]").innerHTML = filtered.length ? filtered.map((student, index) => {
      const active = student.activo !== false;
      const sexo = normalizeStudentSex(student.sexo);
      const sexText = SEX_LABELS[sexo] ? `<abbr title="${SEX_LABELS[sexo]}" aria-label="${SEX_LABELS[sexo]}">${sexo}</abbr>` : "-";
      return `<tr><td class="students-row-number">${index + 1}</td><td class="students-list-name">${escape(student.nombre)}</td><td class="students-list-ci">${escape(student.ci)}</td><td>${sexText}</td><td>${escape(student.correo || "-")}</td><td><div class="students-access-actions"><span class="students-access-state" data-ready="${Boolean(student.authUid)}">${student.authUid ? "Creado" : "Pendiente"}</span>${student.authUid ? `<button type="button" class="students-cell-button" data-students-reset-password="${escape(student.id)}" aria-label="Restablecer contrasena de ${escape(student.nombre)}" title="Restablecer contrasena" ${busy ? "disabled" : ""}>${icon("key-round")}</button>` : ""}</div></td><td><label class="students-switch"><input type="checkbox" role="switch" data-students-active="${escape(student.id)}" aria-label="Acceso activo de ${escape(student.nombre)}" ${active ? "checked" : ""} ${busy ? "disabled" : ""}><span class="students-switch-track" aria-hidden="true"></span><span data-students-active-label>${active ? "Activo" : "Inactivo"}</span></label></td></tr>`;
    }).join("") : '<tr><td colspan="7" class="students-empty">No hay alumnos para mostrar.</td></tr>';
    $("[data-students-list-count]").textContent = `${filtered.length} de ${students.length} alumnos`;
    createIcons({ icons });
  };
  const loadList = async (force = false) => {
    const courseId = selectedCourse;
    if (!force && cache.has(courseId)) { renderList(); return; }
    $("[data-students-list-rows]").innerHTML = '<tr><td colspan="7" class="students-empty">Cargando alumnos...</td></tr>';
    if (force || !loading.has(courseId)) loading.set(courseId, listStudents(courseId));
    const request = loading.get(courseId);
    try {
      const students = await request;
      if (!sessionActive() || loading.get(courseId) !== request) return;
      cache.set(courseId, students);
      if (selectedCourse === courseId) renderList();
    } catch (error) {
      if (sessionActive() && selectedCourse === courseId && loading.get(courseId) === request) {
        $("[data-students-list-rows]").innerHTML = '<tr><td colspan="7" class="students-empty">No se pudo cargar la lista.</td></tr>';
        status(error.message, true);
      }
    } finally { if (loading.get(courseId) === request) loading.delete(courseId); }
  };
  const setBusy = (value) => {
    busy = value;
    root.querySelectorAll("button, select, input").forEach((control) => { control.disabled = value; });
    updateCount();
  };
  const confirmSave = (count, course) => new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "students-confirm-dialog";
    dialog.setAttribute("aria-labelledby", "students-confirm-heading");
    dialog.innerHTML = `<header><h2 id="students-confirm-heading">Guardar alumnos</h2><button type="button" data-cancel class="students-icon-button" title="Cancelar" aria-label="Cancelar">${icon("x")}</button></header><p>${count} alumno${count === 1 ? "" : "s"} en <strong>${escape(course.nombre)}</strong></p><p>Se guardaran los registros y se crearan sus accesos. Las cuentas existentes conservaran su contrasena.</p><footer><button type="button" data-cancel>Cancelar</button><button type="button" class="students-primary-button" data-confirm>Confirmar registro</button></footer>`;
    document.body.appendChild(dialog); dialog.showModal(); createIcons({ icons });
    let finished = false;
    const finish = (value) => { if (finished) return; finished = true; dialog.close(); dialog.remove(); resolve(value); };
    dialog.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => finish(false)));
    dialog.querySelector("[data-confirm]").addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
  });
  const confirmStateChange = (student, active, course) => new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    const action = active ? "Habilitar" : "Deshabilitar";
    dialog.className = "students-confirm-dialog";
    dialog.setAttribute("aria-labelledby", "students-state-heading");
    dialog.setAttribute("aria-describedby", "students-state-description");
    dialog.innerHTML = `<header><h2 id="students-state-heading">${action} alumno</h2><button type="button" data-cancel class="students-icon-button" title="Cancelar" aria-label="Cerrar confirmacion">${icon("x")}</button></header><p><strong>${escape(student.nombre)}</strong><br>${escape(course.nombre)}</p><p id="students-state-description">${active ? "El alumno volvera a tener acceso al sistema y figurara como activo en el curso." : "El alumno no podra ingresar al sistema y figurara como inactivo en el curso. Sus notas y asistencias se conservaran."}</p><footer><button type="button" data-cancel autofocus>Cancelar</button><button type="button" class="${active ? "students-primary-button" : "students-danger-button"}" data-confirm>Si, ${action.toLowerCase()}</button></footer>`;
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      dialog.close(); dialog.remove(); resolve(value);
    };
    dialog.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => finish(false)));
    dialog.querySelector("[data-confirm]").addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    dialog.addEventListener("close", () => finish(false));
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) finish(false);
    });
    document.body.appendChild(dialog); dialog.showModal(); createIcons({ icons });
    dialog.querySelector("footer [data-cancel]").focus();
  });

  $("[data-students-course]").value = selectedCourse;
  $("[data-students-course]").addEventListener("change", (event) => {
    selectedCourse = event.target.value; status(""); renderSheet();
    $("[data-registered-count]").textContent = cache.get(selectedCourse)?.length || "";
    if (view === "list") loadList();
  });
  root.querySelectorAll("[data-students-view]").forEach((button) => button.addEventListener("click", () => {
    view = button.dataset.studentsView;
    root.querySelectorAll("[data-students-view]").forEach((tab) => tab.setAttribute("aria-selected", String(tab === button)));
    $("[data-students-register]").hidden = view !== "register";
    $("[data-students-registered]").hidden = view !== "list";
    status(""); if (view === "list") loadList();
  }));
  $("[data-students-password-mode]").addEventListener("change", (event) => {
    mode = event.target.value;
    for (const row of rows()) if (!row.saved && row.autoPassword) row.password = initialStudentPassword(row.ci, mode);
    renderSheet();
  });
  $("[data-students-password-visible]").addEventListener("click", (event) => {
    showPasswords = !showPasswords;
    const button = event.currentTarget;
    button.setAttribute("aria-pressed", String(showPasswords));
    button.title = showPasswords ? "Ocultar contrasenas" : "Mostrar contrasenas";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = icon(showPasswords ? "eye" : "eye-off"); renderSheet();
  });
  $("[data-students-add]").addEventListener("click", () => {
    if (rows().length >= MAX_STUDENT_ROWS) { status("La tabla admite hasta 200 filas por curso.", true); return; }
    const row = newStudentRow(mode); rows().push(row); renderSheet({ key: row.key, field: "nombre" });
  });
  root.addEventListener("input", (event) => {
    const input = event.target.closest("[data-sheet-cell]");
    if (!input) return;
    const row = rows().find((item) => item.key === input.dataset.rowKey);
    if (!row || row.saved || busy) return;
    const field = input.dataset.sheetCell;
    row[field] = input.value; row.status = ""; row.error = false; errors.delete(row.key);
    if (field === "sexo") input.title = SEX_LABELS[input.value] || SEX_HELP;
    if (field === "password") row.autoPassword = false;
    if (field === "ci" && row.autoPassword && mode !== "random") {
      row.password = initialStudentPassword(row.ci, mode);
      $("[data-students-sheet-rows]").querySelector(`[data-row-key="${row.key}"][data-sheet-cell="password"]`).value = row.password;
    }
    const tr = input.closest("tr"); tr.dataset.error = "false";
    tr.querySelectorAll("[aria-invalid]").forEach((cell) => { cell.removeAttribute("aria-invalid"); cell.removeAttribute("aria-describedby"); });
    $(`[data-sheet-error="${row.key}"]`)?.remove();
    updateCount();
  });
  root.addEventListener("paste", (event) => {
    const input = event.target.closest("[data-sheet-cell]");
    const text = event.clipboardData?.getData("text/plain") || "";
    if (!input || !/[\t\r\n]/.test(text) || busy) return;
    event.preventDefault();
    try {
      const index = rows().findIndex((row) => row.key === input.dataset.rowKey);
      const result = pasteStudentCells(rows(), text, index, STUDENT_TABLE_FIELDS.indexOf(input.dataset.sheetCell), mode);
      drafts.set(selectedCourse, result);
      result.forEach((row) => errors.delete(row.key));
      status(""); renderSheet({ key: input.dataset.rowKey, field: input.dataset.sheetCell });
    } catch (error) { status(error.message, true); }
  });
  root.addEventListener("keydown", (event) => {
    const input = event.target.closest("[data-sheet-cell]");
    if (!input || busy || !["Enter", "Tab", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    if (input.tagName === "SELECT" && event.key !== "Tab") return;
    const fields = STUDENT_TABLE_FIELDS;
    let rowIndex = rows().findIndex((row) => row.key === input.dataset.rowKey), column = fields.indexOf(input.dataset.sheetCell);
    if (event.key === "Tab") { column += event.shiftKey ? -1 : 1; if (column >= fields.length) { column = 0; rowIndex++; } else if (column < 0) { column = fields.length - 1; rowIndex--; } }
    else rowIndex += event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1;
    if (rowIndex < 0 || rowIndex >= MAX_STUDENT_ROWS) return;
    event.preventDefault();
    if (rowIndex >= rows().length) { const row = newStudentRow(mode); rows().push(row); renderSheet(); }
    $("[data-students-sheet-rows]").querySelector(`[data-row-key="${rows()[rowIndex].key}"][data-sheet-cell="${fields[column]}"]`)?.focus();
  });
  root.addEventListener("click", (event) => {
    const random = event.target.closest("[data-students-random]"), remove = event.target.closest("[data-students-remove]");
    if (busy) return;
    if (random) { const row = rows().find((item) => item.key === random.dataset.studentsRandom); row.password = generateStudentPin(); row.autoPassword = false; row.error = false; row.status = ""; errors.delete(row.key); renderSheet({ key: row.key, field: "password" }); }
    if (remove) { const index = rows().findIndex((row) => row.key === remove.dataset.studentsRemove); errors.delete(rows()[index].key); rows().splice(index, 1); if (!rows().length) rows().push(newStudentRow(mode)); renderSheet(); }
  });
  $("[data-students-save]").addEventListener("click", async () => {
    if (busy || !sessionActive()) return;
    const course = findCourse(selectedCourse), { entries, errors: validationErrors } = validateStudentRows(rows());
    errors.clear(); validationErrors.forEach((messages, key) => errors.set(key, messages));
    if (errors.size) { renderSheet(); status("Corrige las filas marcadas antes de guardar.", true); return; }
    if (!entries.length) return;
    setBusy(true);
    try {
      if (!await confirmSave(entries.length, course) || !sessionActive()) return;
      status("Guardando registros y accesos...");
      const results = await registrarTablaAlumnos(course, rows(), {
        importar: importStudents, crearAcceso: createStudentAuthAccess, isSessionActive: sessionActive,
        onProgress: (current, total, key) => { const row = rows().find((item) => item.key === key); row.status = "Creando acceso..."; status(`Preparando ${current} de ${total}...`); renderSheet(); }
      });
      if (!sessionActive()) return;
      for (const result of results) {
        const row = rows().find((item) => item.key === result.key);
        row.nombre = result.student.nombre; row.ci = result.student.ci; row.saved = result.success;
        row.error = !result.success;
        row.status = result.success ? result.created ? "Registro y acceso creados" : "Ya registrado; clave sin cambios" : `Acceso pendiente: ${result.error}`;
        if (result.success) { row.password = result.password || ""; row.newPassword = result.password || ""; }
      }
      cache.delete(course.id); renderSheet();
      const completed = results.filter((result) => result.success).length;
      status(`${completed} de ${results.length} accesos listos.${completed < results.length ? " Las filas pendientes pueden reintentarse sin duplicar alumnos." : ""}`, completed < results.length);
      await safeAudit({ tipo: "alumnos", accion: "registrar_con_acceso", detalle: `Registro de alumnos en ${course.nombre}`, datos: { cursoId: course.id, cantidad: results.length, accesosListos: completed, pendientes: results.length - completed } });
      if (sessionActive()) await loadList(true);
    } catch (error) { status(error.message || "No se pudo guardar el registro.", true); }
    finally { if (root.isConnected) { setBusy(false); renderSheet(); renderList(); } }
  });
  $("[data-students-download]").addEventListener("click", () => {
    const entries = [...drafts.entries()].flatMap(([courseId, records]) => records.filter((row) => row.saved && row.newPassword).map((row) => [findCourse(courseId).nombre, row.nombre, row.ci, row.newPassword]));
    const safeCell = (value) => String(value).replace(/[\t\r\n]/g, " ").replace(/^[=+@-]/, "'$&");
    const text = ["CREDENCIALES PRIVADAS", "Curso\tAlumno\tUsuario\tContrasena", ...entries.map((entry) => entry.map(safeCell).join("\t"))].join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })), link = document.createElement("a");
    link.href = url; link.download = "credenciales-alumnos-privadas.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("[data-students-search]").addEventListener("input", renderList);
  $("[data-students-filter]").addEventListener("change", renderList);
  $("[data-students-refresh]").addEventListener("click", () => loadList(true));
  $("[data-students-complete]").addEventListener("click", () => openStudentAccessMigration(findCourse(selectedCourse), () => loadList(true)));
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-students-reset-password]");
    if (!button || busy || resettingPassword || !sessionActive()) return;
    const courseId = selectedCourse, student = cache.get(courseId)?.find((item) => item.id === button.dataset.studentsResetPassword);
    if (!student?.authUid) return;
    resettingPassword = true;
    try {
      const done = await openStudentPasswordReset({ student, courseName: findCourse(courseId).nombre, root, isSessionActive: sessionActive, trigger: button });
      if (done && sessionActive()) {
        status("Contrasena temporal asignada.");
        await safeAudit({ tipo: "alumnos", accion: "restablecer_contrasena", detalle: "Asigno una clave temporal a un alumno", datos: { alumnoId: student.id, cursoId } });
      }
    } finally { resettingPassword = false; }
  });
  root.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-students-active]");
    if (!input || !sessionActive()) return;
    const courseId = selectedCourse, student = cache.get(courseId)?.find((item) => item.id === input.dataset.studentsActive);
    if (!student) return;
    const nextActive = input.checked;
    input.checked = student.activo !== false;
    if (busy || changingState || nextActive === input.checked) return;
    changingState = true; input.disabled = true;
    try {
      if (!await confirmStateChange(student, nextActive, findCourse(courseId)) || !sessionActive() || selectedCourse !== courseId) return;
      await setStudentAccessActive(student, nextActive);
      student.activo = nextActive;
      await safeAudit({ tipo: "alumnos", accion: nextActive ? "habilitar" : "retirar", detalle: `Actualizo el estado del alumno ${student.id}`, datos: { alumnoId: student.id, activo: nextActive, cursoId } });
      if (sessionActive() && selectedCourse === courseId) { renderList(); status(nextActive ? "Alumno activo." : "Alumno inactivo."); }
    } catch (error) { if (sessionActive()) { input.checked = student.activo !== false; status(error.message, true); } }
    finally {
      changingState = false;
      if (input.isConnected) { input.disabled = busy; input.focus(); }
    }
  });
  renderSheet();
}
