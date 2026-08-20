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
    <a href="${href}" class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black transition ${active ? "bg-school-green text-white shadow-soft" : "text-white/80 hover:bg-white/10 hover:text-white"}">
      ${icon(iconName, "h-4 w-4")}
      <span>${label}</span>
    </a>
  `;
}

function directorSidebar(activeRoute) {
  return `
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center gap-3">
        <div class="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-white/20">
          <img src="${SCHOOL_LOGO}" alt="Escudo Nueva Bolivia" class="h-full w-full object-contain p-1.5" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-black uppercase leading-tight tracking-wide">Unidad Educativa</p>
          <p class="truncate text-lg font-black uppercase leading-tight">Nueva Bolivia</p>
        </div>
      </div>
      <div class="my-6 h-px shrink-0 bg-white/10"></div>
      <nav class="min-h-0 flex-1 overflow-y-auto pr-1">
        <p class="mb-2 px-4 text-xs font-black uppercase tracking-[.16em] text-white/45">Gestion academica</p>
        <div class="grid gap-2">
          ${directorNav.slice(0, 4).map((item) => directorNavLink(item, activeRoute)).join("")}
        </div>
        <p class="mb-2 mt-6 px-4 text-xs font-black uppercase tracking-[.16em] text-white/45">Seguimiento</p>
        <div class="grid gap-2">
          ${directorNav.slice(4, 7).map((item) => directorNavLink(item, activeRoute)).join("")}
        </div>
        <p class="mb-2 mt-6 px-4 text-xs font-black uppercase tracking-[.16em] text-white/45">Administracion</p>
        <div class="grid gap-2">
          ${directorNav.slice(7).map((item) => directorNavLink(item, activeRoute)).join("")}
        </div>
      </nav>
      <div class="mt-4 shrink-0 border-t border-white/10 pt-5">
        <div class="mb-4 flex items-center gap-3">
          <div class="grid h-12 w-12 place-items-center rounded-full bg-white/15">${icon("user-round", "h-6 w-6")}</div>
          <div class="min-w-0">
            <p class="truncate font-black">Director</p>
            <p class="text-sm font-semibold text-white/60">Rol Director</p>
          </div>
        </div>
        <button class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-white/80 transition hover:bg-white/10 hover:text-white" data-action="logout">
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
      <aside class="fixed inset-y-0 left-0 z-40 hidden h-dvh max-h-dvh w-72 overflow-hidden bg-gradient-to-b from-[#0b2a44] to-[#07192b] p-6 text-white lg:block">
        ${directorSidebar(activeRoute)}
      </aside>
      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
        <div class="flex items-center gap-4 px-4 py-3 lg:px-8">
          <button class="grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 lg:hidden" data-action="open-menu" aria-label="Abrir menu">${icon("menu", "h-5 w-5")}</button>
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-xl font-black text-slate-950">${title}</h1>
            <p class="truncate text-sm font-semibold text-slate-500">${subtitle}</p>
          </div>
          <button class="relative hidden h-11 w-11 place-items-center rounded-2xl bg-white text-slate-800 shadow-soft sm:grid">
            ${icon("bell", "h-5 w-5")}
            <span class="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[10px] font-black text-white">7</span>
          </button>
          <div class="hidden items-center gap-3 rounded-2xl bg-white px-4 py-2 shadow-soft md:flex">
            ${icon("calendar-days", "h-5 w-5 text-school-green")}
            <div class="text-right">
              <p class="text-sm font-black text-slate-900">${date.full}</p>
              <p class="text-xs font-semibold capitalize text-slate-500">${date.day}</p>
            </div>
          </div>
        </div>
      </header>
      <aside class="fixed inset-y-0 left-0 z-50 h-dvh max-h-dvh w-72 -translate-x-full overflow-hidden bg-[#0b2a44] p-5 text-white shadow-2xl transition-transform duration-300 lg:hidden" data-sidebar>
        ${directorSidebar(activeRoute)}
      </aside>
      <div class="fixed inset-0 z-40 hidden bg-slate-950/40 lg:hidden" data-sidebar-backdrop></div>
      <main class="px-4 py-5 lg:px-8">${content}</main>
    </div>
  `;
}

export function directorCard(title, content, extra = "") {
  return `
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft ${extra}">
      <h2 class="text-sm font-black uppercase text-slate-900">${title}</h2>
      <div class="mt-4">${content}</div>
    </article>
  `;
}

export function directorStat(label, value, detail, iconName, tone = "bg-school-green text-white") {
  return `
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div class="flex items-center gap-4">
        <div class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${tone}">${icon(iconName, "h-7 w-7")}</div>
        <div class="min-w-0">
          <p class="text-xs font-black uppercase tracking-[.1em] text-slate-500">${label}</p>
          <p class="mt-1 text-3xl font-black text-slate-950">${value}</p>
          <p class="text-sm font-semibold text-slate-500">${detail}</p>
        </div>
      </div>
    </article>
  `;
}


