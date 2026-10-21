import { doc, getDoc } from "firebase/firestore";
import { firestore } from "../../firebase/client.js";
import { configuracionActual } from "../../services/rutasFirestore.js";
import { estadoRegistroEscolar } from "../../services/registroEscolar.js";
import { DirectorShell } from "./DirectorShell.js";

let institucionCache = null;

export function DirectorConfig() {
  const estado = estadoRegistroEscolar(configuracionActual());
  const content = `
    <section class="border-b border-slate-200 pb-5">
      <h2 class="text-lg font-semibold text-slate-900">Gestion ${estado.gestion}</h2>
      <p class="mt-2 text-sm ${estado.habilitada ? "text-green-800" : "text-amber-800"}">${estado.habilitada ? "Registro academico habilitado por el administrador." : estado.mensaje}</p>
    </section>
    <section class="py-5">
      <h2 class="text-base font-semibold text-slate-900">Institucion</h2>
      <dl class="mt-3 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2" data-director-institucion><div class="text-slate-600">Cargando informacion...</div></dl>
    </section>
    <section class="border-t border-slate-200 py-5">
      <h2 class="text-base font-semibold text-slate-900">Organizacion y permisos</h2>
      <dl class="mt-4 grid gap-4 text-sm">
        <div><dt class="font-medium text-slate-900">Ano escolar</dt><dd class="mt-1 text-slate-600">Solo el administrador puede habilitarlo. Las gestiones anteriores se conservan para consulta.</dd></div>
        <div><dt class="font-medium text-slate-900">Trimestre</dt><dd class="mt-1 text-slate-600">Cada docente elige su trimestre desde el Panel. No existe un trimestre unico para todo el sistema.</dd></div>
        <div><dt class="font-medium text-slate-900">Direccion</dt><dd class="mt-1 text-slate-600">Consulta notas y asistencia, envia comunicados y administra advertencias. No modifica las calificaciones ni la asistencia del docente.</dd></div>
      </dl>
    </section>
  `;
  return DirectorShell("/director/configuracion", content, {
    title: "Configuracion",
    subtitle: "Informacion institucional y gestion escolar."
  });
}

export async function bindDirectorConfig(route) {
  if (route !== "/director/configuracion") return;
  const root = document.querySelector("[data-director-institucion]");
  if (!root) return;
  try {
    institucionCache ||= getDoc(doc(firestore, "configuracion", "institucion")).then((snapshot) => snapshot.exists() ? snapshot.data() : null).catch((error) => { institucionCache = null; throw error; });
    const datos = await institucionCache;
    if (!root.isConnected) return;
    root.replaceChildren();
    if (!datos) {
      root.textContent = "El administrador aun no configuro la institucion.";
      return;
    }
    for (const [key, label] of [["nombre", "Unidad educativa"], ["distrito", "Distrito"], ["nivel", "Nivel"], ["turno", "Turno"]]) {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.className = "text-slate-600";
      detail.className = "mt-1 font-medium text-slate-900";
      term.textContent = label;
      detail.textContent = datos[key] || "Sin configurar";
      row.append(term, detail);
      root.append(row);
    }
  } catch {
    if (root.isConnected) root.textContent = "No se pudo cargar la informacion institucional. Vuelve a ingresar al modulo para intentar de nuevo.";
  }
}
