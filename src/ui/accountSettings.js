import { auth } from "../firebase/client.js";
import { changeOwnPassword, setRecoveryEmail } from "../services/accountSettings.js";

function accountErrorMessage(error) {
  const code = error?.code || "";
  if (["auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(code)) return "La contrasena actual no es correcta.";
  if (code === "auth/requires-recent-login") return "Vuelve a ingresar y repite el cambio.";
  if (code === "auth/email-already-in-use") return "Ese correo ya esta usado por otra cuenta.";
  if (code === "auth/invalid-email") return "El correo no tiene formato valido.";
  if (["auth/weak-password", "auth/password-does-not-meet-requirements"].includes(code)) return "La nueva contrasena no cumple los requisitos. Usa una clave mas larga con letras, numeros y simbolos.";
  if (code === "auth/too-many-requests") return "Demasiados intentos. Espera un momento y vuelve a intentar.";
  if (code === "auth/network-request-failed") return "No hay conexion. Revisa internet e intenta nuevamente.";
  return error?.message || "No se pudo guardar el cambio.";
}

export function bindAccountSettings({ root = document, signal, beforeOpen = () => {}, authClient = auth, changePassword = changeOwnPassword, changeEmail = setRecoveryEmail } = {}) {
  const modal = root.querySelector("[data-account-modal]");
  if (!modal) return () => {};
  const page = root.ownerDocument || root;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const status = modal.querySelector("[data-account-status]");
  const formsContainer = modal.querySelector("[data-account-forms]");
  const passwordSuccess = modal.querySelector("[data-account-password-success]");
  let busy = false, previousFocus = null, previousOverflow = "", scrollLocked = false;
  let closeTimer = null, passwordChanged = false;
  const forms = [...modal.querySelectorAll("form")];
  const visibilityButtons = [...modal.querySelectorAll("[data-account-toggle-password]")];
  const showStatus = (message, error = false) => {
    if (!status) return;
    status.textContent = message;
    status.className = `mx-5 mb-5 rounded-lg border px-4 py-3 text-sm ${message ? error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700" : "hidden"}`;
  };
  const showPassword = (button, visible) => {
    const input = modal.querySelector(`#${button.dataset.accountTogglePassword}`);
    if (!input) return;
    input.type = visible ? "text" : "password";
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute("title", `${visible ? "Ocultar" : "Mostrar"} contrasena`);
    button.setAttribute("aria-label", `${visible ? "Ocultar" : "Mostrar"} ${input.labels?.[0]?.textContent.toLowerCase() || "contrasena"}`);
    button.querySelector("[data-account-eye]")?.classList.toggle("hidden", visible);
    button.querySelector("[data-account-eye-off]")?.classList.toggle("hidden", !visible);
  };
  const clear = () => {
    clearTimeout(closeTimer); closeTimer = null; passwordChanged = false;
    formsContainer?.classList.remove("hidden"); passwordSuccess?.classList.add("hidden");
    forms.forEach((form) => form.reset()); visibilityButtons.forEach((button) => showPassword(button, false));
  };
  const unlockScroll = () => {
    if (scrollLocked && page.body) page.body.style.overflow = previousOverflow;
    scrollLocked = false;
  };
  const close = () => {
    if (busy) return;
    clear(); showStatus(""); unlockScroll();
    modal.classList.add("hidden"); modal.classList.remove("flex"); modal.setAttribute("aria-hidden", "true");
    const hidden = previousFocus?.closest?.('[inert], [aria-hidden="true"]');
    const target = !hidden && previousFocus?.getClientRects?.().length ? previousFocus : root.querySelector("[data-action='open-menu']");
    target?.focus({ preventScroll: true });
  };
  root.querySelectorAll("[data-action='open-account-settings']").forEach((button) => button.addEventListener("click", () => {
    if (busy) return;
    previousFocus = page.activeElement;
    beforeOpen(); clear(); showStatus("");
    if (!scrollLocked && page.body) { previousOverflow = page.body.style.overflow; page.body.style.overflow = "hidden"; scrollLocked = true; }
    modal.classList.remove("hidden"); modal.classList.add("flex"); modal.setAttribute("aria-hidden", "false");
    modal.querySelector("[data-account-password-form] input")?.focus({ preventScroll: true });
  }, options));
  modal.querySelectorAll("[data-action='close-account-settings']").forEach((button) => button.addEventListener("click", close, options));
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); }, options);
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const controls = [...modal.querySelectorAll("input:not([disabled]), button:not([disabled])")].filter((element) => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && page.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && page.activeElement === last) { event.preventDefault(); first?.focus(); }
  }, options);
  visibilityButtons.forEach((button) => button.addEventListener("click", () => showPassword(button, button.getAttribute("aria-pressed") !== "true"), options));

  function bindForm(selector, operation, progress, success, closeAfterSuccess = false) {
    const form = modal.querySelector(selector);
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || passwordChanged || modal.classList.contains("hidden")) return;
      const uid = authClient.currentUser?.uid;
      if (!uid) { showStatus("Vuelve a ingresar para cambiar tu cuenta.", true); return; }
      const data = new FormData(form);
      const controls = [...modal.querySelectorAll("input, button")].map((control) => [control, control.disabled]);
      const current = () => !controller.signal.aborted && modal.isConnected !== false && authClient.currentUser?.uid === uid;
      busy = true; form.setAttribute("aria-busy", "true"); controls.forEach(([control]) => { control.disabled = true; });
      showStatus(progress);
      try {
        await operation(data);
        if (!current()) { clear(); return; }
        form.reset(); visibilityButtons.forEach((button) => showPassword(button, false)); showStatus(success);
        if (closeAfterSuccess) {
          passwordChanged = true;
          if (passwordSuccess) {
            showStatus(""); formsContainer?.classList.add("hidden");
            passwordSuccess.classList.remove("hidden"); passwordSuccess.focus({ preventScroll: true });
          }
          closeTimer = setTimeout(() => { closeTimer = null; if (current()) close(); }, 1200);
        }
      } catch (error) {
        if (current()) showStatus(accountErrorMessage(error), true);
        else clear();
      } finally {
        busy = false;
        if (!controller.signal.aborted) { form.removeAttribute("aria-busy"); controls.forEach(([control, disabled]) => { control.disabled = disabled; }); }
      }
    }, options);
  }
  bindForm("[data-account-password-form]", (data) => changePassword({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword"), confirmPassword: data.get("confirmPassword") }), "Cambiando contrasena...", "Contrasena actualizada correctamente.", true);
  bindForm("[data-account-email-form]", (data) => changeEmail({ email: data.get("email"), currentPassword: data.get("currentPassword") }), "Guardando correo...", "Correo guardado correctamente.");
  const dispose = () => { controller.abort(); clear(); unlockScroll(); };
  if (signal?.aborted) dispose();
  else signal?.addEventListener("abort", dispose, { once: true });
  return dispose;
}
