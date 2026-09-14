import { icon } from "../../ui/dom.js";

function publicAsset(path) {
  return `${import.meta.env.BASE_URL || "./"}${path}`;
}

const SCHOOL_LOGO = publicAsset("images/logo-nueva-bolivia.png");

export const directorNav = [
  ["Dashboard", "#/director", "layout-dashboard"],
  ["Estudiantes", "#/director/estudiantes", "users"],
  ["Docentes", "#/director/docentes", "graduation-cap"],
  ["Cursos y Horarios", "#/director/cursos-horarios", "school"],
  ["Asistencia", "#/director/asistencia", "clipboard-check"],
  ["Notas", "#/director/notas", "notebook-tabs"],
  ["Reportes", "#/director/reportes", "chart-no-axes-combined"],
  ["Configuracion", "#/director/configuracion", "settings"]
];

function todayHeader() {
  const date = new Date();
  return {
    full: date.toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric" }),
    day: date.toLocaleDateString("es-BO", { weekday: "long" })
  };
}

function directorNavLink([label, href, iconName], activeRoute) {
  const active = href === `#${activeRoute}` || (activeRoute === "/director/asistencias" && href === "#/director/asistencia");
  return `
    <a href="${href}" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "bg-school-green text-white shadow-md" : "text-white/80 hover:bg-white/10 hover:text-white"}">
      ${icon(iconName, "h-4 w-4")}
      <span>${label}</span>
    </a>
  `;
}

function directorSidebar(activeRoute) {
  return `
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center gap-3">
        <div class="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-white/20">
          <img src="${SCHOOL_LOGO}" alt="Escudo Nueva Bolivia" class="h-full w-full object-contain p-1.5" />
        </div>
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase leading-tight">Unidad Educativa</p>
          <p class="truncate text-base font-semibold uppercase leading-tight">Nueva Bolivia</p>
        </div>
      </div>
      <div class="my-4 h-px shrink-0 bg-white/10"></div>
      <nav class="min-h-0 flex-1 overflow-y-auto pr-1">
        <p class="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-white/45">Gestion academica</p>
        <div class="grid gap-1">
          ${directorNav.slice(0, 4).map((item) => directorNavLink(item, activeRoute)).join("")}
        </div>
        <p class="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-white/45">Seguimiento</p>
        <div class="grid gap-1">
          ${directorNav.slice(4, 7).map((item) => directorNavLink(item, activeRoute)).join("")}
        </div>
        <p class="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-white/45">Administracion</p>
        <div class="grid gap-1">
          ${directorNav.slice(7).map((item) => directorNavLink(item, activeRoute)).join("")}
        </div>
      </nav>
      <div class="mt-3 shrink-0 border-t border-white/10 pt-3">
        <div class="mb-2 flex items-center gap-3">
          <div class="grid h-12 w-12 place-items-center rounded-full bg-white/15">${icon("user-round", "h-6 w-6")}</div>
          <div class="min-w-0">
            <p class="truncate font-semibold">Director</p>
            <p class="text-xs text-white/60">Rol Director</p>
          </div>
        </div>
        <button class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white" data-action="logout">
          ${icon("log-out", "h-4 w-4")} Cerrar sesion
        </button>
      </div>
    </div>
  `;
}

export function DirectorShell(activeRoute, content, options = {}) {
  const date = todayHeader();
  const title = options.title || "Buenos dias, Director!";
  const subtitle = options.subtitle || "Resumen general de la Unidad Educativa Nueva Bolivia";
  return `
    <div class="min-h-screen bg-slate-50 text-slate-900 lg:pl-72">
      <aside class="fixed inset-y-0 left-0 z-40 hidden h-dvh max-h-dvh w-72 overflow-hidden bg-[#153d24] p-6 text-white lg:block">
        ${directorSidebar(activeRoute)}
      </aside>
      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
        <div class="flex items-center gap-4 px-4 py-3 lg:px-8">
          <button class="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 lg:hidden" data-action="open-menu" aria-label="Abrir menu">${icon("menu", "h-5 w-5")}</button>
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-lg font-semibold text-slate-950 sm:text-xl">${title}</h1>
            <p class="truncate text-xs text-slate-500 sm:text-sm">${subtitle}</p>
          </div>
          <a href="#/director/notas" class="relative hidden h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-800 sm:grid" aria-label="Ver alertas">
            ${icon("bell", "h-5 w-5")}
            <span data-director-alert-badge class="absolute -right-1 -top-1 hidden min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-5 text-white"></span>
          </a>
          <div class="hidden items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 md:flex">
            ${icon("calendar-days", "h-5 w-5 text-school-green")}
            <div class="text-right">
              <p class="text-xs font-semibold text-slate-900">${date.full}</p>
              <p class="text-[11px] capitalize text-slate-500">${date.day}</p>
            </div>
          </div>
        </div>
      </header>
      <aside class="fixed inset-y-0 left-0 z-50 h-dvh max-h-dvh w-72 -translate-x-full overflow-hidden bg-[#153d24] p-5 text-white shadow-2xl transition-transform duration-300 lg:hidden" data-sidebar>
        ${directorSidebar(activeRoute)}
      </aside>
      <div class="fixed inset-0 z-40 hidden bg-slate-950/40 lg:hidden" data-sidebar-backdrop></div>
      <main class="px-4 py-5 lg:px-8">${content}</main>
    </div>
  `;
}

export function directorCard(title, content, extra = "") {
  return `
    <article class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${extra}">
      <h2 class="text-xs font-semibold uppercase text-slate-900 sm:text-sm">${title}</h2>
      <div class="mt-3">${content}</div>
    </article>
  `;
}

export function directorStat(label, value, detail, iconName, tone = "bg-school-green text-white") {
  return `
    <article class="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div class="flex items-center gap-2 sm:gap-3">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-lg sm:h-11 sm:w-11 ${tone}">${icon(iconName, "h-4 w-4 sm:h-5 sm:w-5")}</div>
        <div class="min-w-0">
          <p class="truncate text-[9px] font-semibold uppercase text-slate-500 sm:text-[11px]">${label}</p>
          <p class="text-xl font-semibold text-slate-950 sm:mt-0.5 sm:text-2xl">${value}</p>
          <p class="truncate text-[10px] text-slate-500 sm:text-xs">${detail}</p>
        </div>
      </div>
    </article>
  `;
}


