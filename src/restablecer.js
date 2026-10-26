import "./modules/login/restablecer.css";
import { authRecuperacion } from "./firebase/authRecuperacion.js";
import { firebaseConfig } from "./firebase/config.js";
import { destinoAccionFirebase, leerAccionCorreo } from "./services/restablecimientoContrasena.js";
import { bindRestablecerContrasena, RestablecerContrasenaView } from "./modules/login/RestablecerContrasena.js";

async function iniciar() {
  const originalHref = window.location.href;
  let action = null;
  let initialError = null;
  try { action = leerAccionCorreo(originalHref, firebaseConfig.apiKey); }
  catch { initialError = { code: "restablecimiento/enlace-invalido" }; }
  // Remove the one-time code from history and any cache left by a previous service worker.
  window.history.replaceState(null, "", window.location.pathname);
  if ("caches" in window) limpiarCacheAnterior(originalHref);
  if (action && action.mode !== "resetPassword") {
    window.location.replace(destinoAccionFirebase(action, firebaseConfig));
    return;
  }
  const root = document.getElementById("restablecimiento");
  const login = new URL("./", originalHref);
  login.hash = "/";
  root.innerHTML = RestablecerContrasenaView({ logo: `${import.meta.env.BASE_URL}images/logo-nueva-bolivia.png`, loginHref: login.href });
  const page = bindRestablecerContrasena(root, { auth: authRecuperacion, code: action?.code, initialError });
  window.addEventListener("pagehide", () => page.desmontar(), { once: true });
}

async function limpiarCacheAnterior(href) {
  try {
    for (const name of await caches.keys()) {
      if (name.startsWith("ue-ecologica-nb")) await (await caches.open(name)).delete(href);
    }
  } catch { /* La recuperacion sigue disponible si el navegador bloquea CacheStorage. */ }
}
iniciar();
