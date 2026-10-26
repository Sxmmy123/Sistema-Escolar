import { createIcons, icons } from "lucide";
import { AlumnoDashboard, bindAlumnoPage, desmontarAlumno } from "./AlumnoDashboard.js";
import "./alumno.css";

export const rutas = {
  "/alumno": () => AlumnoDashboard("/alumno"),
  "/alumno/boleta": () => AlumnoDashboard("/alumno/boleta")
};

export const vincular = bindAlumnoPage;
export const desmontar = desmontarAlumno;
export const actualizarIconos = () => createIcons({ icons });
