import { createIcons, CircleCheck, KeyRound, X } from "lucide";
import { cambiarClaveTemporal } from "../services/claveTemporal.js";

function formularioClaveTemporal() {
  return `<form data-temporary-password-form class="mt-6 space-y-4">
      ${[["currentPassword", "Contrasena actual", "current-password"], ["newPassword", "Nueva contrasena", "new-password"], ["confirmPassword", "Confirmar nueva contrasena", "new-password"]].map(([name, label, autocomplete]) => `<label class="block text-sm font-medium">${label}<input name="${name}" type="password" autocomplete="${autocomplete}" required maxlength="128" ${name !== "currentPassword" ? 'minlength="12"' : ''} class="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"></label>`).join("")}
      <p class="text-xs text-slate-600">Entre 12 y 128 caracteres; no uses tu CI ni una clave solo numerica.</p>
      <button type="submit" class="min-h-11 w-full rounded-lg bg-school-green px-4 py-2 font-semibold text-white disabled:opacity-60">Cambiar contrasena</button>
    </form>
    <div data-temporary-success role="status" class="mt-6 hidden text-center text-school-green"><i data-lucide="circle-check" class="mx-auto h-12 w-12"></i><p class="mt-3 font-semibold">Contrasena actualizada</p><p class="mt-2 text-sm">Ingresa nuevamente con tu nueva clave.</p></div>
    <p data-temporary-status role="status" aria-live="polite" class="mt-4 break-words text-sm text-red-700"></p>`;
}

export function claveTemporalView() {
  return `<main class="grid min-h-screen place-items-center bg-slate-100 px-4 py-8"><section class="w-full max-w-md text-slate-900" aria-labelledby="clave-temporal-title">
    <div class="mb-5 text-school-green"><i data-lucide="key-round" class="h-8 w-8"></i></div>
    <h1 id="clave-temporal-title" class="text-xl font-semibold">Cambia tu contrasena temporal</h1>
    <p class="mt-2 text-sm text-slate-600">Crea una clave personal para continuar.</p>
    ${formularioClaveTemporal()}
    <button type="button" data-temporary-exit class="mt-5 min-h-11 text-sm underline">Cerrar sesion</button>
  </section></main>`;
}

export function bindClaveTemporal({ root = document, signal, change = cambiarClaveTemporal, logout } = {}) {
  createIcons({ icons: { CircleCheck, KeyRound, X } });
  const form = root.querySelector("[data-temporary-password-form]"), status = root.querySelector("[data-temporary-status]"), exit = root.querySelector("[data-temporary-exit]");
  let busy = false, timer;
  signal?.addEventListener("abort", () => clearTimeout(timer), { once: true });
  exit?.addEventListener("click", () => { if (!busy) logout(); }, { signal });
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || signal?.aborted) return;
    const input = Object.fromEntries(new FormData(form));
    busy = true; form.setAttribute("aria-busy", "true"); status.textContent = "";
    const controls = [...root.querySelectorAll("input, button")];
    controls.forEach(control => { control.disabled = true; });
    try {
      await change(input);
      if (signal?.aborted) return;
      form.reset(); form.classList.add("hidden"); exit?.classList.add("hidden");
      root.querySelector("[data-temporary-success]").classList.remove("hidden");
      timer = setTimeout(logout, 1500);
    } catch (error) {
      if (!signal?.aborted) { status.textContent = error.message || "No se pudo completar el cambio."; controls.forEach(control => { control.disabled = false; }); busy = false; form.removeAttribute("aria-busy"); }
    }
  }, { signal });
}

export function recordatorioClaveMarkup() {
  return `<header class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
    <div><div class="mb-3 text-school-green"><i data-lucide="key-round" class="h-7 w-7"></i></div><h2 id="password-reminder-title" class="text-lg font-semibold text-slate-900">Cambia tu contrasena temporal</h2></div>
    <button type="button" data-password-reminder-close class="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" title="Ahora no" aria-label="Ahora no"><i data-lucide="x" class="h-5 w-5"></i></button>
  </header>
  <div class="px-5 py-4 text-slate-900"><p class="text-sm leading-6 text-slate-600">Todavia usas una clave temporal. Puedes cambiarla ahora o continuar con la demostracion.</p>
    <div data-password-reminder-editor class="hidden">${formularioClaveTemporal()}</div>
    <footer data-password-reminder-actions class="mt-5 flex flex-wrap justify-end gap-2">
      <button type="button" data-password-reminder-close autofocus class="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Ahora no</button>
      <button type="button" data-password-reminder-change class="min-h-11 rounded-lg bg-school-green px-4 py-2 text-sm font-semibold text-white">Cambiar ahora</button>
    </footer>
  </div>`;
}

export function mostrarRecordatorioClave({ signal, logout, change = cambiarClaveTemporal, page = document } = {}) {
  if (signal?.aborted) return;
  const controller = new AbortController(), dialog = page.createElement("dialog"), previousFocus = page.activeElement, previousOverflow = page.body.style.overflow;
  dialog.className = "password-reminder-dialog bg-white text-slate-900";
  dialog.dataset.passwordReminder = "";
  dialog.setAttribute("aria-labelledby", "password-reminder-title");
  dialog.innerHTML = recordatorioClaveMarkup();
  page.body.append(dialog);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; controller.abort(); dialog.close(); dialog.remove(); page.body.style.overflow = previousOverflow;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const postpone = () => { if (dialog.querySelector("form")?.getAttribute("aria-busy") !== "true") dispose(); };
  dialog.querySelectorAll("[data-password-reminder-close]").forEach(button => button.addEventListener("click", postpone, { signal: controller.signal }));
  dialog.addEventListener("cancel", event => { event.preventDefault(); postpone(); }, { signal: controller.signal });
  dialog.addEventListener("click", event => { if (event.target === dialog) postpone(); }, { signal: controller.signal });
  dialog.querySelector("[data-password-reminder-change]").addEventListener("click", () => {
    dialog.querySelector("[data-password-reminder-actions]").classList.add("hidden");
    dialog.querySelector("[data-password-reminder-editor]").classList.remove("hidden");
    dialog.querySelector("[name=currentPassword]").focus();
  }, { signal: controller.signal });
  bindClaveTemporal({ root: dialog, signal: controller.signal, change, logout });
  signal?.addEventListener("abort", dispose, { once: true });
  page.body.style.overflow = "hidden";
  dialog.showModal();
  return dispose;
}
