import { createIcons, icons } from "lucide";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase/client.js";
import { generateTemporaryStudentPassword, resetStudentPasswordAsAdmin } from "../../services/adminStudentPassword.js";
import { icon } from "../../ui/dom.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function studentPasswordResetMarkup(student, courseName) {
  return `<header><h2 id="student-password-title">Restablecer contrasena</h2><button type="button" data-reset-close class="students-icon-button" title="Cerrar" aria-label="Cerrar">${icon("x")}</button></header>
    <p><strong>${escape(student.nombre)}</strong><br>${escape(courseName)} <span class="students-reset-username">Usuario: ${escape(student.ci || student.usuario || "-")}</span></p>
    <form data-reset-form>
      <label for="student-temporary-password">Contrasena temporal</label>
      <div class="students-reset-field"><input id="student-temporary-password" data-reset-temporary type="password" autocomplete="off" minlength="6" maxlength="128" required>
        <button type="button" data-reset-toggle title="Mostrar contrasena temporal" aria-label="Mostrar contrasena temporal" aria-pressed="false">${icon("eye")}</button>
        <button type="button" data-reset-generate title="Generar otra clave temporal" aria-label="Generar otra clave temporal">${icon("refresh-cw")}</button></div>
      <label for="student-reset-admin-password">Tu contrasena de administrador</label>
      <input id="student-reset-admin-password" data-reset-admin-password type="password" autocomplete="current-password" required>
      <p class="students-reset-warning">La clave anterior dejara de servir. No se cambiaran notas ni asistencias.</p>
      <footer><button type="button" data-reset-close>Cancelar</button><button type="submit" class="students-primary-button">${icon("key-round")} Confirmar restablecimiento</button></footer>
    </form>
    <div data-reset-success hidden>
      <div class="students-reset-check" aria-hidden="true">${icon("circle-check")}</div>
      <p class="students-reset-success-label" tabindex="-1" data-reset-success-label>Contrasena restablecida.</p>
      <label for="student-reset-result">Clave temporal para entregar al alumno</label>
      <div class="students-reset-field"><input id="student-reset-result" data-reset-result readonly autocomplete="off"><button type="button" data-reset-copy title="Copiar clave temporal" aria-label="Copiar clave temporal">${icon("copy")}</button></div>
      <p>El alumno podra cambiarla desde su cuenta.</p>
      <footer><button type="button" data-reset-close class="students-primary-button">Listo</button></footer>
    </div>
    <p data-reset-status role="status" aria-live="polite" hidden></p>`;
}

export function bindStudentPasswordReset(dialog, { student, isSessionActive, resetPassword = resetStudentPasswordAsAdmin, generatePassword = generateTemporaryStudentPassword, copy = (value) => navigator.clipboard.writeText(value), onClose = () => {} }) {
  const $ = (selector) => dialog.querySelector(selector);
  const form = $("[data-reset-form]"), temporary = $("[data-reset-temporary]"), administrator = $("[data-reset-admin-password]"), result = $("[data-reset-result]"), success = $("[data-reset-success]");
  const controller = new AbortController(), options = { signal: controller.signal };
  let pending = false, done = false, disposed = false;
  const current = () => !disposed && dialog.isConnected && isSessionActive();
  const status = (message, error = false) => { const node = $("[data-reset-status]"); node.textContent = message; node.hidden = !message; node.dataset.error = String(error); };
  const dispose = () => { if (disposed) return; disposed = true; controller.abort(); dialog.querySelectorAll("input").forEach((input) => { input.value = ""; }); };
  const close = (force = false) => { if (disposed || pending && !force) return; dispose(); onClose(done); };
  temporary.value = generatePassword();
  dialog.querySelectorAll("[data-reset-close]").forEach((button) => button.addEventListener("click", () => close(), options));
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); }, options);
  $("[data-reset-generate]").addEventListener("click", () => { if (!pending && !done) temporary.value = generatePassword(); }, options);
  $("[data-reset-toggle]").addEventListener("click", (event) => {
    temporary.type = temporary.type === "password" ? "text" : "password";
    const button = event.currentTarget, visible = temporary.type === "text";
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute("aria-label", `${visible ? "Ocultar" : "Mostrar"} contrasena temporal`);
    button.title = `${visible ? "Ocultar" : "Mostrar"} contrasena temporal`;
  }, options);
  $("[data-reset-copy]").addEventListener("click", async () => {
    if (!current() || !done) return;
    try { await copy(result.value); if (current()) status("Clave temporal copiada."); }
    catch { if (current()) status("No se pudo copiar. Puedes seleccionar la clave temporal.", true); }
  }, options);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending || done || !current()) return;
    const password = temporary.value;
    if (password.length < 6 || password.length > 128) { status("La clave temporal debe tener entre 6 y 128 caracteres.", true); return; }
    if (!administrator.value) { status("Confirma tu contrasena de administrador.", true); return; }
    const adminPassword = administrator.value;
    administrator.value = "";
    const controls = [...dialog.querySelectorAll("input, button")].map((control) => [control, control.disabled]);
    pending = true; form.setAttribute("aria-busy", "true"); controls.forEach(([control]) => { control.disabled = true; });
    status("Restableciendo contrasena...");
    try {
      await resetPassword({ student, temporaryPassword: password, adminPassword }, { isCurrent: current });
      if (!current()) return;
      done = true; temporary.value = ""; result.value = password; form.hidden = true; success.hidden = false; status("");
      $("[data-reset-success-label]").focus();
    } catch (error) {
      if (current()) {
        const invalid = ["auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(error.code);
        status(invalid ? "Tu contrasena de administrador no es correcta. No se cambio la clave del alumno." : error.message || "No se pudo confirmar el restablecimiento.", true);
        administrator.focus();
      }
    } finally {
      pending = false;
      if (current()) { form.removeAttribute("aria-busy"); controls.forEach(([control, disabled]) => { control.disabled = disabled; }); }
    }
  }, options);
  return { close: () => close(true), dispose };
}

export function openStudentPasswordReset({ student, courseName, root, isSessionActive, trigger }) {
  if (!student.authUid || !isSessionActive()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "students-confirm-dialog students-reset-dialog";
    dialog.setAttribute("aria-labelledby", "student-password-title");
    dialog.innerHTML = studentPasswordResetMarkup(student, courseName);
    root.appendChild(dialog);
    let unsubscribe = () => {}, observer;
    const binding = bindStudentPasswordReset(dialog, { student, isSessionActive, onClose: (done) => {
      unsubscribe(); observer?.disconnect(); dialog.close(); dialog.remove();
      if (trigger?.isConnected && isSessionActive()) trigger.focus();
      resolve(done);
    } });
    unsubscribe = onAuthStateChanged(auth, () => { if (!isSessionActive()) binding.close(); });
    observer = new MutationObserver(() => { if (!dialog.isConnected || !isSessionActive()) binding.close(); });
    observer.observe(document.getElementById("app") || document.body, { childList: true, subtree: true });
    dialog.showModal(); createIcons({ icons }); dialog.querySelector("[data-reset-admin-password]").focus();
  });
}
