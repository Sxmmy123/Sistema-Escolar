import { DocenteDashboard } from "./DocenteDashboard.js";
import { DocenteModule } from "./PaginasDocente.js";
import { bindDocentePages } from "./ControladorDocente.js";
import { bindTeacherNotifications } from "./NotificacionesDocente.js";
import { refreshIcons } from "./UtilidadesDocente.js";

export const rutas = {
  "/docente": DocenteDashboard,
  ...Object.fromEntries([
    "/docente/asistencia", "/docente/tareas", "/docente/calificar",
    "/docente/regularizacion", "/docente/notas", "/docente/boletin",
    "/docente/resumen", "/docente/horario"
  ].map((ruta) => [ruta, () => DocenteModule(ruta)]))
};
export function vincular(ruta) { bindTeacherNotifications(ruta); return bindDocentePages(ruta); }
export const actualizarIconos = refreshIcons;
export const desmontar = () => bindTeacherNotifications("/");
