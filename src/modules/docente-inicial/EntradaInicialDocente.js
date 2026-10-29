import { createIcons, ArrowRight, Bell, BookOpenText, CalendarDays, CalendarRange, Check, CheckCheck, ChartNoAxesCombined, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Focus, GraduationCap, HandHelping, Inbox, LayoutDashboard, LogOut, Menu, MessageSquarePlus, Minus, Moon, NotebookPen, Pencil, Printer, RefreshCw, Save, School, Settings, Sparkles, Sun, UserRound, Users, X } from "lucide";
import { crearControladorInicial } from "./ControladorInicial.js";
import { PanelInicial } from "./PanelInicial.js";
import { AsistenciaInicial } from "./AsistenciaInicial.js";
import { RegistroInicial } from "./RegistroInicial.js";
import { ActividadesInicial } from "./ActividadesInicial.js";
import { CheckCircle2, Clock3, List, MessageSquare, UserCheck, XCircle, CloudOff, Archive, ArrowDown, ArrowUp, ChevronDown, ClipboardList, Columns3, FileCheck2, FileClock, FileMinus, FilePenLine, ListOrdered, Plus, Search, Star, Trash2, Triangle, Undo2 } from "lucide";
import { BitacoraInicial } from "./BitacoraInicial.js";
import { InformeInicial } from "./InformeInicial.js";
import { HorarioInicial } from "./HorarioInicial.js";
import { ResumenesInicial } from "./ResumenesInicial.js";
import "./inicial.css";

const views = {
  "/docente": PanelInicial,
  "/docente/asistencia": AsistenciaInicial,
  "/docente/registro": RegistroInicial,
  "/docente/actividades": ActividadesInicial,
  "/docente/bitacora": BitacoraInicial,
  "/docente/informe": InformeInicial,
  "/docente/horario": HorarioInicial,
  "/docente/resumenes": ResumenesInicial
};
let controller = null;
let key = "";
export let rutas = {};
export const actualizarIconos = () => createIcons({ icons: { CheckCircle2, Clock3, List, MessageSquare, UserCheck, XCircle, CloudOff, Archive, ArrowDown, ArrowUp, ChevronDown, ClipboardList, Columns3, FileCheck2, FileClock, FileMinus, FilePenLine, ListOrdered, Plus, Search, Star, Trash2, Triangle, Undo2, ArrowRight, Bell, BookOpenText, CalendarDays, CalendarRange, Check, CheckCheck, ChartNoAxesCombined, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Focus, GraduationCap, HandHelping, Inbox, LayoutDashboard, LogOut, Menu, MessageSquarePlus, Minus, Moon, NotebookPen, Pencil, Printer, RefreshCw, Save, School, Settings, Sparkles, Sun, UserRound, Users, X } });
export function preparar(context, dependencies = {}) {
  const next = JSON.stringify([context.uid, context.gestionId, context.courses.map((course) => course.id), context.trimestres, context.reemplazoDeUid, context.reemplazadoPorUid, context.errorModalidad || ""]);
  if (!controller || next !== key) {
    controller?.desmontar();
    controller = crearControladorInicial(context, views, { ...dependencies, refreshIcons: actualizarIconos });
    key = next;
  }
  const available = context.errorModalidad || !context.courses.length ? ["/docente"] : Object.keys(views);
  rutas = Object.fromEntries(available.map((route) => [route, () => controller.vista(route)]));
}
export const vincular = (route) => controller?.vincular(route);
export function desmontar() { controller?.desmontar(); controller = null; key = ""; rutas = {}; }
