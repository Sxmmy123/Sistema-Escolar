import { getTeacherContext } from "../../services/teacherData.js";
import { crearEntradaDocente } from "./cargaDocente.js";

const entrada = crearEntradaDocente(getTeacherContext, {
  primaria: () => import("./EntradaPrimariaDocente.js"),
  inicial: () => import("../docente-inicial/EntradaInicialDocente.js")
});
export let rutas = {};
export async function preparar() { if (await entrada.preparar()) rutas = entrada.rutas; }
export const vincular = (route) => entrada.vincular(route);
export const actualizarIconos = () => entrada.actualizarIconos();
export function desmontar() { entrada.desmontar(); rutas = {}; }
