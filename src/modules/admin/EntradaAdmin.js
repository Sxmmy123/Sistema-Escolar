import { createIcons, icons } from "lucide";
import "./InicioRegistroAdmin.css";
import { AdminDashboard } from "./AdminDashboard.js";
import { AdminModule } from "./PaginasAdmin.js";
import { bindAdminPages } from "./AdminBindings.js";

export const rutas = {
  "/admin": AdminDashboard,
  ...Object.fromEntries([
    "/admin/alumnos", "/admin/docentes", "/admin/director", "/admin/horarios",
    "/admin/carga-historica", "/admin/auditoria"
  ].map((ruta) => [ruta, () => AdminModule(ruta)]))
};

export const vincular = bindAdminPages;
export const actualizarIconos = () => createIcons({ icons });
