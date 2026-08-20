import { createIcons, icons } from "lucide";
import { onAuthStateChanged, signOut } from "firebase/auth";
import "./styles.css";
import "./firebase/client.js";
import { auth } from "./firebase/client.js";
import { setView } from "./ui/dom.js";
import { LoginView, bindLogin } from "./modules/login/LoginView.js";
import { AdminDashboard } from "./modules/admin/AdminDashboard.js";
import { bindAdminPages } from "./modules/admin/AdminBindings.js";
import { DocenteDashboard } from "./modules/docente/DocenteDashboard.js";
import { bindDocentePages } from "./modules/docente/ControladorDocente.js";
import { DirectorDashboard } from "./modules/director/DirectorDashboard.js";
import { bindDirectorPages } from "./modules/director/DirectorBindings.js";
import { DirectorAttendance } from "./modules/director/DirectorAttendance.js";
import { DirectorConfig } from "./modules/director/DirectorConfig.js";
import { DirectorCoursesSchedules } from "./modules/director/DirectorCoursesSchedules.js";
import { DirectorNotes } from "./modules/director/DirectorNotes.js";
import { DirectorReports } from "./modules/director/DirectorReports.js";
import { DirectorStudents } from "./modules/director/DirectorStudents.js";
import { DirectorTeachers } from "./modules/director/DirectorTeachers.js";
import { AlumnoDashboard, bindAlumnoPage } from "./modules/alumno/AlumnoDashboard.js";
import { AdminModule, DocenteModule } from "./modules/pages/ModulePages.js";
import { homeForRole, resolveUserRole, routeRequiredRole } from "./services/authSession.js";
import { changeOwnPassword, setRecoveryEmail } from "./services/accountSettings.js";
import { registerServiceWorker } from "./pwa/registerServiceWorker.js";

registerServiceWorker();

const routes = {
  "/": () => LoginView(),
  "/admin": () => AdminDashboard(),
  "/admin/alumnos": () => AdminModule("/admin/alumnos"),
  "/admin/docentes": () => AdminModule("/admin/docentes"),
  "/admin/director": () => AdminModule("/admin/director"),
  "/admin/horarios": () => AdminModule("/admin/horarios"),
  "/admin/auditoria": () => AdminModule("/admin/auditoria"),
  "/docente": () => DocenteDashboard(),
  "/docente/asistencia": () => DocenteModule("/docente/asistencia"),
  "/docente/tareas": () => DocenteModule("/docente/tareas"),
  "/docente/calificar": () => DocenteModule("/docente/calificar"),
  "/docente/regularizacion": () => DocenteModule("/docente/regularizacion"),
  "/docente/notas": () => DocenteModule("/docente/notas"),
  "/docente/boletin": () => DocenteModule("/docente/boletin"),
  "/docente/resumen": () => DocenteModule("/docente/resumen"),
  "/docente/horario": () => DocenteModule("/docente/horario"),
  "/director": () => DirectorDashboard(),
  "/director/estudiantes": () => DirectorStudents(),
  "/director/docentes": () => DirectorTeachers(),
  "/director/cursos-horarios": () => DirectorCoursesSchedules(),
  "/director/asistencia": () => DirectorAttendance(),
  "/director/asistencias": () => DirectorAttendance(),
  "/director/notas": () => DirectorNotes(),
  "/director/reportes": () => DirectorReports(),
  "/director/configuracion": () => DirectorConfig(),
  "/alumno": () => AlumnoDashboard("/alumno"),
  "/alumno/boleta": () => AlumnoDashboard("/alumno/boleta")
};

let authReady = false;
let activeUser = null;
let activeRole = "";
let renderLock = false;

function currentRoute() {
  return (window.location.hash || "#/").replace(/^#/, "") || "/";
}

function loadingView(message = "Verificando sesion...") {
  return `
    <main class="grid min-h-screen place-items-center bg-slate-100 px-4">
      <section class="rounded-3xl bg-white p-8 text-center shadow-soft">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-school-navy"></div>
        <p class="mt-4 font-black text-slate-700">${message}</p>
      </section>
    </main>
  `;
}

function rememberSession(role, user) {
  sessionStorage.setItem("sesionRol", role);
  sessionStorage.setItem("sesionUsuario", user?.email || "");
  sessionStorage.setItem("sesionUid", user?.uid || "");
}

function clearSession() {
  sessionStorage.clear();
  activeUser = null;
  activeRole = "";
}

function localStudentSession() {
  const role = sessionStorage.getItem("sesionRol");
  const alumnoId = sessionStorage.getItem("sesionAlumnoId");
  if (role !== "alumno" || !alumnoId) return null;
  return {
    role: "alumno",
    user: {
      uid: `alumno:${alumnoId}`,
      email: sessionStorage.getItem("sesionUsuario") || ""
    }
  };
}

async function doLogout() {
  await signOut(auth).catch(() => {});
  clearSession();
  if (currentRoute() !== "/") window.location.hash = "#/";
  render();
}

function bindShell() {
  const sidebar = document.querySelector("[data-sidebar]");
  const backdrop = document.querySelector("[data-sidebar-backdrop]");
  const open = () => {
    sidebar?.classList.remove("-translate-x-full");
    backdrop?.classList.remove("hidden");
  };
  const close = () => {
    sidebar?.classList.add("-translate-x-full");
    backdrop?.classList.add("hidden");
  };

  document.querySelectorAll("[data-action='open-menu']").forEach((button) => button.addEventListener("click", open));
  document.querySelectorAll("[data-action='close-menu']").forEach((button) => button.addEventListener("click", close));
  backdrop?.addEventListener("click", close);
  document.querySelectorAll("[data-sidebar] a").forEach((link) => link.addEventListener("click", close));

  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", doLogout);
  });

  bindAccountSettings();
}

function accountStatus(message, type = "info") {
  const status = document.querySelector("[data-account-status]");
  if (!status) return;
  const tone = type === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-green-200 bg-green-50 text-green-700";
  status.className = `mx-5 mb-5 rounded-2xl border px-4 py-3 text-sm font-bold ${tone}`;
  status.textContent = message;
}

function accountErrorMessage(error) {
  const code = error?.code || "";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "La contrasena actual no es correcta.";
  if (code === "auth/requires-recent-login") return "Por seguridad vuelve a ingresar y repite el cambio.";
  if (code === "auth/email-already-in-use") return "Ese correo ya esta usado por otra cuenta.";
  if (code === "auth/invalid-email") return "El correo no tiene formato valido.";
  if (code === "auth/weak-password") return "La nueva contrasena es muy debil.";
  return error?.message || "No se pudo guardar el cambio.";
}

function bindAccountSettings() {
  const modal = document.querySelector("[data-account-modal]");
  if (!modal) return;

  const open = () => {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  };
  const close = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  document.querySelectorAll("[data-action='open-account-settings']").forEach((button) => button.addEventListener("click", open));
  document.querySelectorAll("[data-action='close-account-settings']").forEach((button) => button.addEventListener("click", close));

  document.querySelector("[data-account-email-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    const data = new FormData(form);
    button.disabled = true;
    accountStatus("Guardando correo...");
    try {
      const email = await setRecoveryEmail({
        email: data.get("email"),
        currentPassword: data.get("currentPassword")
      });
      accountStatus(`Correo guardado: ${email}`);
      form.reset();
    } catch (error) {
      accountStatus(accountErrorMessage(error), "error");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("[data-account-password-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    const data = new FormData(form);
    button.disabled = true;
    accountStatus("Cambiando contrasena...");
    try {
      await changeOwnPassword({
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword"),
        confirmPassword: data.get("confirmPassword")
      });
      accountStatus("Contrasena actualizada correctamente.");
      form.reset();
    } catch (error) {
      accountStatus(accountErrorMessage(error), "error");
    } finally {
      button.disabled = false;
    }
  });
}

function afterRender(route) {
  createIcons({ icons });
  if (route === "/") bindLogin();
  bindShell();
  bindAdminPages(route);
  bindDocentePages(route);
  bindDirectorPages(route);
  bindAlumnoPage(route);
}

function redirectTo(route) {
  if (currentRoute() !== route) {
    window.location.hash = `#${route}`;
    return true;
  }
  return false;
}

function render() {
  if (renderLock) return;
  renderLock = true;

  try {
    if (!authReady) {
      setView(loadingView());
      return;
    }

    const route = currentRoute();
    const requiredRole = routeRequiredRole(route);
    const studentSession = localStudentSession();
    const sessionUser = activeUser || studentSession?.user || null;
    const sessionRole = activeRole || studentSession?.role || "";

    if (route === "/" && sessionUser && sessionRole) {
      if (redirectTo(homeForRole(sessionRole))) return;
    }

    if (requiredRole && (!sessionUser || !sessionRole)) {
      clearSession();
      if (redirectTo("/")) return;
    }

    if (requiredRole && requiredRole !== sessionRole) {
      if (redirectTo(homeForRole(sessionRole))) return;
    }

    const view = routes[route] || routes["/"];
    const finalRoute = routes[route] ? route : "/";
    setView(view());
    afterRender(finalRoute);
  } finally {
    renderLock = false;
  }
}

onAuthStateChanged(auth, async (user) => {
  setView(loadingView());

  try {
    if (!user) {
      if (!localStudentSession()) clearSession();
    } else {
      const role = await resolveUserRole(user);
      activeUser = user;
      activeRole = role;
      rememberSession(role, user);
    }
  } catch (error) {
    console.error("Sesion invalida", error);
    await signOut(auth).catch(() => {});
    clearSession();
  } finally {
    authReady = true;
    render();
  }
});

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);








