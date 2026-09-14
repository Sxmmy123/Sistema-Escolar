import { APP_NAME, APP_VERSION } from "../firebase/config.js";
import { icon } from "./dom.js";

function publicAsset(path) {
  return `${import.meta.env.BASE_URL || "./"}${path}`;
}

const SCHOOL_LOGO = publicAsset("images/logo-nueva-bolivia.png");


const navItems = {
  admin: [
    ["Panel", "#/admin", "layout-dashboard"],
    ["Alumnos", "#/admin/alumnos", "users"],
    ["Docentes", "#/admin/docentes", "presentation"],
    ["Director", "#/admin/director", "eye"],
    ["Horarios", "#/admin/horarios", "calendar-days"],
    ["Carga Historica", "#/admin/carga-historica", "upload"],
    ["Auditoria", "#/admin/auditoria", "activity"]
  ],
  docente: [
    ["Panel", "#/docente", "layout-dashboard"],
    ["Asistencia", "#/docente/asistencia", "clipboard-check"],
    ["Agenda", "#/docente/tareas", "calendar-plus"],
    ["Calificar", "#/docente/calificar", "clipboard-pen-line"],
    ["Regularizacion", "#/docente/regularizacion", "badge-alert"],
    ["Notas", "#/docente/notas", "notebook-tabs"],
    ["Boletin", "#/docente/boletin", "file-spreadsheet"],
    ["Horario", "#/docente/horario", "calendar-days"],
    ["Resumen Asistencia", "#/docente/resumen", "bar-chart-3"]
  ],
  director: [
    ["Panel", "#/director", "layout-dashboard"],
    ["Asistencias", "#/director/asistencias", "clipboard-list"],
    ["Reportes", "#/director/reportes", "chart-no-axes-combined"],
    ["Auditoria", "#/director/auditoria", "activity"]
  ],
  alumno: [
    ["Panel", "#/alumno", "layout-dashboard"],
    ["Boleta", "#/alumno/boleta", "graduation-cap"]
  ]
};

function navLink([label, href, iconName], activeRoute, compact = false, teacherSidebar = false) {
  const active = href === `#${activeRoute}`;
  const size = compact
    ? teacherSidebar ? "gap-2.5 rounded-lg px-2.5 py-2 text-[12px]" : "gap-2 rounded-xl px-2.5 py-2 text-[12px]"
    : "gap-2 rounded-xl px-3 py-2 text-sm";
  const activeClass = teacherSidebar
    ? "is-active border-school-green/25 bg-green-50 font-bold text-school-green"
    : "border-school-gold/60 bg-school-navy text-white shadow-soft";
  const idleClass = teacherSidebar
    ? "border-transparent text-slate-600 hover:border-school-green/20 hover:bg-school-sky hover:text-school-navy"
    : "border-transparent text-slate-600 hover:border-school-green/20 hover:bg-school-sky hover:text-school-navy";
  return `
    <a href="${href}" title="${label}" ${active ? 'aria-current="page"' : ""} class="${teacherSidebar ? "teacher-sidebar-link min-h-9 font-semibold" : "font-black"} flex items-center border transition ${size} ${active ? activeClass : idleClass}">
      <span class="teacher-sidebar-icon grid shrink-0 place-items-center">${icon(iconName, compact ? "h-4 w-4" : "h-4 w-4")}</span>
      <span class="teacher-sidebar-copy min-w-0 truncate leading-tight">${label}</span>
    </a>
  `;
}

function sidebarNav(items, activeRoute, title, mode = "desktop") {
  const isMobile = mode === "mobile";
  return `
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="teacher-sidebar-brand flex shrink-0 items-center justify-between gap-2">
        <a href="#/docente" class="teacher-sidebar-home flex min-w-0 items-center gap-2.5" title="Unidad Educativa Nueva Bolivia">
          <span class="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white shadow-soft ring-1 ring-amber-900/10"><img src="${SCHOOL_LOGO}" alt="Escudo Nueva Bolivia" class="h-full w-full object-contain p-1" /></span>
          <span class="teacher-sidebar-brand-copy min-w-0">
            <span class="block truncate text-xs font-bold text-school-bark">U.E. Nueva Bolivia</span>
            <span class="block text-[9px] font-semibold text-slate-500">Sistema escolar</span>
          </span>
        </a>
        ${isMobile
          ? `<button class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600" data-action="close-menu" aria-label="Cerrar menu">${icon("x", "h-4 w-4")}</button>`
          : `<button class="teacher-sidebar-collapse grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-school-green/30 hover:bg-green-50 hover:text-school-green" data-action="toggle-sidebar-collapse" aria-label="Contraer menu" aria-expanded="true" title="Contraer menu">${icon("chevron-left", "h-4 w-4")}</button>`}
      </div>

      <div class="my-2.5 h-px shrink-0 bg-amber-900/10"></div>

      <div class="teacher-sidebar-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        <nav class="grid gap-0.5">
          ${items.slice(0, 5).map((item) => navLink(item, activeRoute, true, true)).join("")}
        </nav>

        <p class="teacher-sidebar-section-label mt-3 px-2.5 text-[9px] font-bold uppercase tracking-[.14em] text-slate-400">Otros</p>
        <nav class="mt-1 grid gap-0.5">
          ${items.slice(5).map((item) => navLink(item, activeRoute, true, true)).join("")}
        </nav>
      </div>

      <div class="teacher-sidebar-account mt-2.5 shrink-0 rounded-xl border border-amber-900/10 bg-white p-2 shadow-soft">
        <div class="flex items-center gap-2">
          <span class="teacher-sidebar-user-icon grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-school-sky text-school-navy">${icon("user-round", "h-4 w-4")}</span>
          <div class="teacher-sidebar-user-copy min-w-0">
            <p class="truncate text-xs font-bold text-school-bark" data-current-user-name>${title}</p>
            <p class="text-[9px] font-semibold text-slate-500">Docente</p>
          </div>
        </div>
        <div class="teacher-sidebar-actions mt-2 grid ${isMobile ? "grid-cols-2" : "grid-cols-1"} gap-1.5">
        <button class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-school-green/20 bg-green-50 px-2 py-1.5 text-[11px] font-bold text-school-green transition hover:bg-green-100" data-action="open-account-settings" title="Cuenta">
          ${icon("settings", "h-3.5 w-3.5")} <span class="teacher-sidebar-action-copy">Cuenta</span>
        </button>
        <button class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-2 py-1.5 text-[11px] font-bold text-white transition hover:bg-red-700" data-action="logout" title="Salir">
          ${icon("log-out", "h-3.5 w-3.5")} <span class="teacher-sidebar-action-copy">Salir</span>
        </button>
        </div>
      </div>
    </div>
  `;
}

function accountSettingsModal() {
  return `
    <div class="fixed inset-0 z-[70] hidden items-center justify-center bg-slate-950/50 p-4" data-account-modal>
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <p class="text-xs font-black uppercase tracking-[.18em] text-school-green">Cuenta docente</p>
            <h3 class="text-xl font-black text-slate-900">Seguridad y recuperacion</h3>
          </div>
          <button class="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-600" data-action="close-account-settings" aria-label="Cerrar">${icon("x", "h-5 w-5")}</button>
        </div>
        <div class="grid gap-4 p-5 md:grid-cols-2">
          <form class="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-account-email-form>
            <p class="text-sm font-black text-slate-900">Establecer Gmail</p>
            <p class="mt-1 text-xs font-semibold leading-5 text-slate-500">Sirve para entrar con correo real y recuperar la cuenta.</p>
            <label class="mt-4 block text-xs font-black text-slate-700">Gmail o correo personal</label>
            <input class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="email" type="email" placeholder="docente@gmail.com" required>
            <label class="mt-3 block text-xs font-black text-slate-700">Contrasena actual</label>
            <input class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="currentPassword" type="password" required>
            <button class="mt-4 w-full rounded-xl bg-school-green px-4 py-2.5 text-sm font-black text-white" type="submit">Guardar correo</button>
          </form>

          <form class="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-account-password-form>
            <p class="text-sm font-black text-slate-900">Cambiar contrasena</p>
            <p class="mt-1 text-xs font-semibold leading-5 text-slate-500">Usa una contrasena nueva de al menos 6 caracteres.</p>
            <label class="mt-4 block text-xs font-black text-slate-700">Contrasena actual</label>
            <input class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="currentPassword" type="password" required>
            <label class="mt-3 block text-xs font-black text-slate-700">Nueva contrasena</label>
            <input class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="newPassword" type="password" minlength="6" required>
            <label class="mt-3 block text-xs font-black text-slate-700">Confirmar</label>
            <input class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="confirmPassword" type="password" minlength="6" required>
            <button class="mt-4 w-full rounded-xl bg-school-navy px-4 py-2.5 text-sm font-black text-white" type="submit">Cambiar contrasena</button>
          </form>
        </div>
        <p class="mx-5 mb-5 hidden rounded-2xl border px-4 py-3 text-sm font-bold" data-account-status></p>
      </div>
    </div>
  `;
}

export function appShell(role, activeRoute, content) {
  const items = navItems[role] || [];
  const title = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Sistema";
  const isDocenteDashboard = role === "docente" && activeRoute === "/docente";
  const docenteMainFixedClass = isDocenteDashboard ? "lg:h-screen lg:max-w-none lg:overflow-hidden" : "";

  if (role === "docente") {
    return `
      <div class="teacher-shell min-h-screen bg-transparent">
        <aside class="teacher-sidebar fixed inset-y-0 left-0 z-40 hidden h-dvh max-h-dvh overflow-hidden border-r border-amber-900/10 bg-white/95 p-3 shadow-soft backdrop-blur lg:block" data-desktop-sidebar aria-label="Navegacion docente">
          ${sidebarNav(items, activeRoute, title, "desktop")}
        </aside>

        <header class="sticky top-0 z-30 border-b border-amber-900/10 bg-white/90 shadow-sm backdrop-blur lg:hidden">
          <div class="flex h-14 items-center justify-between gap-3 px-3">
            <a href="#/docente" class="flex min-w-0 items-center gap-3 font-black text-school-bark">
              <span class="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white shadow-soft ring-1 ring-amber-900/10"><img src="${SCHOOL_LOGO}" alt="Escudo Nueva Bolivia" class="h-full w-full object-contain p-1" /></span>
              <span class="truncate text-sm">Panel docente</span>
            </a>
            <button class="grid h-9 w-9 place-items-center rounded-lg border border-amber-900/10 bg-white text-school-navy" data-action="open-menu" aria-label="Abrir menu" aria-expanded="false">
              ${icon("menu", "h-4 w-4")}
            </button>
          </div>
        </header>

        <aside class="fixed inset-y-0 left-0 z-50 h-dvh max-h-dvh w-[252px] max-w-[84vw] -translate-x-full overflow-hidden border-r border-amber-900/10 bg-white p-3 shadow-2xl transition-transform duration-300 lg:hidden" data-sidebar aria-label="Navegacion docente" aria-hidden="true">
          ${sidebarNav(items, activeRoute, title, "mobile")}
        </aside>
        <div class="fixed inset-0 z-40 hidden bg-slate-950/40 lg:hidden" data-sidebar-backdrop></div>
        ${accountSettingsModal()}

        <main class="mx-auto max-w-7xl px-2.5 py-2.5 sm:px-4 sm:py-4 ${docenteMainFixedClass}">${content}</main>
        <footer class="mx-auto max-w-7xl px-2.5 pb-3 text-[10px] font-semibold text-slate-400 sm:px-4 ${isDocenteDashboard ? "lg:hidden" : ""}">${APP_VERSION}</footer>
      </div>
    `;
  }

  return `
    <div class="min-h-screen bg-transparent">
      <header class="sticky top-0 z-40 border-b border-amber-900/10 bg-white/90 shadow-sm backdrop-blur">
        <div class="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:px-4 sm:py-3">
          <a href="#/${role || ""}" class="flex min-w-0 flex-1 items-center gap-2 font-black text-school-bark lg:flex-none">
            <span class="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-amber-900/10 sm:h-10 sm:w-10 sm:rounded-2xl"><img src="${SCHOOL_LOGO}" alt="Escudo Nueva Bolivia" class="h-full w-full object-contain p-1" /></span>
            <span class="truncate text-sm sm:text-base">${title}</span>
          </a>
          <nav class="ml-4 hidden max-w-[70vw] items-center gap-1 overflow-x-auto lg:flex">
            ${items.map((item) => navLink(item, activeRoute)).join("")}
          </nav>
          <button class="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-school-navy shadow-sm lg:hidden" data-action="open-menu" aria-label="Abrir menu">
            ${icon("menu", "h-5 w-5")}
          </button>
          <button class="hidden rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white shadow-soft transition hover:bg-red-700 lg:inline-flex" data-action="logout">
            ${icon("log-out", "mr-2 h-4 w-4")} Salir
          </button>
        </div>
      </header>

      <aside class="fixed inset-y-0 left-0 z-50 flex w-64 max-w-[86vw] -translate-x-full flex-col border-r border-slate-200 bg-white p-3 shadow-2xl transition-transform duration-300 lg:hidden" data-sidebar>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-base font-black text-slate-900">
            <span class="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-amber-900/10"><img src="${SCHOOL_LOGO}" alt="Escudo Nueva Bolivia" class="h-full w-full object-contain p-1" /></span>
            ${title}
          </div>
          <button class="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600" data-action="close-menu" aria-label="Cerrar menu">${icon("x", "h-5 w-5")}</button>
        </div>
        <div class="my-3 h-px bg-slate-200"></div>
        <nav class="min-h-0 flex-1 overflow-y-auto pb-3 pr-1 grid gap-1">
          ${items.map((item) => navLink(item, activeRoute, true)).join("")}
        </nav>
        <button class="mt-3 flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white" data-action="logout">
          ${icon("log-out", "h-4 w-4")} Salir
        </button>
      </aside>
      <div class="fixed inset-0 z-40 hidden bg-slate-950/40 lg:hidden" data-sidebar-backdrop></div>

      <main class="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-5">${content}</main>
      <footer class="mx-auto max-w-7xl px-3 pb-4 text-[11px] font-bold text-slate-400 sm:px-4">${APP_VERSION}</footer>
    </div>
  `;
}

export function moduleCard(title, description, href, iconName, accent = "bg-school-sky text-school-navy") {
  return `
    <a href="${href}" class="group rounded-2xl border border-slate-200 bg-white p-3 shadow-soft transition hover:-translate-y-1 hover:border-school-navy/30 hover:shadow-xl sm:p-4">
      <div class="mb-3 grid h-10 w-10 place-items-center rounded-xl ${accent} sm:h-11 sm:w-11">${icon(iconName, "h-5 w-5")}</div>
      <h3 class="text-base font-black text-slate-900 sm:text-lg">${title}</h3>
      <p class="mt-1 text-xs font-semibold leading-5 text-slate-500 sm:text-sm sm:leading-6">${description}</p>
    </a>
  `;
}

export function statCard(label, value, iconName, tone = "bg-white") {
  return `
    <article class="rounded-2xl border border-slate-200 ${tone} p-3 shadow-soft sm:p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[.14em] text-slate-400 sm:text-xs">${label}</p>
          <p class="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">${value}</p>
        </div>
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-school-navy text-white sm:h-11 sm:w-11">${icon(iconName, "h-5 w-5")}</span>
      </div>
    </article>
  `;
}

