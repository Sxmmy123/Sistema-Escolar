import { icon } from "../../ui/dom.js";

function publicAsset(path) {
  return `${import.meta.env.BASE_URL || "./"}${path}`;
}

const SCHOOL_LOGO = publicAsset("images/logo-nueva-bolivia.png");

export const adminNav = [
  ["Panel", "#/admin", "layout-dashboard"],
  ["Alumnos", "#/admin/alumnos", "users"],
  ["Docentes", "#/admin/docentes", "presentation"],
  ["Director", "#/admin/director", "user-cog"],
  ["Horarios", "#/admin/horarios", "calendar-days"],
  ["Carga de datos", "#/admin/carga-historica", "database-zap"],
  ["Auditoria", "#/admin/auditoria", "activity"]
];

const adminSections = [
  { label: "General", items: adminNav.slice(0, 1) },
  { label: "Personas", items: adminNav.slice(1, 4) },
  { label: "Organizacion", items: adminNav.slice(4, 6) },
  { label: "Control", items: adminNav.slice(6) }
];

function currentDate() {
  const date = new Date();
  return {
    date: date.toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric" }),
    day: date.toLocaleDateString("es-BO", { weekday: "long" })
  };
}

function navLink([label, href, iconName], activeRoute) {
  const active = href === `#${activeRoute}`;
  return `
    <a href="${href}" ${active ? 'aria-current="page"' : ""} class="group flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 text-[13px] font-medium transition ${active ? "border-white/15 bg-white text-[#075c22] shadow-sm" : "border-transparent text-white/75 hover:bg-white/10 hover:text-white"}">
      <span class="grid h-5 w-5 shrink-0 place-items-center ${active ? "text-school-green" : "text-white/65 group-hover:text-white"}">${icon(iconName, "h-4 w-4")}</span>
      <span class="truncate">${label}</span>
      ${active ? `<span class="ml-auto h-1.5 w-1.5 rounded-full bg-school-gold"></span>` : ""}
    </a>
  `;
}

function sidebar(activeRoute, mobile = false) {
  return `
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center gap-3">
        <a href="#/admin" class="flex min-w-0 flex-1 items-center gap-3" aria-label="Ir al panel administrativo">
          <span class="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-white/20">
            <img src="${SCHOOL_LOGO}" alt="Escudo Nueva Bolivia" class="h-full w-full object-contain p-1.5">
          </span>
          <span class="min-w-0">
            <span class="block text-[10px] font-medium uppercase tracking-[.1em] text-white/55">Unidad Educativa</span>
            <span class="block truncate text-sm font-semibold text-white">Nueva Bolivia</span>
          </span>
        </a>
        ${mobile ? `<button type="button" data-action="close-menu" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20" aria-label="Cerrar menu">${icon("x", "h-4 w-4")}</button>` : ""}
      </div>

      <div class="my-4 h-px shrink-0 bg-white/10"></div>

      <nav class="min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Navegacion administrativa">
        ${adminSections.map((section, index) => `
          <div class="${index ? "mt-4" : ""}">
            <p class="mb-1 px-3 text-[9px] font-semibold uppercase tracking-[.15em] text-white/40">${section.label}</p>
            <div class="grid gap-1">${section.items.map((item) => navLink(item, activeRoute)).join("")}</div>
          </div>
        `).join("")}
      </nav>

      <div class="mt-3 shrink-0 border-t border-white/10 pt-3">
        <div class="mb-2 flex items-center gap-3 px-2">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-school-gold text-[#393633]">${icon("shield-check", "h-4 w-4")}</span>
          <span class="min-w-0">
            <span class="block truncate text-xs font-semibold text-white">Administrador</span>
            <span class="block text-[10px] text-white/50">Control del sistema</span>
          </span>
        </div>
        <button type="button" data-action="logout" class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-red-500/15 hover:text-white">
          ${icon("log-out", "h-4 w-4")} Cerrar sesion
        </button>
      </div>
    </div>
  `;
}

export function AdminShell(activeRoute, content, options = {}) {
  const date = currentDate();
  const title = options.title || "Panel administrativo";
  const subtitle = options.subtitle || "Gestion general del sistema escolar";

  return `
    <div class="admin-shell min-h-screen bg-[#f5f7f5] text-slate-900 lg:pl-[248px]">
      <aside class="fixed inset-y-0 left-0 z-40 hidden h-dvh w-[248px] overflow-hidden bg-[#0d4023] p-4 text-white lg:block">
        ${sidebar(activeRoute)}
      </aside>

      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div class="mx-auto flex min-h-16 max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-5 lg:px-7">
          <button type="button" data-action="open-menu" class="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden" aria-label="Abrir menu" aria-expanded="false">${icon("menu", "h-5 w-5")}</button>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-[#252b27] sm:text-base">${title}</p>
            <p class="truncate text-[11px] text-slate-500 sm:text-xs">${subtitle}</p>
          </div>
          <div class="hidden items-center gap-2 border-l border-slate-200 pl-4 sm:flex">
            <span class="grid h-9 w-9 place-items-center rounded-lg bg-green-50 text-school-green">${icon("calendar-days", "h-4 w-4")}</span>
            <span class="text-right">
              <span class="block text-[11px] font-medium capitalize text-slate-800">${date.day}</span>
              <span class="block text-[10px] text-slate-500">${date.date}</span>
            </span>
          </div>
        </div>
      </header>

      <aside class="fixed inset-y-0 left-0 z-50 h-dvh w-[268px] max-w-[86vw] -translate-x-full overflow-hidden bg-[#0d4023] p-4 text-white shadow-2xl transition-transform duration-300 lg:hidden" data-sidebar aria-hidden="true">
        ${sidebar(activeRoute, true)}
      </aside>
      <div class="fixed inset-0 z-40 hidden bg-slate-950/45 lg:hidden" data-sidebar-backdrop></div>

      <main class="mx-auto max-w-[1600px] px-3 py-4 sm:px-5 sm:py-5 lg:px-7">${content}</main>
    </div>
  `;
}
