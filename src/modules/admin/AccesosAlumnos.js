import { createIcons, icons } from "lucide";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase/client.js";
import { listStudents } from "../../services/adminData.js";
import { createStudentAuthAccess } from "../../services/studentAccess.js";
import { safeAudit } from "../../services/auditData.js";
import { icon } from "../../ui/dom.js";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export async function openStudentAccessMigration(course, afterSave = () => {}) {
  if (!auth.currentUser || document.querySelector("[data-student-access-dialog]")) return;
  const adminUid = auth.currentUser.uid;
  const dialog = document.createElement("dialog");
  dialog.dataset.studentAccessDialog = "true";
  dialog.setAttribute("aria-labelledby", "student-access-title");
  dialog.className = "student-access-dialog max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-4xl overflow-hidden rounded-lg border border-slate-200 p-0 text-slate-800 shadow-xl";
  dialog.innerHTML = `
    <header class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div><h2 id="student-access-title" class="text-lg font-semibold">Accesos de alumnos</h2><p class="mt-1 text-sm text-slate-600">${escapeHtml(course.nombre)}</p></div>
      <button type="button" data-close-access title="Cerrar" aria-label="Cerrar" class="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-slate-200">${icon("x")}</button>
    </header>
    <div class="min-h-0 space-y-3 overflow-y-auto p-4">
      <p class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Cada cuenta nueva recibe una contrasena temporal privada. Descarga las credenciales antes de cerrar. Las cuentas existentes conservan su contrasena.</p>
      <p data-access-status role="status" class="text-sm text-slate-600">Cargando alumnos...</p>
      <div class="overflow-x-auto"><table class="w-full min-w-[540px] text-left text-sm">
        <thead class="border-y border-slate-200 bg-slate-50"><tr><th class="w-10 p-2"><input type="checkbox" data-access-all aria-label="Seleccionar alumnos pendientes" checked></th><th class="p-2 font-medium">Alumno</th><th class="p-2 font-medium">Usuario</th><th class="p-2 font-medium">Estado</th><th class="p-2 font-medium">Contrasena</th></tr></thead>
        <tbody data-access-rows></tbody>
      </table></div>
    </div>
    <footer class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 p-4">
      <button type="button" data-download-access disabled class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm disabled:opacity-40 sm:w-auto">${icon("download", "h-4 w-4")} Credenciales privadas</button>
      <button type="button" data-prepare-access disabled class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-school-green px-3 py-2 text-sm font-medium text-white disabled:opacity-40 sm:w-auto">${icon("shield-check", "h-4 w-4")} Crear accesos</button>
    </footer>`;
  document.body.appendChild(dialog);
  dialog.showModal();
  createIcons({ icons });
  let busy = false;
  let exported = false;
  let students = [];
  const results = [];
  let unsubscribe = () => {};
  const credentialsPending = () => results.some((item) => item.password) && !exported;
  const close = (force = false) => {
    if (!force && (busy || (credentialsPending() && !window.confirm("Las credenciales nuevas aun no se descargaron. Si cierras se perderan de esta pantalla. Cerrar de todas formas?")))) return;
    results.length = 0;
    unsubscribe();
    window.removeEventListener("beforeunload", preventUnload);
    dialog.close();
    dialog.remove();
  };
  const preventUnload = (event) => { if (busy || credentialsPending()) { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", preventUnload);
  unsubscribe = onAuthStateChanged(auth, (user) => { if (!user || user.uid !== adminUid) close(true); });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.querySelector("[data-close-access]").addEventListener("click", () => close());
  const status = dialog.querySelector("[data-access-status]");
  const prepare = dialog.querySelector("[data-prepare-access]");
  const download = dialog.querySelector("[data-download-access]");
  const rowFor = (id) => [...dialog.querySelectorAll("[data-access-student]")].find((row) => row.dataset.accessStudent === id);
  const syncSelection = () => { prepare.disabled = busy || !dialog.querySelector("[data-access-check]:checked:not(:disabled)"); };
  dialog.querySelector("[data-access-all]").addEventListener("change", (event) => {
    dialog.querySelectorAll("[data-access-check]:not(:disabled)").forEach((input) => { input.checked = event.target.checked; });
    syncSelection();
  });
  dialog.addEventListener("change", syncSelection);
  download.addEventListener("click", () => {
    const fields = (item) => [item.nombre, item.usuario, item.password].map((value) => String(value || "").replace(/[\t\r\n]/g, " ")).join("\t");
    const text = ["CREDENCIALES PRIVADAS - " + course.nombre, "Alumno\tUsuario\tContrasena", ...results.filter((item) => item.password).map(fields)].join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `accesos-privados-${course.id}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exported = true;
  });
  prepare.addEventListener("click", async () => {
    if (busy || !dialog.isConnected || auth.currentUser?.uid !== adminUid) return;
    const selectedIds = new Set([...dialog.querySelectorAll("[data-access-check]:checked:not(:disabled)")].map((input) => input.value));
    const selected = students.filter((student) => selectedIds.has(student.id));
    if (!selected.length || !window.confirm(`Crear ${selected.length} accesos de alumnos para ${course.nombre}? Se generaran contrasenas temporales nuevas para entregar a cada familia.`)) return;
    busy = true;
    dialog.querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
    let failed = 0;
    let reviewed = 0;
    for (const [index, student] of selected.entries()) {
      if (!dialog.isConnected || auth.currentUser?.uid !== adminUid) return;
      status.textContent = `Preparando ${index + 1} de ${selected.length}...`;
      const row = rowFor(student.id);
      try {
        const result = await createStudentAuthAccess(student, course);
        if (!dialog.isConnected || auth.currentUser?.uid !== adminUid) return;
        results.push(result);
        exported = false;
        student.authUid = result.uid;
        row.querySelector("[data-access-state]").textContent = result.created ? "Cuenta preparada" : "Cuenta vinculada";
        row.querySelector("[data-access-password]").textContent = result.password || "Sin cambios";
        row.querySelector("[data-access-check]").checked = false;
      } catch (error) {
        if (!dialog.isConnected) return;
        failed += 1;
        row.querySelector("[data-access-state]").textContent = error.message || "No se pudo preparar";
      }
      reviewed += 1;
    }
    await safeAudit({ tipo: "alumnos", accion: "proteger_accesos", detalle: `Preparo accesos protegidos de ${course.nombre}`, datos: { cursoId: course.id, revisados: reviewed, fallidos: failed } });
    if (!dialog.isConnected) return;
    busy = false;
    status.textContent = `${reviewed - failed} cuentas revisadas${failed ? `; ${failed} necesitan revision` : ""}.`;
    dialog.querySelectorAll("input, button").forEach((control) => { control.disabled = false; });
    students.filter((student) => student.authUid || student.activo === false).forEach((student) => { rowFor(student.id).querySelector("[data-access-check]").disabled = true; });
    download.disabled = !results.some((item) => item.password);
    syncSelection();
    await afterSave();
  });
  try {
    students = await listStudents(course.id);
    if (!dialog.isConnected) return;
    dialog.querySelector("[data-access-rows]").innerHTML = students.map((student) => `<tr class="border-b border-slate-100" data-access-student="${escapeHtml(student.id)}"><td class="p-2"><input type="checkbox" data-access-check value="${escapeHtml(student.id)}" aria-label="${escapeHtml(student.nombre)}" ${student.authUid || student.activo === false ? "disabled" : "checked"}></td><td class="p-2">${escapeHtml(student.nombre)}</td><td class="p-2">${escapeHtml(student.ci || student.usuario || student.id)}</td><td class="p-2 text-xs" data-access-state>${student.authUid ? "Protegido" : student.activo === false ? "Retirado" : "Pendiente"}</td><td class="p-2 font-mono text-xs" data-access-password>-</td></tr>`).join("");
    status.textContent = `${students.length} alumnos en el curso.`;
    syncSelection();
  } catch (error) {
    status.textContent = error.message || "No se pudo cargar el curso.";
  }
}
