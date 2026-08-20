import { doc, getDoc } from "firebase/firestore";
import { ADMIN_USER } from "../firebase/config.js";
import { firestore } from "../firebase/client.js";

const validRoles = new Set(["admin", "docente", "director", "alumno"]);

export async function resolveUserRole(user) {
  const email = String(user?.email || "").toLowerCase();

  if (user?.uid === ADMIN_USER.uid || email === ADMIN_USER.email) {
    return "admin";
  }

  const profile = await getDoc(doc(firestore, "usuarios", user.uid));
  if (!profile.exists()) {
    throw new Error("Este usuario aun no tiene perfil asignado en el sistema.");
  }

  const data = profile.data();
  if (data.activo === false) {
    throw new Error("Este usuario esta deshabilitado.");
  }

  const role = String(data.rol || data.role || "").toLowerCase();
  if (!validRoles.has(role)) {
    throw new Error("El perfil del usuario no tiene un rol valido.");
  }

  return role;
}

export function routeRequiredRole(route) {
  if (route.startsWith("/admin")) return "admin";
  if (route.startsWith("/docente")) return "docente";
  if (route.startsWith("/director")) return "director";
  if (route.startsWith("/alumno")) return "alumno";
  return "";
}

export function homeForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "docente") return "/docente";
  if (role === "director") return "/director";
  if (role === "alumno") return "/alumno";
  return "/";
}
