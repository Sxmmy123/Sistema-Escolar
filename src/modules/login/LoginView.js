import { signInWithEmailAndPassword } from "firebase/auth";
import { APP_VERSION } from "../../firebase/config.js";
import { auth } from "../../firebase/client.js";
import { authEmailForLogin } from "../../services/users.js";
import { loginStudentAccess } from "../../services/studentAccess.js";
import { resolveUserRole } from "../../services/authSession.js";
import { icon } from "../../ui/dom.js";


export function LoginView() {
  return `
    <section class="min-h-screen bg-cover bg-center" style="background-image:linear-gradient(90deg, rgba(7,23,43,.82), rgba(7,23,43,.35)), url('/images/login-fondo.png')">
      <div class="flex min-h-screen items-center px-4 py-8">
        <div class="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_440px] lg:items-center">
          <div class="text-white">
            <img src="/images/logo-nueva-bolivia.png" alt="Unidad Educativa" class="mb-6 h-24 w-24 rounded-full bg-white object-contain p-2 shadow-soft" />
            <p class="text-sm font-black uppercase tracking-[.28em] text-yellow-300">Sistema escolar</p>
            <h1 class="mt-3 max-w-3xl text-4xl font-black leading-tight md:text-6xl">Unidad Educativa Ecologica Nueva Bolivia</h1>
            <p class="mt-4 max-w-2xl text-lg font-semibold leading-8 text-white/85">Acceso al sistema academico institucional.</p>
          </div>

          <form class="glass-panel rounded-3xl p-6 shadow-2xl" data-login-form>
            <div class="mb-6">
              <p class="text-xs font-black uppercase tracking-[.22em] text-school-navy">Ingreso seguro</p>
              <h2 class="mt-1 text-2xl font-black text-slate-900">Login</h2>
            </div>
            <label class="text-sm font-black text-slate-700">Usuario o correo</label>
            <input class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-school-navy focus:ring-4 focus:ring-school-navy/10" name="login" type="text" autocomplete="username" placeholder="usuario000 o correo@ejemplo.com" required />
            <label class="mt-4 block text-sm font-black text-slate-700">Contrasena</label>
            <input class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-school-navy focus:ring-4 focus:ring-school-navy/10" name="password" type="password" autocomplete="current-password" placeholder="contrasena" required />
            <p class="mt-4 hidden rounded-2xl border px-4 py-3 text-sm font-bold" data-login-status></p>
            <button class="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-school-navy px-4 py-3 font-black text-white shadow-soft transition hover:bg-slate-950 disabled:cursor-wait disabled:opacity-70" type="submit">
              ${icon("log-in", "h-5 w-5")} Entrar
            </button>
            <p class="mt-4 text-center text-xs font-bold text-slate-400">${APP_VERSION}</p>
          </form>
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

function looksLikeStudentLogin(login) {
  return /^[a-z0-9._-]+$/i.test(String(login || "").trim()) && /\d/.test(String(login || ""));
}

export function bindLogin() {
  const form = document.querySelector("[data-login-form]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const data = new FormData(form);
    const login = String(data.get("login") || "").trim();
    const email = await authEmailForLogin(login);
    const password = String(data.get("password") || "");

    button.disabled = true;
    setStatus("Verificando cuenta...");

    let studentLoginError = null;
    try {
      if (!login.includes("@")) {
        try {
          const studentAccess = await loginStudentAccess(login, password);
          sessionStorage.setItem("sesionRol", "alumno");
          sessionStorage.setItem("sesionUsuario", studentAccess.usuario);
          sessionStorage.setItem("sesionUid", `alumno:${studentAccess.alumnoId}`);
          sessionStorage.setItem("sesionAlumnoId", studentAccess.alumnoId);
          sessionStorage.setItem("sesionAlumnoCursoId", studentAccess.cursoId || "");
          window.location.hash = "#/alumno";
          return;
        } catch (studentError) {
          studentLoginError = studentError;
          console.info("No ingreso como alumno local, se intentara Firebase Auth.", studentError?.message || studentError);
        }
      }

      const credential = await signInWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      const role = await resolveUserRole(user);

      sessionStorage.setItem("sesionRol", role);
      sessionStorage.setItem("sesionUsuario", user.email || email);
      sessionStorage.setItem("sesionUid", user.uid);
      window.location.hash = `#/${role}`;
    } catch (error) {
      console.error("Login Firebase error", { code: error?.code, message: error?.message, login, email });
      if (!login.includes("@") && looksLikeStudentLogin(login) && studentLoginError?.message) {
        setStatus(`${studentLoginError.message} Si el alumno ya fue cargado, revisa que exista en accesos_alumnos y que las reglas de Firestore esten publicadas.`, "error");
      } else {
        setStatus(friendlyAuthError(error, login), "error");
      }
    } finally {
      button.disabled = false;
    }
  });
}





