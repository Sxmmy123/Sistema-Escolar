import { COURSES, DAYS, SUBJECTS, findCourse, findSubject, periodsForCourse } from "../../data/catalog.js";
import { getAdminCounts, getAllSchedules, getSchedule, importSchedulesPayload, importStudents, listStudents, saveScheduleCell, seedSchoolCatalog, setStudentActive, saveTeacherAssignments } from "../../services/adminData.js";
import { createSystemUser, listUsersByRole } from "../../services/users.js";
import { ensureStudentLocalAccess, setStudentAccessActive } from "../../services/studentAccess.js";
import { listAudit, safeAudit } from "../../services/auditData.js";

const state = {
  studentsCourseId: COURSES[0].id,
  scheduleCourseId: COURSES[0].id,
  selectedSubjectId: "",
  schedule: null
};

const roleLabels = {
  docente: "docente",
  director: "director"
};

function statusFor(form, selector, message, type = "info") {
  const status = form.querySelector(selector);
  if (!status) return;
  const tone = type === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-green-200 bg-green-50 text-green-700";
  status.className = `mt-3 rounded-xl border px-3 py-2 text-xs font-bold sm:mt-4 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm ${tone}`;
  status.textContent = message;
}

function updateTabs(container, activeCourseId) {
  container?.querySelectorAll("button[data-course-id]").forEach((button) => {
    const active = button.dataset.courseId === activeCourseId;
    button.className = `shrink-0 rounded-xl border px-3 py-2 text-xs font-black transition sm:rounded-2xl sm:px-4 sm:text-sm ${active ? "border-school-navy bg-school-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  });
}

function renderUserRows(role, users) {
  const tbody = document.querySelector(`[data-user-list="${role}"]`);
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = `<tr><td class="px-4 py-4 font-bold text-slate-500" colspan="5">Todavia no hay ${roleLabels[role] || "usuarios"} registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((user) => `
    <tr>
      <td class="px-3 py-2 font-black text-slate-800 sm:px-4 sm:py-3">${user.nombre || "Sin nombre"}</td>
      <td class="px-3 py-2 font-semibold text-slate-600 sm:px-4 sm:py-3">${user.usuario || "-"}</td>
      <td class="px-3 py-2 font-semibold text-slate-600 sm:px-4 sm:py-3">${user.correoRecuperacion || "-"}</td>
      <td class="px-3 py-2 font-semibold text-slate-600 sm:px-4 sm:py-3">${user.rol || role}</td>
      <td class="px-3 py-2 sm:px-4 sm:py-3"><span class="rounded-full ${user.activo === false ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"} px-2.5 py-1 text-[11px] font-black sm:px-3 sm:text-xs">${user.activo === false ? "Inactivo" : "Activo"}</span></td>
    </tr>
  `).join("");
}

async function refreshUsers(role) {
  const tbody = document.querySelector(`[data-user-list="${role}"]`);
  if (tbody) tbody.innerHTML = `<tr><td class="px-4 py-4 font-bold text-slate-500" colspan="5">Cargando...</td></tr>`;

  try {
    const users = await listUsersByRole(role);
    renderUserRows(role, users);
  } catch (error) {
    if (tbody) tbody.innerHTML = `<tr><td class="px-4 py-4 font-bold text-red-600" colspan="5">No se pudo cargar la lista: ${error.message}</td></tr>`;
  }
}

function collectTeacherAssignments(form) {
  const result = {};
  form.querySelectorAll("[data-assignment-course]").forEach((card) => {
    const courseId = card.dataset.assignmentCourse;
    const checked = card.querySelector("[data-assignment-course-check]")?.checked;
    if (!checked) return;
    const materias = [...card.querySelectorAll(`[data-assignment-subject="${courseId}"]:checked`)].map((input) => input.value);
    if (materias.length) result[courseId] = { materias };
  });
  return result;
}

function assignmentSummary(assignments) {
  const courses = Object.entries(assignments || {});
  return courses.map(([courseId, value]) => `${findCourse(courseId).nombre}: ${(value.materias || []).map((subjectId) => findSubject(subjectId)?.nombre || subjectId).join(", ")}`).join(" | ");
}
function bindCreateForms() {
  document.querySelectorAll("[data-create-user-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const role = form.dataset.role;
      const button = form.querySelector("button[type='submit']");
      const data = new FormData(form);
      const assignments = role === "docente" ? collectTeacherAssignments(form) : {};

      if (role === "docente" && !Object.keys(assignments).length) {
        statusFor(form, "[data-form-status]", "Selecciona al menos un curso y una materia para el docente.", "error");
        return;
      }

      button.disabled = true;
      statusFor(form, "[data-form-status]", "Creando usuario...");

      try {
        const createdUser = await createSystemUser({
          nombre: data.get("nombre"),
          username: data.get("username"),
          emailRecuperacion: data.get("emailRecuperacion"),
          password: data.get("password"),
          rol: role
        });
        if (role === "docente") {
          await saveTeacherAssignments(createdUser.id, assignments);
        }
        await safeAudit({
          tipo: "usuarios",
          accion: `crear_${role}`,
          detalle: role === "docente" ? `Creo docente ${createdUser.nombre} con asignacion` : `Creo usuario ${role}: ${createdUser.nombre}`,
          datos: role === "docente"
            ? { rol: role, usuario: createdUser.usuario, nombre: createdUser.nombre, asignacion: assignmentSummary(assignments) }
            : { rol: role, usuario: createdUser.usuario, nombre: createdUser.nombre }
        });
        form.reset();
        statusFor(form, "[data-form-status]", "Usuario creado correctamente.");
        await refreshUsers(role);
      } catch (error) {
        statusFor(form, "[data-form-status]", error.message || "No se pudo crear el usuario.", "error");
      } finally {
        button.disabled = false;
      }
    });
  });
}

function bindRefreshButtons() {
  document.querySelectorAll("[data-refresh-users]").forEach((button) => {
    button.addEventListener("click", () => refreshUsers(button.dataset.refreshUsers));
  });
}

function renderStudentRows(students) {
  const tbody = document.querySelector("[data-students-list]");
  if (!tbody) return;
  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 font-bold text-slate-500">No hay alumnos registrados en este curso.</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map((student) => `
    <tr>
      <td class="px-3 py-2 font-black text-slate-700 sm:px-4 sm:py-3">${student.numeroLista || "-"}</td>
      <td class="px-3 py-2 font-semibold text-slate-900 sm:px-4 sm:py-3">${student.nombre || "-"}</td>
      <td class="px-3 py-2 font-semibold text-slate-600 sm:px-4 sm:py-3">${student.ci || "-"}</td>
      <td class="px-3 py-2 sm:px-4 sm:py-3"><span class="rounded-full ${student.activo === false ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"} px-2.5 py-1 text-[11px] font-black sm:px-3 sm:text-xs">${student.activo === false ? "Retirado" : "Activo"}</span></td>
      <td class="px-3 py-2 sm:px-4 sm:py-3"><button class="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-black text-school-navy sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs" data-toggle-student="${student.id}" data-active="${student.activo !== false}">${student.activo === false ? "Habilitar" : "Retirar"}</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-toggle-student]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const nextActive = button.dataset.active !== "true";
      const student = students.find((item) => item.id === button.dataset.toggleStudent);
      await setStudentActive(button.dataset.toggleStudent, nextActive);
      if (student) await setStudentAccessActive(student, nextActive);
      await safeAudit({
        tipo: "alumnos",
        accion: nextActive ? "habilitar" : "retirar",
        detalle: `${nextActive ? "Habilito" : "Retiro"} alumno ${button.dataset.toggleStudent}`,
        datos: { alumnoId: button.dataset.toggleStudent, activo: nextActive, cursoId: state.studentsCourseId }
      });
      await refreshStudents();
    });
  });
}

async function refreshStudents() {
  const course = findCourse(state.studentsCourseId);
  const title = document.querySelector("[data-students-title]");
  const tbody = document.querySelector("[data-students-list]");
  if (title) title.textContent = course.nombre;
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 font-bold text-slate-500">Cargando...</td></tr>`;

  try {
    renderStudentRows(await listStudents(course.id));
  } catch (error) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 font-bold text-red-600">No se pudo cargar alumnos: ${error.message}</td></tr>`;
  }
}

async function generateStudentAccessesForCourse() {
  const panel = document.querySelector("[data-students-panel]");
  const button = document.querySelector("[data-action='generate-student-accesses']");
  const course = findCourse(state.studentsCourseId);
  if (!panel || !button || !course) return;

  button.disabled = true;
  statusFor(panel, "[data-students-access-status]", `Generando accesos para ${course.nombre}...`);
  try {
    const students = await listStudents(course.id);
    if (!students.length) {
      statusFor(panel, "[data-students-access-status]", "No hay alumnos en este curso para generar accesos.", "error");
      return;
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    for (const student of students) {
      try {
        const result = await ensureStudentLocalAccess(student, course);
        if (result.created) created += 1;
        else updated += 1;
      } catch (error) {
        failed += 1;
      }
    }

    await safeAudit({
      tipo: "alumnos",
      accion: "generar_accesos",
      detalle: `Genero accesos de alumnos para ${course.nombre}`,
      datos: { cursoId: course.id, cantidad: students.length, nuevos: created, actualizados: updated, fallidos: failed }
    });

    statusFor(panel, "[data-students-access-status]", `${students.length} accesos revisados. Usuario y contrasena: CI del alumno. Nuevos: ${created}, actualizados: ${updated}${failed ? `, fallidos: ${failed}` : ""}.`);
  } catch (error) {
    statusFor(panel, "[data-students-access-status]", error.message || "No se pudo generar accesos.", "error");
  } finally {
    button.disabled = false;
  }
}

function bindStudentsPage() {
  document.querySelectorAll('[data-action="students-course"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.studentsCourseId = button.dataset.courseId;
      updateTabs(document.querySelector("[data-course-tabs]"), state.studentsCourseId);
      refreshStudents();
    });
  });

  document.querySelector("[data-action='refresh-students']")?.addEventListener("click", refreshStudents);
  document.querySelector("[data-action='generate-student-accesses']")?.addEventListener("click", generateStudentAccessesForCourse);

  document.querySelector("[data-students-import-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const course = findCourse(data.get("courseId"));
    const button = form.querySelector("button[type='submit']");

    button.disabled = true;
    statusFor(form, "[data-students-status]", "Subiendo alumnos a Firebase...");
    try {
      const students = await importStudents(course, data.get("students"));
      const accessResults = [];
      for (const student of students) {
        try {
          accessResults.push({ ok: true, value: await ensureStudentLocalAccess(student, course) });
        } catch (error) {
          accessResults.push({ ok: false, error });
        }
      }
      const createdAccess = accessResults.filter((item) => item.ok && item.value.created).length;
      const existingAccess = accessResults.filter((item) => item.ok && !item.value.created && !item.value.skipped).length;
      const failedAccess = accessResults.filter((item) => !item.ok || item.value?.skipped).length;
      await safeAudit({
        tipo: "alumnos",
        accion: "importar",
        detalle: `Importo ${students.length} alumnos en ${course.nombre}`,
        datos: { cursoId: course.id, cantidad: students.length, accesosCreados: createdAccess, accesosExistentes: existingAccess, accesosFallidos: failedAccess }
      });
      state.studentsCourseId = course.id;
      statusFor(form, "[data-students-status]", `${students.length} alumnos importados. Accesos: ${createdAccess} nuevos, ${existingAccess} actualizados${failedAccess ? `, ${failedAccess} sin crear` : ""}. Usuario y contrasena: CI del alumno.`);
      form.querySelector("textarea").value = "";
      updateTabs(document.querySelector("[data-course-tabs]"), state.studentsCourseId);
      await refreshStudents();
    } catch (error) {
      statusFor(form, "[data-students-status]", error.message || "No se pudo importar alumnos.", "error");
    } finally {
      button.disabled = false;
    }
  });

  refreshStudents();
}


function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function scheduleExportPayload(schedules) {
  return {
    tipo: "horarios_ue_nueva_bolivia",
    version: 1,
    exportedAt: new Date().toISOString(),
    cursos: COURSES,
    materias: SUBJECTS,
    horarios: schedules
  };
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || "{}")));
      } catch {
        reject(new Error("El archivo no es un JSON valido."));
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsText(file, "utf-8");
  });
}
function activeSubjectLabel() {
  const subject = findSubject(state.selectedSubjectId);
  return subject?.nombre || "Quitar materia";
}

function updateSubjectPalette() {
  const label = document.querySelector("[data-selected-subject-label]");
  if (label) label.textContent = activeSubjectLabel();

  document.querySelectorAll("[data-subject-option]").forEach((button) => {
    const active = button.dataset.subjectOption === state.selectedSubjectId;
    button.classList.toggle("ring-4", active);
    button.classList.toggle("ring-school-navy", active);
    button.classList.toggle("scale-105", active);
  });
}

function scheduleCellButton(subjectId, periodId, dayId) {
  const subject = findSubject(subjectId);
  const text = subject?.nombre || "Tocar para llenar";
  const color = subject?.color || "#ffffff";
  const textClass = subject ? "text-slate-900" : "text-slate-400";

  return `
    <button type="button" data-schedule-cell data-period-id="${periodId}" data-day-id="${dayId}" class="min-h-10 w-full rounded-xl border border-slate-200 px-2 py-1.5 text-center text-[11px] font-black leading-tight transition hover:-translate-y-0.5 hover:border-school-navy hover:shadow-soft sm:min-h-12 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-sm ${textClass}" style="background:${color}">
      ${text}
    </button>
  `;
}

function setLocalScheduleCell(periodId, dayId, subjectId) {
  state.schedule ||= { cursoId: state.scheduleCourseId, periodos: periodsForCourse(state.scheduleCourseId), clases: {} };
  state.schedule.clases ||= {};
  state.schedule.clases[periodId] ||= {};
  state.schedule.clases[periodId][dayId] = subjectId || null;
}

async function saveClickedScheduleCell(button) {
  const status = document.querySelector("[data-schedule-status]");
  const periodId = button.dataset.periodId;
  const dayId = button.dataset.dayId;
  const subjectId = state.selectedSubjectId;

  setLocalScheduleCell(periodId, dayId, subjectId);
  renderScheduleGrid(state.schedule);

  if (status) {
    status.className = "text-sm font-black text-school-navy";
    status.textContent = subjectId ? `Guardando ${activeSubjectLabel()}...` : "Quitando materia...";
  }

  try {
    await saveScheduleCell(state.scheduleCourseId, periodId, dayId, subjectId);
    await safeAudit({
      tipo: "horarios",
      accion: subjectId ? "actualizar" : "quitar_materia",
      detalle: `${subjectId ? "Actualizo" : "Quito"} materia en ${findCourse(state.scheduleCourseId).nombre}`,
      datos: { cursoId: state.scheduleCourseId, periodo: periodId, dia: dayId, materiaId: subjectId || null }
    });
    if (status) {
      status.className = "text-sm font-black text-green-700";
      status.textContent = subjectId ? "Materia guardada" : "Materia quitada";
    }
  } catch (error) {
    if (status) {
      status.className = "text-sm font-black text-red-700";
      status.textContent = error?.code === "permission-denied"
        ? "Sin permiso para guardar en Firebase. Revisa reglas de Firestore."
        : `No se pudo guardar: ${error.message}`;
    }
  }
}

function renderScheduleGrid(schedule) {
  const grid = document.querySelector("[data-schedule-grid]");
  const title = document.querySelector("[data-schedule-title]");
  const course = findCourse(state.scheduleCourseId);
  const periods = periodsForCourse(course.id);
  state.schedule = schedule || { cursoId: course.id, periodos, clases: {} };
  if (title) title.textContent = course.nombre;
  if (!grid) return;

  grid.innerHTML = `
    <table class="min-w-[760px] border-separate border-spacing-0 text-left text-xs sm:text-sm">
      <thead class="bg-school-navy text-white">
        <tr><th class="px-3 py-2 font-black sm:px-4 sm:py-3">Per.</th><th class="px-3 py-2 font-black sm:px-4 sm:py-3">Hora</th>${DAYS.map((day) => `<th class="px-3 py-2 text-center font-black sm:px-4 sm:py-3">${day.label}</th>`).join("")}</tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        ${periods.map((period) => `
          <tr class="${period.recreo ? "bg-slate-50" : ""}">
            <td class="px-3 py-2 text-center font-black text-slate-700 sm:px-4 sm:py-3">${period.label}</td>
            <td class="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 sm:px-4 sm:py-3">${period.hora}</td>
            ${DAYS.map((day) => {
              const selected = state.schedule.clases?.[period.id]?.[day.id] || "";
              return `<td class="min-w-28 px-1.5 py-1.5 sm:min-w-40 sm:px-2 sm:py-2">${period.recreo ? `<div class="grid min-h-10 place-items-center rounded-xl border border-slate-200 bg-slate-100 text-[11px] font-black text-slate-400 sm:min-h-12 sm:rounded-2xl sm:text-sm">Recreo</div>` : scheduleCellButton(selected, period.id, day.id)}</td>`;
            }).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  grid.querySelectorAll("[data-schedule-cell]").forEach((button) => {
    button.addEventListener("click", () => saveClickedScheduleCell(button));
  });
}

async function refreshSchedule() {
  const grid = document.querySelector("[data-schedule-grid]");
  const status = document.querySelector("[data-schedule-status]");
  if (grid) grid.innerHTML = `<div class="p-5 font-bold text-slate-500">Cargando horario...</div>`;
  try {
    renderScheduleGrid(await getSchedule(state.scheduleCourseId));
    if (status) status.textContent = "";
  } catch (error) {
    renderScheduleGrid({
      cursoId: state.scheduleCourseId,
      periodos: periodsForCourse(state.scheduleCourseId),
      clases: {}
    });
    if (status) {
      status.className = "text-sm font-black text-red-700";
      status.textContent = error?.code === "permission-denied"
        ? "Firebase no permite guardar/cargar horarios. Revisa reglas de Firestore."
        : `No se pudo cargar horario: ${error.message}`;
    }
  }
}

function bindSchedulePage() {
  document.querySelectorAll("[data-subject-option]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSubjectId = button.dataset.subjectOption || "";
      updateSubjectPalette();
    });
  });

  document.querySelectorAll('[data-action="schedule-course"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.scheduleCourseId = button.dataset.courseId;
      state.schedule = null;
      updateTabs(document.querySelector("[data-course-tabs]"), state.scheduleCourseId);
      refreshSchedule();
    });
  });

  document.querySelector('[data-action="export-schedule-all"]')?.addEventListener("click", async () => {
    const status = document.querySelector("[data-schedule-status]");
    try {
      const schedules = await getAllSchedules();
      downloadJson(`horarios-ue-nueva-bolivia-${new Date().toISOString().slice(0, 10)}.json`, scheduleExportPayload(schedules));
      if (status) {
        status.className = "mt-3 text-sm font-black text-green-700";
        status.textContent = "Horarios exportados";
      }
    } catch (error) {
      if (status) {
        status.className = "mt-3 text-sm font-black text-red-700";
        status.textContent = `No se pudo exportar: ${error.message}`;
      }
    }
  });

  const importFile = document.querySelector("[data-schedule-import-file]");
  document.querySelector('[data-action="import-schedule-open"]')?.addEventListener("click", () => importFile?.click());
  importFile?.addEventListener("change", async () => {
    const status = document.querySelector("[data-schedule-status]");
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      if (status) {
        status.className = "mt-3 text-sm font-black text-school-navy";
        status.textContent = "Importando horarios...";
      }
      const count = await importSchedulesPayload(await readJsonFile(file));
      await safeAudit({
        tipo: "horarios",
        accion: "importar",
        detalle: `Importo ${count} horario(s)`,
        datos: { cantidad: count, archivo: file.name }
      });
      importFile.value = "";
      if (status) {
        status.className = "mt-3 text-sm font-black text-green-700";
        status.textContent = `${count} horario(s) importado(s)`;
      }
      await refreshSchedule();
    } catch (error) {
      if (status) {
        status.className = "mt-3 text-sm font-black text-red-700";
        status.textContent = `No se pudo importar: ${error.message}`;
      }
    }
  });

  updateSubjectPalette();
  refreshSchedule();
}

async function hydrateAdminDashboard() {
  document.querySelectorAll("[data-admin-count]").forEach((node) => { node.textContent = "..."; });
  try {
    await seedSchoolCatalog();
    const counts = await getAdminCounts();
    document.querySelector('[data-admin-count="students"]')?.replaceChildren(String(counts.students));
    document.querySelector('[data-admin-count="teachers"]')?.replaceChildren(String(counts.teachers));
    document.querySelector('[data-admin-count="schedules"]')?.replaceChildren(`${counts.schedules}/7`);
  } catch {
    document.querySelectorAll("[data-admin-count]").forEach((node) => { node.textContent = "-"; });
  }
}

let auditItems = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAuditRows(items) {
  const tbody = document.querySelector("[data-audit-list]");
  const count = document.querySelector("[data-audit-count]");
  if (count) count.textContent = String(items.length);
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-5 font-bold text-slate-500">No hay movimientos para estos filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((item) => `
    <tr>
      <td class="whitespace-nowrap px-4 py-3 font-black text-slate-800">${escapeHtml(item.hora || "-")}</td>
      <td class="px-4 py-3 font-semibold text-slate-600"><span class="block">${escapeHtml(item.usuario || "-")}</span><span class="text-xs font-black text-slate-400">${escapeHtml(item.rol || "-")}</span></td>
      <td class="px-4 py-3 font-semibold text-slate-600">${escapeHtml(item.tipo || "-")}</td>
      <td class="px-4 py-3"><span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">${escapeHtml(item.accion || "-")}</span></td>
      <td class="px-4 py-3 font-semibold text-slate-700">${escapeHtml(item.detalle || "Movimiento registrado")}</td>
      <td class="px-4 py-3 text-right"><button class="rounded-xl border border-school-navy px-3 py-1.5 text-xs font-black text-school-navy" data-audit-open="${item.id}">Ver</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-audit-open]").forEach((button) => {
    button.addEventListener("click", () => openAuditDetail(button.dataset.auditOpen));
  });
}

function openAuditDetail(id) {
  const item = auditItems.find((entry) => entry.id === id);
  const modal = document.querySelector("[data-audit-modal]");
  const detail = document.querySelector("[data-audit-detail]");
  if (!item || !modal || !detail) return;

  const dataRows = Object.entries(item.datos || {}).map(([key, value]) => `
    <div class="rounded-2xl bg-slate-50 px-4 py-3">
      <p class="text-xs font-black uppercase tracking-[.16em] text-slate-400">${escapeHtml(key)}</p>
      <p class="mt-1 font-black text-slate-800">${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</p>
    </div>
  `).join("");

  detail.innerHTML = `
    <div class="rounded-3xl border border-slate-200 bg-white p-5">
      <div class="flex flex-wrap gap-2">
        <span class="rounded-full bg-school-navy px-3 py-1 text-xs font-black text-white">${escapeHtml(item.tipo || "sistema")}</span>
        <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">${escapeHtml(item.accion || "movimiento")}</span>
      </div>
      <h4 class="mt-4 text-xl font-black text-slate-900">${escapeHtml(item.detalle || "Movimiento registrado")}</h4>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div><p class="text-xs font-black uppercase tracking-[.16em] text-slate-400">Usuario</p><p class="font-black text-slate-800">${escapeHtml(item.usuario || "-")}</p></div>
        <div><p class="text-xs font-black uppercase tracking-[.16em] text-slate-400">Rol</p><p class="font-black text-slate-800">${escapeHtml(item.rol || "-")}</p></div>
        <div><p class="text-xs font-black uppercase tracking-[.16em] text-slate-400">Fecha</p><p class="font-black text-slate-800">${escapeHtml(item.fecha || "-")}</p></div>
        <div><p class="text-xs font-black uppercase tracking-[.16em] text-slate-400">Hora</p><p class="font-black text-slate-800">${escapeHtml(item.hora || "-")}</p></div>
      </div>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">${dataRows || `<div class="rounded-2xl bg-slate-50 px-4 py-3 font-bold text-slate-500">Sin datos extra.</div>`}</div>
    <div>
      <p class="mb-2 text-sm font-black text-slate-700">Datos tecnicos</p>
      <pre class="max-h-72 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs font-semibold text-slate-100">${escapeHtml(JSON.stringify(item, null, 2))}</pre>
    </div>
  `;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeAuditDetail() {
  const modal = document.querySelector("[data-audit-modal]");
  modal?.classList.add("hidden");
  modal?.classList.remove("flex");
}

async function loadAuditPage() {
  const status = document.querySelector("[data-audit-status]");
  const fecha = document.querySelector("[data-audit-date]")?.value || "";
  const tipo = document.querySelector("[data-audit-type]")?.value || "";
  const buscar = document.querySelector("[data-audit-search]")?.value || "";

  if (status) {
    status.className = "rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700";
    status.textContent = "Cargando";
  }

  try {
    auditItems = await listAudit({ fecha, tipo, buscar });
    renderAuditRows(auditItems);
    if (status) {
      status.className = "rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700";
      status.textContent = "Actualizado";
    }
  } catch (error) {
    renderAuditRows([]);
    if (status) {
      status.className = "rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700";
      status.textContent = error?.code === "permission-denied" ? "Sin permiso" : "Error";
    }
  }
}

function bindAuditPage() {
  document.querySelector('[data-action="load-audit"]')?.addEventListener("click", loadAuditPage);
  document.querySelector('[data-action="close-audit-modal"]')?.addEventListener("click", closeAuditDetail);
  document.querySelector("[data-audit-modal]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-audit-modal]")) closeAuditDetail();
  });
  loadAuditPage();
}
export function bindAdminPages(route) {
  if (route.startsWith("/admin")) seedSchoolCatalog().catch(() => {});

  if (["/admin/docentes", "/admin/director"].includes(route)) {
    const role = route === "/admin/docentes" ? "docente" : "director";
    bindCreateForms();
    bindRefreshButtons();
    refreshUsers(role);
  }

  if (route === "/admin/alumnos") bindStudentsPage();
  if (route === "/admin/horarios") bindSchedulePage();
  if (route === "/admin") hydrateAdminDashboard();
  if (route === "/admin/auditoria") bindAuditPage();
}