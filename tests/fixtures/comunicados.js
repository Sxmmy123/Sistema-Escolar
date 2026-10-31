import "/src/styles.css";
import "/src/theme.css";
import { DirectorTeachers, bindDirectorTeachers } from "/src/modules/director/DirectorTeachers.js";
import { bindThemeButtons, initializeTheme } from "/src/ui/theme.js";
import { establecerConfiguracion } from "/src/services/rutasFirestore.js";

// Visual fixture: notices are stored only in memory, without Firebase writes.
establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true });
initializeTheme({ storage: null });
const teachers = [
  { id: "aracely", nombre: "Aracely Michme Valencia", username: "Aracely004", asignaciones: { cuarto_a: { materias: ["matematica", "lenguaje", "ciencias_naturales"] } } },
  { id: "yola", nombre: "Yola Parapu Condori", username: "Yola007", asignaciones: { inicial: {}, preinicial: {} } }
];
let notices = [];
document.querySelector("#app").innerHTML = DirectorTeachers();
await bindDirectorTeachers("/director/docentes", {
  listTeachers: async () => teachers,
  listCommunications: async () => notices,
  createNotice: async (input) => {
    const recipient = input.alcance === "docente" ? teachers.find((teacher) => teacher.id === input.destinatarioUid) : null;
    notices.push({ ...input, id: `local-${notices.length}`, destinatarioUid: recipient?.id || "", destinatarioNombre: recipient?.nombre || "", destinatariosRol: recipient ? [] : ["docente"] });
  },
  cancelNotice: async (item) => { notices = notices.filter((notice) => notice.id !== item.id); }
});
bindThemeButtons({ storage: null, events: null });
