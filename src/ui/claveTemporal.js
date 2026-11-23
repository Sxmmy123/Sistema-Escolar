import { createIcons, CircleCheck, KeyRound } from "lucide";
import { cambiarClaveTemporal } from "../services/claveTemporal.js";

export function claveTemporalView() {
  return `<main class="grid min-h-screen place-items-center bg-slate-100 px-4 py-8"><section class="w-full max-w-md text-slate-900" aria-labelledby="clave-temporal-title">
    <div class="mb-5 text-school-green"><i data-lucide="key-round" class="h-8 w-8"></i></div>
    <h1 id="clave-temporal-title" class="text-xl font-semibold">Cambia tu contrasena temporal</h1>
    <p class="mt-2 text-sm text-slate-600">Crea una clave personal para continuar.</p>
    <form data-temporary-password-form class="mt-6 space-y-4">
      ${[["currentPassword", "Contrasena actual", "current-password"], ["newPassword", "Nueva contrasena", "new-password"], ["confirmPassword", "Confirmar nueva contrasena", "new-password"]].map(([name, label, autocomplete]) => `<label class="block text-sm font-medium">${label}<input name="${name}" type="password" autocomplete="${autocomplete}" required maxlength="128" ${name !== "currentPassword" ? 'minlength="12"' : ''} class="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"></label>`).join("")}
      <p class="text-xs text-slate-600">Entre 12 y 128 caracteres; no uses tu CI ni una clave solo numerica.</p>
      <button type="submit" class="min-h-11 w-full rounded-lg bg-school-green px-4 py-2 font-semibold text-white disabled:opacity-60">Cambiar contrasena</button>
    </form>
    <div data-temporary-success role="status" class="mt-6 hidden text-center text-school-green"><i data-lucide="circle-check" class="mx-auto h-12 w-12"></i><p class="mt-3 font-semibold">Contrasena actualizada</p><p class="mt-2 text-sm">Ingresa nuevamente con tu nueva clave.</p></div>
    <p data-temporary-status role="status" aria-live="polite" class="mt-4 break-words text-sm text-red-700"></p>
    <button type="button" data-temporary-exit class="mt-5 min-h-11 text-sm underline">Cerrar sesion</button>
  </section></main>`;
}

export function bindClaveTemporal({ root = document, signal, change = cambiarClaveTemporal, logout } = {}) {
  createIcons({ icons: { CircleCheck, KeyRound } });
  const form = root.querySelector("[data-temporary-password-form]"), status = root.querySelector("[data-temporary-status]"), exit = root.querySelector("[data-temporary-exit]");
  let busy = false, timer;
  signal?.addEventListener("abort", () => clearTimeout(timer), { once: true });
  exit?.addEventListener("click", () => { if (!busy) logout(); }, { signal });
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || signal?.aborted) return;
    const input = Object.fromEntries(new FormData(form));
    busy = true; status.textContent = "";
    const controls = [...root.querySelectorAll("input, button")];
    controls.forEach(control => { control.disabled = true; });
    try {
      await change(input);
      if (signal?.aborted) return;
      form.reset(); form.classList.add("hidden"); exit.classList.add("hidden");
      root.querySelector("[data-temporary-success]").classList.remove("hidden");
      timer = setTimeout(logout, 1500);
    } catch (error) {
      if (!signal?.aborted) { status.textContent = error.message || "No se pudo completar el cambio."; controls.forEach(control => { control.disabled = false; }); busy = false; }
    }
  }, { signal });
}
