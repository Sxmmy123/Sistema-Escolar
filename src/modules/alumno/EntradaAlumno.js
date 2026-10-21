import { createIcons, icons } from "lucide";
import { AlumnoDashboard, bindAlumnoPage } from "./AlumnoDashboard.js";

export const rutas = {
  "/alumno": () => AlumnoDashboard("/alumno"),
  "/alumno/boleta": () => AlumnoDashboard("/alumno/boleta")
};

export const vincular = bindAlumnoPage;
export const actualizarIconos = () => createIcons({ icons });
