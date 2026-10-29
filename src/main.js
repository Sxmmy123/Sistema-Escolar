import { createIcons, LogIn } from "lucide";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import "./styles.css";
import "./theme.css";
import "./firebase/client.js";
import { auth, firestore } from "./firebase/client.js";
import { cargarConfiguracion, claveCache, configuracionActual, establecerConfiguracion, gestionActual, observarConfiguracion, VERSION_MODELO } from "./services/rutasFirestore.js";
import { gestionDelCalendario } from "./services/fechaEscolar.js";
import { gestionAdministrativaDisponible } from "./services/registroEscolar.js";
import { estadoMenuLateral } from "./ui/menuLateral.js";
import { bindRegistroDocente } from "./ui/gestionDocente.js";
import { setView } from "./ui/dom.js";
import { LoginView, bindLogin } from "./modules/login/LoginView.js";
import { crearCargaPorRol } from "./modules/cargaPorRol.js";
import { homeForRole, resolveUserRole, routeRequiredRole } from "./services/authSession.js";
import { bindAccountSettings } from "./ui/accountSettings.js";
import { initializeTheme, bindThemeButtons } from "./ui/theme.js";
import { registerServiceWorker } from "./pwa/registerServiceWorker.js";

initializeTheme();
registerServiceWorker();

const modulosPorRol = crearCargaPorRol();

let authReady = false;
let authRevision = 0;
let activeUser = null;
let activeRole = "";
let renderRevision = 0;
let moduloMontado = null;
let shellBindingsController = null;
let stopConfigurationWatch = null;
let stopTeacherAccessWatch = null;
let configurationNeedsReload = false;

const TEACHER_SIDEBAR_COLLAPSE_KEY = "colegio-sidebar-docente-colapsado";

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

async function doLogout() {
  ++renderRevision;
  desmontarRol();
  shellBindingsController?.abort();
  await signOut(auth).catch(() => {});
  clearSession();
  if (currentRoute() !== "/") window.location.hash = "#/";
  render();
}

function bindShell() {
  shellBindingsController?.abort();
  shellBindingsController = new AbortController();
  const { signal } = shellBindingsController;
  bindThemeButtons({ signal });
  bindRegistroDocente(signal);
  const sidebar = document.querySelector("[data-sidebar]");
  const backdrop = document.querySelector("[data-sidebar-backdrop]");
  const workspace = document.querySelector("main");
  const mobileMenu = window.matchMedia("(max-width: 1023px)");
  const menuButtons = [...document.querySelectorAll("[data-action='open-menu']")];
  const collapseButton = document.querySelector("[data-action='toggle-sidebar-collapse']");
  let lastMenuButton = null;

  const syncMobileMenu = (open) => {
    if (!sidebar) return;
    const estado = estadoMenuLateral(mobileMenu.matches, open, sidebar.classList.contains("lg:hidden"));
    sidebar.classList.toggle("-translate-x-full", estado.oculto);
    backdrop?.classList.toggle("hidden", !estado.abierto);
    document.body.classList.toggle("mobile-sidebar-open", estado.abierto);
    sidebar.inert = estado.oculto;
    sidebar.setAttribute("aria-hidden", String(estado.oculto));
    backdrop?.setAttribute("aria-hidden", String(!estado.abierto));
    menuButtons.forEach((button) => button.setAttribute("aria-expanded", String(estado.abierto)));
    if (workspace) workspace.inert = estado.contenidoBloqueado;
  };

  const open = () => {
    if (!mobileMenu.matches || !sidebar) return;
    const sidebarScroll = sidebar.querySelector("[data-sidebar-scroll]");
    if (sidebarScroll) sidebarScroll.scrollTop = 0;
    syncMobileMenu(true);
    document.querySelector("[data-action='close-menu']")?.focus({ preventScroll: true });
  };
  const close = ({ restoreFocus = false } = {}) => {
    if (!sidebar) return;
    const wasOpen = !sidebar.classList.contains("-translate-x-full");
    syncMobileMenu(false);
    if (restoreFocus && wasOpen) lastMenuButton?.focus({ preventScroll: true });
  };

  menuButtons.forEach((button) => button.addEventListener("click", () => {
    lastMenuButton = button;
    open();
  }, { signal }));
  document.querySelectorAll("[data-action='close-menu']").forEach((button) => button.addEventListener("click", () => close({ restoreFocus: true }), { signal }));
  backdrop?.addEventListener("click", () => close({ restoreFocus: true }), { signal });
  document.querySelectorAll("[data-sidebar] a").forEach((link) => link.addEventListener("click", () => close(), { signal }));

  if (sidebar) syncMobileMenu(false);

  const syncCollapsedSidebar = (collapsed, persist = false) => {
    document.documentElement.classList.toggle("teacher-sidebar-collapsed", collapsed);
    if (collapseButton) {
      const label = collapsed ? "Expandir menu" : "Contraer menu";
      collapseButton.setAttribute("aria-label", label);
      collapseButton.setAttribute("title", label);
      collapseButton.setAttribute("aria-expanded", String(!collapsed));
    }
    if (persist) {
      try {
        localStorage.setItem(TEACHER_SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
      } catch {
        // El menu sigue funcionando aunque el navegador bloquee el almacenamiento.
      }
    }
  };

  if (collapseButton) {
    let savedCollapsed = false;
    try {
      savedCollapsed = localStorage.getItem(TEACHER_SIDEBAR_COLLAPSE_KEY) === "1";
    } catch {
      savedCollapsed = false;
    }
    syncCollapsedSidebar(savedCollapsed);
    collapseButton.addEventListener("click", () => {
      syncCollapsedSidebar(!document.documentElement.classList.contains("teacher-sidebar-collapsed"), true);
    }, { signal });
  }

  mobileMenu.addEventListener("change", () => close(), { signal });
  window.addEventListener("storage", (event) => {
    if (event.key === TEACHER_SIDEBAR_COLLAPSE_KEY) syncCollapsedSidebar(event.newValue === "1");
  }, { signal });
  document.addEventListener("keydown", (event) => {
    if (!sidebar || sidebar.classList.contains("-translate-x-full") || !mobileMenu.matches) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close({ restoreFocus: true });
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...sidebar.querySelectorAll("a[href], button:not([disabled]), [tabindex='0']")]
      .filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }, { signal });

  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", doLogout, { signal });
  });

  bindAccountSettings({ signal, beforeOpen: close });
}

function desmontarRol() {
  moduloMontado?.desmontar?.();
  moduloMontado = null;
  document.body.classList.remove("mobile-sidebar-open");
}

function afterRender(route, modulo) {
  if (modulo) modulo.actualizarIconos();
  else {
    createIcons({ icons: { LogIn } });
    bindLogin();
  }
  bindShell();
  if (modulo) {
    Promise.resolve(modulo.vincular(route)).catch((error) => console.error("No se pudo cargar la pantalla", error));
  }
}

function redirectTo(route) {
  if (currentRoute() !== route) {
    window.location.hash = `#${route}`;
    return true;
  }
  return false;
}

async function render() {
  const revision = ++renderRevision;
  const sessionRevision = authRevision;
  const route = currentRoute();
  const vistaVigente = () => revision === renderRevision && sessionRevision === authRevision && route === currentRoute();

  try {
    if (!authReady) {
      setView(loadingView());
      return;
    }

    if (configurationNeedsReload) {
      desmontarRol();
      shellBindingsController?.abort();
      setView(`<main class="mx-auto max-w-lg p-6"><h1 class="text-lg font-semibold">La gestion escolar cambio</h1><p class="mt-3 text-sm text-slate-700">Administracion actualizo el ano escolar. Recarga para consultar la gestion vigente. No se puede registrar con la configuracion anterior.</p><button data-reload-configuration class="mt-4 rounded-lg bg-school-green px-4 py-2 text-sm text-white">Recargar sistema</button><button data-exit class="ml-3 text-sm text-slate-600">Cerrar sesion</button></main>`);
      document.querySelector("[data-reload-configuration]")?.addEventListener("click", () => window.location.reload());
      document.querySelector("[data-exit]")?.addEventListener("click", doLogout);
      return;
    }

    const requiredRole = routeRequiredRole(route);
    const sessionUser = activeUser;
    const sessionRole = activeRole;

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

    if (requiredRole === "admin" && !gestionAdministrativaDisponible(configuracionActual()) && route !== "/admin") {
      if (redirectTo("/admin")) return;
    }
    if (requiredRole && configuracionActual().versionModelo !== VERSION_MODELO) {
      if (sessionRole !== "admin") {
        desmontarRol();
        shellBindingsController?.abort();
        setView(`<main class="mx-auto max-w-lg p-6"><h1 class="text-lg font-semibold">Gestion escolar pendiente</h1><p class="mt-3 text-sm">Administracion debe preparar la gestion y publicar las reglas actualizadas.</p><button data-exit class="mt-4 rounded bg-school-green px-4 py-2 text-sm text-white">Cerrar sesion</button></main>`);
        document.querySelector("[data-exit]")?.addEventListener("click", doLogout);
        return;
      }
    }

    if (!requiredRole) {
      if (route !== "/" && redirectTo(sessionRole ? homeForRole(sessionRole) : "/")) return;
      desmontarRol();
      setView(LoginView());
      afterRender("/");
      return;
    }

    let modulo = modulosPorRol.obtener(sessionRole);
    if (!modulo) {
      desmontarRol();
      shellBindingsController?.abort();
      setView(loadingView("Cargando tu espacio..."));
      modulo = await modulosPorRol.cargar(sessionRole);
    }

    // Una descarga anterior no debe sustituir la pantalla de otra ruta o sesion.
    if (!vistaVigente() || auth.currentUser?.uid !== sessionUser.uid || activeUser?.uid !== sessionUser.uid || activeRole !== sessionRole) return;
    await modulo.preparar?.();
    if (!vistaVigente() || auth.currentUser?.uid !== sessionUser.uid || activeUser?.uid !== sessionUser.uid || activeRole !== sessionRole) return;
    const view = modulo.rutas[route];
    if (!view) {
      redirectTo(homeForRole(sessionRole));
      return;
    }
    if (moduloMontado !== modulo) desmontarRol();
    moduloMontado = modulo;
    setView(view());
    afterRender(route, modulo);
  } catch (error) {
    if (!vistaVigente()) return;
    console.error("No se pudo descargar el modulo", error);
    desmontarRol();
    shellBindingsController?.abort();
    setView(`<main class="mx-auto max-w-lg p-6"><h1 class="text-lg font-semibold">No se pudo cargar esta pantalla</h1><p class="mt-3 text-sm text-slate-700">Comprueba tu conexion y vuelve a intentar. Si el sistema acaba de actualizarse, recarga la pagina.</p><button data-retry-module class="mt-4 rounded-lg bg-school-green px-4 py-2 text-sm text-white">Reintentar</button><button data-reload-module class="ml-3 text-sm text-slate-600">Recargar</button><button data-exit class="ml-3 text-sm text-slate-600">Cerrar sesion</button></main>`);
    document.querySelector("[data-retry-module]")?.addEventListener("click", render);
    document.querySelector("[data-reload-module]")?.addEventListener("click", () => window.location.reload());
    document.querySelector("[data-exit]")?.addEventListener("click", doLogout);
  }
}

onAuthStateChanged(auth, async (user) => {
  const revision = ++authRevision;
  ++renderRevision;
  desmontarRol();
  shellBindingsController?.abort();
  stopConfigurationWatch?.();
  stopConfigurationWatch = null;
  stopTeacherAccessWatch?.();
  stopTeacherAccessWatch = null;
  configurationNeedsReload = false;
  authReady = false;
  activeUser = null;
  activeRole = "";
  setView(loadingView());

  try {
    if (!user) {
      clearSession();
    } else {
      const role = await resolveUserRole(user);
      try {
        await cargarConfiguracion(firestore);
      } catch (error) {
        establecerConfiguracion({});
        console.warn("No se pudo leer la configuracion del sistema. Publica las reglas actualizadas.", error);
      }
      if (revision !== authRevision || auth.currentUser?.uid !== user.uid) return;
      activeUser = user;
      activeRole = role;
      rememberSession(role, user);
      if (role === "docente") {
        const stopProfile = onSnapshot(doc(firestore, "usuarios", user.uid), (snapshot) => {
          if (revision !== authRevision) return;
          if (!snapshot.exists() || snapshot.data().activo === false) doLogout();
        }, (error) => console.warn("No se pudo verificar el acceso docente", error));
        let previousAssignment = "";
        const stopAssignment = onSnapshot(doc(firestore, "gestiones", gestionActual(), "asignaciones", user.uid), (snapshot) => {
          if (revision !== authRevision) return;
          const next = JSON.stringify(snapshot.data() || {});
          if (next === previousAssignment) return;
          previousAssignment = next;
          try { sessionStorage.removeItem(claveCache("contexto_modalidad_v2", user.uid)); } catch { /* No hay cache local disponible. */ }
          window.dispatchEvent(new Event("teacher-assignment-changed"));
          if (authReady) render();
        }, (error) => console.warn("No se pudo actualizar la asignacion docente", error));
        stopTeacherAccessWatch = () => { stopProfile(); stopAssignment(); };
      }
      stopConfigurationWatch = observarConfiguracion(firestore, (next) => {
        if (revision !== authRevision || auth.currentUser?.uid !== user.uid) return;
        next = { ...next, gestionActivaId: next.gestionActivaId || gestionDelCalendario(), versionModelo: Number(next.versionModelo || 0) };
        const previous = configuracionActual();
        if (next.gestionActivaId !== previous.gestionActivaId || next.versionModelo !== previous.versionModelo) {
          configurationNeedsReload = true;
          establecerConfiguracion({ ...previous, gestionHabilitada: false });
          render();
        } else if (next.gestionHabilitada !== previous.gestionHabilitada) {
          establecerConfiguracion(next);
          render();
        } else {
          establecerConfiguracion(next);
        }
      }, (error) => {
        if (revision !== authRevision) return;
        console.warn("No se pudo verificar la habilitacion de la gestion", error);
        establecerConfiguracion({ ...configuracionActual(), gestionHabilitada: false });
        render();
      });
    }
  } catch (error) {
    if (revision !== authRevision) return;
    console.error("Sesion invalida", error);
    await signOut(auth).catch(() => {});
    clearSession();
  } finally {
    if (revision === authRevision) {
      authReady = true;
      render();
    }
  }
});

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

let calendarYear = gestionDelCalendario();
setInterval(() => {
  const next = gestionDelCalendario();
  if (next === calendarYear) return;
  calendarYear = next;
  render();
}, 60000);








