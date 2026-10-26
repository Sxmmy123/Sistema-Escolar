import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { APP_VERSION } from "../../firebase/config.js";
import { auth } from "../../firebase/client.js";
import { authEmailForLogin } from "../../services/users.js";
import { resolveUserRole } from "../../services/authSession.js";
import { icon } from "../../ui/dom.js";
import { createIcons, ArrowLeft, Mail } from "lucide";
import { solicitarRecuperacion } from "../../services/recuperacionContrasena.js";

function publicAsset(path) {
  return `${import.meta.env.BASE_URL || "./"}${path}`;
}

export function LoginView() {
  return `
    <section class="min-h-screen bg-cover bg-center" style="background-image:linear-gradient(90deg, rgba(7,23,43,.82), rgba(7,23,43,.35)), url('${publicAsset("images/login-fondo.png")}')">
      <div class="flex min-h-screen items-center px-4 py-8">
        <div class="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_440px] lg:items-center">
          <div class="text-white">
            <img src="${publicAsset("images/logo-nueva-bolivia.png")}" alt="Unidad Educativa" class="mb-6 h-24 w-24 rounded-full bg-white object-contain p-2 shadow-soft" />
            <p class="text-sm font-black uppercase tracking-[.28em] text-yellow-300">Sistema escolar</p>
            <h1 class="mt-3 max-w-3xl text-4xl font-black leading-tight md:text-6xl">Unidad Educativa Ecologica Nueva Bolivia</h1>
            <p class="mt-4 max-w-2xl text-lg font-semibold leading-8 text-white/85">Acceso al sistema academico institucional.</p>
          </div>

          <div data-login-panel>
          <form class="glass-panel rounded-3xl p-6 shadow-2xl" data-login-form>
            <div class="mb-6">
              <p class="text-xs font-black uppercase tracking-[.22em] text-school-navy">Ingreso seguro</p>
              <h2 class="mt-1 text-2xl font-black text-slate-900">Login</h2>
            </div>
            <label for="login-usuario" class="text-sm font-black text-slate-700">Usuario o correo</label>
            <input id="login-usuario" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-school-navy focus:ring-4 focus:ring-school-navy/10" name="login" type="text" autocomplete="username" placeholder="usuario000 o correo@ejemplo.com" required />
            <label for="login-contrasena" class="mt-4 block text-sm font-black text-slate-700">Contrasena</label>
            <input id="login-contrasena" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-school-navy focus:ring-4 focus:ring-school-navy/10" name="password" type="password" autocomplete="current-password" placeholder="contrasena" required />
            <p class="mt-4 hidden rounded-2xl border px-4 py-3 text-sm font-bold" data-login-status></p>
            <button class="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-school-navy px-4 py-3 font-black text-white shadow-soft transition hover:bg-slate-950 disabled:cursor-wait disabled:opacity-70" type="submit">
              ${icon("log-in", "h-5 w-5")} Entrar
            </button>
            <button type="button" data-open-recovery class="mt-4 min-h-10 w-full text-center text-sm font-medium text-school-navy underline-offset-4 hover:underline disabled:opacity-50">Olvide mi contrasena</button>
            <p class="mt-4 text-center text-xs font-bold text-slate-400">${APP_VERSION}</p>
          </form>
          <form class="hidden glass-panel rounded-3xl p-6 shadow-2xl" data-recovery-form aria-labelledby="recovery-title">
            <div class="mb-5"><p class="text-xs font-semibold uppercase tracking-[.12em] text-school-navy">Recuperacion de acceso</p><h2 id="recovery-title" class="mt-2 text-2xl font-semibold text-slate-900">Recuperar contrasena</h2></div>
            <label for="recovery-usuario" class="text-sm font-medium text-slate-700">Usuario o correo</label>
            <input id="recovery-usuario" name="login" type="text" autocomplete="username" maxlength="254" required class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-school-navy focus:ring-4 focus:ring-school-navy/10" placeholder="usuario000 o correo@ejemplo.com">
            <p class="mt-3 text-sm leading-6 text-slate-600">Recibiras un enlace en el correo asociado a tu cuenta.</p>
            <p data-recovery-status role="status" aria-live="polite" class="hidden"></p>
            <button type="submit" class="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-school-navy px-4 py-3 text-sm font-semibold text-white hover:bg-slate-950 disabled:cursor-wait disabled:opacity-60">${icon("mail", "h-4 w-4")}Enviar enlace</button>
            <button type="button" data-close-recovery class="mt-3 flex min-h-10 w-full items-center justify-center gap-2 text-sm text-slate-700 hover:underline">${icon("arrow-left", "h-4 w-4")}Volver al ingreso</button>
            <p class="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">Sin correo asociado, solicita ayuda a administracion.</p>
          </form>
          </div>
        </div>
      </div>
    </section>
  `;
}

function setStatus(message, type = "info") {
  const status = document.querySelector("[data-login-status]");
  if (!status) return;
  const tone = type === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-blue-200 bg-blue-50 text-blue-700";
  status.className = `mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${tone}`;
  status.textContent = message;
}

function friendlyAuthError(error, login) {
  const code = error?.code || "";
  const isUsername = !String(login || "").includes("@");

  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-login-credentials"].includes(code)) {
    return isUsername
      ? "No se pudo ingresar. Revisa que el usuario exista y que la contrasena sea correcta."
      : "No se pudo ingresar. Revisa el correo y la contrasena.";
  }

  if (code === "auth/operation-not-allowed") {
    return "Activa el metodo Correo/Contrasena en Firebase Authentication.";
  }

  if (code === "auth/invalid-email") {
    return "El usuario o correo no tiene un formato valido.";
  }

  if (code === "auth/network-request-failed") {
    return "No hay conexion con Firebase. Revisa internet e intenta otra vez.";
  }

  if (code === "auth/unauthorized-domain") {
    return "Este dominio no esta autorizado en Firebase. Abre con localhost o agrega 127.0.0.1 en Authentication > Configuracion > Dominios autorizados.";
  }

  if (code === "auth/too-many-requests") {
    return "Demasiados intentos. Espera un momento e intenta nuevamente.";
  }

  return `${error?.message || "No se pudo ingresar. Revisa usuario y contrasena."} (${code || "sin-codigo"})`;
}

export function bindLogin() {
  const form = document.querySelector("[data-login-form]");
  const recovery = document.querySelector("[data-recovery-form]");
  const openRecovery = form?.querySelector("[data-open-recovery]");
  createIcons({ icons: { ArrowLeft, Mail } });
  openRecovery?.addEventListener("click", () => {
    recovery.elements.namedItem("login").value = form.elements.namedItem("login").value.trim();
    form.elements.namedItem("password").value = "";
    form.classList.add("hidden");
    recovery.classList.remove("hidden");
    recovery.elements.namedItem("login").focus();
  });
  recovery?.querySelector("[data-close-recovery]")?.addEventListener("click", () => {
    form.elements.namedItem("login").value = recovery.elements.namedItem("login").value.trim();
    recovery.classList.add("hidden");
    form.classList.remove("hidden");
    form.elements.namedItem("login").focus();
  });
  let recovering = false;
  recovery?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (recovering) return;
    const input = recovery.elements.namedItem("login");
    input.value = input.value.trim();
    if (!recovery.reportValidity()) return;
    const button = recovery.querySelector("button[type=submit]");
    const status = recovery.querySelector("[data-recovery-status]");
    const showStatus = (message, error = false) => {
      status.className = `mt-4 rounded-lg border px-3 py-3 text-sm leading-6 ${error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-900"}`;
      status.textContent = message;
    };
    recovering = true;
    button.disabled = true;
    input.disabled = true;
    showStatus("Solicitando enlace...");
    try { showStatus(await solicitarRecuperacion(input.value)); }
    catch (error) { showStatus(error.message, true); }
    finally { recovering = false; button.disabled = false; input.disabled = false; }
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const data = new FormData(form);
    const login = String(data.get("login") || "").trim();
    const password = String(data.get("password") || "");

    button.disabled = true;
    if (openRecovery) openRecovery.disabled = true;
    setStatus("Verificando cuenta...");

    let email = "";
    let stage = "usuario";
    try {
      email = await authEmailForLogin(login);
      stage = "autenticacion";
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      stage = "perfil";
      const role = await resolveUserRole(user);

      sessionStorage.setItem("sesionRol", role);
      sessionStorage.setItem("sesionUsuario", user.email || email);
      sessionStorage.setItem("sesionUid", user.uid);
      sessionStorage.removeItem("sesionAlumnoId");
      sessionStorage.removeItem("sesionAlumnoCursoId");
      window.location.hash = `#/${role}`;
    } catch (error) {
      console.warn(`No se pudo iniciar sesion (${stage}: ${error?.code || "perfil-no-disponible"}).`);
      if (auth.currentUser) await signOut(auth).catch(() => {});
      setStatus(friendlyAuthError(error, login), "error");
    } finally {
      button.disabled = false;
      if (openRecovery) openRecovery.disabled = false;
    }
  });
}

