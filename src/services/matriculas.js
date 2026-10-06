import { doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { firestore } from "../firebase/client.js";
import { coleccionGestion } from "./rutasFirestore.js";

export function alumnoConMatricula(id, alumno, matricula) {
  return {
    ...alumno, id,
    cursoId: matricula.cursoId,
    numeroAgregacion: matricula.numeroAgregacion,
    numeroLista: matricula.numeroAgregacion,
    estado: matricula.estado,
    activo: alumno.activo !== false && matricula.estado === "activo",
    retirado: matricula.estado === "retirado"
  };
}

export async function listarAlumnosMatriculados(courseId = "", { soloActivos = false, db = firestore } = {}) {
  const filtros = [];
  if (courseId) filtros.push(where("cursoId", "==", courseId));
  if (soloActivos) filtros.push(where("estado", "==", "activo"));
  const source = coleccionGestion(db, "matriculas");
  const snapshot = await getDocs(filtros.length ? query(source, ...filtros) : source);
  // Leer cada identidad permite validar su matricula sin exceder el limite de reglas por consulta.
  const alumnos = await Promise.all(snapshot.docs.map(async (matricula) => {
    const alumno = await getDoc(doc(db, "alumnos", matricula.id));
    return alumno.exists() ? alumnoConMatricula(alumno.id, alumno.data(), matricula.data()) : null;
  }));
  return alumnos.filter((alumno) => alumno && (!soloActivos || alumno.activo))
    .sort((a, b) => Number(a.numeroAgregacion || 0) - Number(b.numeroAgregacion || 0));
}
