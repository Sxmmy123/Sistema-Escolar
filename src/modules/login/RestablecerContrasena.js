import { createIcons, ArrowLeft, Check, CircleCheck, Eye, EyeOff, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, TriangleAlert } from "lucide";
import { icon } from "../../ui/dom.js";
import { confirmarRestablecimiento, errorRestablecimiento, ocultarCorreo, verificarEnlaceRestablecimiento } from "../../services/restablecimientoContrasena.js";

export function RestablecerContrasenaView({ logo, loginHref }) {
  return `
    <div class="password-reset">
      <header class="password-reset-brand"><img src="${logo}" width="48" height="48" alt="Escudo Nueva Bolivia"><div><span>Unidad Educativa</span><strong>Ecologica Nueva Bolivia</strong></div></header>
      <main class="password-reset-main">
        <div class="password-reset-heading"><span class="password-reset-kicker">Acceso docente</span><h1>Restablecer contrasena</h1></div>
        <section class="password-reset-panel" aria-label="Restablecimiento de acceso">
          <div data-reset-loading class="password-reset-state" role="status"><span class="password-reset-symbol">${icon("loader-circle")}</span><h2>Verificando enlace</h2><p>Espera un momento...</p></div>
          <form data-reset-form hidden aria-label="Nueva contrasena">
            <div class="password-reset-account">${icon("shield-check")}<span data-reset-email></span></div>
            <label for="reset-password">Nueva contrasena</label>
            <div class="password-reset-input"><input id="reset-password" name="password" type="password" autocomplete="new-password" minlength="6" maxlength="4096" required aria-describedby="reset-requirements"><button type="button" data-reset-toggle="password" aria-label="Mostrar nueva contrasena" aria-pressed="false" title="Mostrar nueva contrasena">${icon("eye")}</button></div>
            <p id="reset-requirements" class="password-reset-help">Minimo 6 caracteres.</p>
            <label for="reset-confirmation">Confirmar nueva contrasena</label>
            <div class="password-reset-input"><input id="reset-confirmation" name="confirmation" type="password" autocomplete="new-password" minlength="6" maxlength="4096" required><button type="button" data-reset-toggle="confirmation" aria-label="Mostrar confirmacion" aria-pressed="false" title="Mostrar confirmacion">${icon("eye")}</button></div>
            <p data-reset-form-status class="password-reset-feedback" role="status" aria-live="polite" hidden></p>
            <button type="submit" class="password-reset-primary">${icon("key-round")}<span data-reset-save-label>Guardar contrasena</span></button>
          </form>
          <div data-reset-success class="password-reset-state" role="status" hidden><span class="password-reset-symbol password-reset-symbol-success">${icon("circle-check")}</span><h2>Contrasena actualizada</h2><p>Ya puedes ingresar con tu nueva contrasena.</p><a class="password-reset-primary" href="${loginHref}">${icon("check")}Ir al ingreso</a></div>
          <div data-reset-error class="password-reset-state" role="alert" hidden><span class="password-reset-symbol password-reset-symbol-warning">${icon("triangle-alert")}</span><h2 data-reset-error-title>Enlace no disponible</h2><p data-reset-error-message></p><button type="button" class="password-reset-primary" data-reset-retry>${icon("refresh-cw")}Volver a intentar</button></div>
          <a class="password-reset-back" data-reset-back href="${loginHref}">${icon("arrow-left")}Volver al ingreso</a>
        </section>
      </main>
      <footer class="password-reset-footer">Sistema escolar · Nueva Bolivia</footer>
    </div>`;
}

export function bindRestablecerContrasena(root, { auth, code, initialError = null, verificar = verificarEnlaceRestablecimiento, confirmar = confirmarRestablecimiento }) {
  const form = root.querySelector("[data-reset-form]");
  const panels = { loading: root.querySelector("[data-reset-loading]"), ready: form, success: root.querySelector("[data-reset-success]"), error: root.querySelector("[data-reset-error]") };
  const retry = root.querySelector("[data-reset-retry]");
  const formStatus = root.querySelector("[data-reset-form-status]");
  const label = root.querySelector("[data-reset-save-label]");
  let actionCode = code;
  let state = "loading";
  let saving = false;
  let revision = 0;
  let disposed = false;
  const refreshIcons = () => createIcons({ icons: { ArrowLeft, Check, CircleCheck, Eye, EyeOff, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, TriangleAlert } });
  const show = (next) => {
    state = next;
    for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== next;
    root.querySelector("[data-reset-back]").hidden = next === "success";
  };
  const lock = (busy) => {
    for (const control of form.querySelectorAll("input, button")) control.disabled = busy;
    label.textContent = busy ? "Guardando..." : "Guardar contrasena";
    form.setAttribute("aria-busy", String(busy));
  };
  const showError = (error) => {
    const issue = errorRestablecimiento(error);
    root.querySelector("[data-reset-error-title]").textContent = issue.title || "No se pudo completar";
    root.querySelector("[data-reset-error-message]").textContent = issue.message;
    retry.hidden = Boolean(issue.terminal);
    if (issue.terminal) actionCode = "";
    show("error");
  };
  const verify = async () => {
    if (disposed || !actionCode || state === "verifying") return;
    const request = ++revision;
    show("loading");
    state = "verifying";
    try {
      const email = await verificar(auth, actionCode);
      if (disposed || request !== revision) return;
      root.querySelector("[data-reset-email]").textContent = ocultarCorreo(email);
      show("ready");
    } catch (error) { if (!disposed && request === revision) showError(error); }
  };
  retry.addEventListener("click", verify);
  for (const button of root.querySelectorAll("[data-reset-toggle]")) button.addEventListener("click", () => {
    const input = form.elements.namedItem(button.dataset.resetToggle);
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    const target = button.dataset.resetToggle === "password" ? "nueva contrasena" : "confirmacion";
    button.setAttribute("aria-label", `${visible ? "Ocultar" : "Mostrar"} ${target}`);
    button.setAttribute("aria-pressed", String(visible));
    button.title = `${visible ? "Ocultar" : "Mostrar"} ${target}`;
    button.innerHTML = icon(visible ? "eye-off" : "eye");
    refreshIcons();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (disposed || saving || state !== "ready" || !form.reportValidity()) return;
    saving = true;
    formStatus.hidden = true;
    lock(true);
    try {
      await confirmar({ auth, code: actionCode, password: form.elements.namedItem("password").value, confirmation: form.elements.namedItem("confirmation").value });
      if (disposed) return;
      actionCode = "";
      form.reset();
      show("success");
    } catch (error) {
      if (disposed) return;
      const issue = errorRestablecimiento(error);
      if (issue.terminal) { form.reset(); showError(error); }
      else { formStatus.textContent = issue.message; formStatus.hidden = false; }
    } finally { saving = false; if (!disposed) lock(false); }
  });
  refreshIcons();
  if (initialError || !actionCode) showError(initialError || { code: "restablecimiento/enlace-invalido" });
  else verify();
  return { desmontar() { disposed = true; revision++; actionCode = ""; form.reset(); showError({ code: "restablecimiento/enlace-invalido" }); } };
}
