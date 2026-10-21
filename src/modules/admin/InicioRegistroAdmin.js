import { icon } from "../../ui/dom.js";
import { gestionAdministrativaDisponible } from "../../services/registroEscolar.js";

const CLAVE_GUIA = "colegio-inicio-registro-admin";

export const PASOS_REGISTRO = [
  { titulo: "Alumnos", detalle: "Registrar y asignar a sus cursos.", icono: "users", tono: "alumnos" },
  { titulo: "Docentes", detalle: "Crear cuentas, cursos y materias.", icono: "presentation", tono: "docentes" },
  { titulo: "Horarios", detalle: "Organizar las clases de cada curso.", icono: "calendar-days", tono: "horarios" },
  { titulo: "Director", detalle: "Crear su cuenta de seguimiento.", icono: "user-cog", tono: "director" }
];

export function programarGuiaRegistro(uid, gestion, storage = globalThis.sessionStorage) {
  if (!uid || !/^20\d{2}$/.test(String(gestion))) return false;
  try {
    storage.setItem(CLAVE_GUIA, JSON.stringify({ uid, gestion: String(gestion) }));
    return true;
  } catch {
    return false;
  }
}

export function tieneGuiaRegistro(uid, gestion, storage = globalThis.sessionStorage) {
  if (!uid) return false;
  try {
    const pendiente = JSON.parse(storage.getItem(CLAVE_GUIA));
    return pendiente?.uid === uid && pendiente.gestion === String(gestion);
  } catch {
    return false;
  }
}

export function completarGuiaRegistro(uid, gestion, storage = globalThis.sessionStorage) {
  if (!tieneGuiaRegistro(uid, gestion, storage)) return;
  try {
    storage.removeItem(CLAVE_GUIA);
  } catch {
    // La guia es local; un fallo de almacenamiento no bloquea el registro.
  }
}

export function renderGuiaRegistroAdmin(gestion) {
  if (!/^20\d{2}$/.test(String(gestion))) return "";
  return `
    <dialog data-admin-guide class="admin-registro-dialog" aria-labelledby="admin-registro-title" aria-describedby="admin-registro-description">
      <header class="admin-registro-header">
        <span class="admin-registro-ready">${icon("circle-check", "h-5 w-5")} Gestion ${gestion} habilitada</span>
        <button type="button" data-cerrar-guia aria-label="Cerrar guia" title="Cerrar guia" class="admin-registro-close">${icon("x", "h-5 w-5")}</button>
        <h2 id="admin-registro-title">Todo listo para comenzar</h2>
        <p id="admin-registro-description">Registra la informacion en este orden.</p>
      </header>
      <ol class="admin-registro-pasos" aria-label="Orden de registro">
        ${PASOS_REGISTRO.map((paso, index) => `
          <li class="admin-registro-paso" data-paso-registro="${index + 1}">
            <div class="admin-registro-icono admin-registro-${paso.tono}">${icon(paso.icono, "h-6 w-6")}<span>${index + 1}</span></div>
            <div><h3>${paso.titulo}</h3><p>${paso.detalle}</p></div>
          </li>
        `).join("")}
      </ol>
      <footer class="admin-registro-footer">
        <p>Los modulos ya estan disponibles.</p>
        <button type="button" data-empezar-registro autofocus>${icon("arrow-right", "h-4 w-4")} Empezar a registrar</button>
      </footer>
    </dialog>
  `;
}

export function bindGuiaRegistroAdmin({ uid, configuracion, storage = globalThis.sessionStorage, navegar = () => { window.location.hash = "#/admin/alumnos"; } }) {
  const dialog = document.querySelector("[data-admin-guide]");
  const gestion = configuracion.gestionActivaId;
  if (!dialog || !gestionAdministrativaDisponible(configuracion) || !tieneGuiaRegistro(uid, gestion, storage) || dialog.open) return false;
  const terminar = () => {
    completarGuiaRegistro(uid, gestion, storage);
    dialog.close();
  };
  dialog.querySelector("[data-cerrar-guia]").addEventListener("click", terminar);
  dialog.querySelector("[data-empezar-registro]").addEventListener("click", () => { terminar(); navegar(); });
  dialog.addEventListener("close", () => completarGuiaRegistro(uid, gestion, storage), { once: true });
  dialog.showModal();
  return true;
}
