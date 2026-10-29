import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import postcss from "postcss";
import { applyTheme, bindThemeButtons, initializeTheme, readTheme, THEME_STORAGE_KEY } from "../src/ui/theme.js";
import { appShell } from "../src/ui/shell.js";
import { AdminShell } from "../src/modules/admin/AdminShell.js";
import { SUBJECTS } from "../src/data/catalog.js";

function fixture() {
  const map = new Map();
  const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key,value) => map.set(key,value) };
  const themeRoot = { dataset: {} };
  const button = () => {
    const values = new Map(), events = new Map(), tooltip = { textContent: "" };
    return { values, tooltip, setAttribute: (key,value) => values.set(key,value), querySelector: () => tooltip,
      addEventListener(type,callback,{ signal }) { events.set(type,callback); signal.addEventListener("abort",()=>events.delete(type),{once:true}); },
      click() { events.get("click")?.(); }
    };
  };
  const buttons = [button(),button()], handlers = new Map();
  const events = { addEventListener(type,callback,{signal}) { handlers.set(type,callback); signal.addEventListener("abort",()=>handlers.delete(type),{once:true}); } };
  const root = { documentElement: themeRoot, querySelectorAll: () => buttons };
  return { storage, themeRoot, root, buttons, events, stored:()=>map.get(THEME_STORAGE_KEY), event:(event)=>handlers.get("storage")?.(event) };
}

test("tema claro inicial y preferencias validas; almacenamiento bloqueado no impide cargar", () => {
  assert.equal(readTheme(null),"light"); assert.equal(readTheme({getItem:()=>"invalido"}),"light");
  assert.equal(readTheme({getItem:()=>{throw new Error("bloqueado");}}),"light");
  const ui=fixture(); ui.storage.setItem(THEME_STORAGE_KEY,"dark");
  assert.equal(initializeTheme({root:ui.themeRoot,storage:ui.storage}),"dark");
  assert.equal(applyTheme("invalido",ui.themeRoot),"light");
});

test("luna y sol sincronizan ambos sidebars, guardan preferencia y sobreviven a una navegacion", () => {
  const ui=fixture(); initializeTheme({root:ui.themeRoot,storage:ui.storage});
  const dispose=bindThemeButtons(ui);
  ui.buttons[0].click(); assert.equal(ui.themeRoot.dataset.theme,"dark"); assert.equal(ui.stored(),"dark");
  for(const button of ui.buttons) { assert.equal(button.values.get("aria-pressed"),"true"); assert.equal(button.values.get("aria-label"),"Activar tema claro"); assert.equal(button.tooltip.textContent,"Tema claro"); }
  dispose(); const next=fixture(); initializeTheme({root:next.themeRoot,storage:ui.storage});
  assert.equal(next.themeRoot.dataset.theme,"dark");
  const stop=bindThemeButtons({...next,storage:ui.storage}); next.buttons[1].click(); assert.equal(ui.stored(),"light"); stop();
});

test("fallar al guardar no revierte el tema y salir elimina los manejadores", () => {
  const ui=fixture(), controller=new AbortController();
  initializeTheme({root:ui.themeRoot,storage:null});
  bindThemeButtons({...ui,storage:{setItem:()=>{throw new Error("bloqueado");}},signal:controller.signal});
  ui.buttons[0].click(); assert.equal(ui.themeRoot.dataset.theme,"dark");
  controller.abort(); ui.buttons[0].click(); assert.equal(ui.themeRoot.dataset.theme,"dark");
});

test("otras pestanas sincronizan el tema sin sobreescribir claves de otras opciones", () => {
  const ui=fixture(); initializeTheme({root:ui.themeRoot,storage:ui.storage}); const dispose=bindThemeButtons(ui);
  ui.event({key:"otro-dato",newValue:"dark"}); assert.equal(ui.themeRoot.dataset.theme,"light");
  ui.event({key:THEME_STORAGE_KEY,newValue:"dark"}); assert.equal(ui.themeRoot.dataset.theme,"dark");
  ui.event({key:null,newValue:null}); assert.equal(ui.themeRoot.dataset.theme,"light"); dispose();
});

test("el tema se aplica antes de cargar la aplicacion y no depende de Firebase", () => {
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const bootstrap=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]; assert.ok(bootstrap);
  const document={documentElement:{dataset:{}}};
  vm.runInNewContext(bootstrap,{document,localStorage:{getItem:()=>"dark"}}); assert.equal(document.documentElement.dataset.theme,"dark");
  vm.runInNewContext(bootstrap,{document,localStorage:{getItem:()=>{throw new Error("bloqueado");}}}); assert.equal(document.documentElement.dataset.theme,"light");
});

test("docente y alumno tienen el control en escritorio y celular con iconos accesibles", () => {
  for(const role of ["docente","alumno"]) {
    const html=appShell(role,`/${role}`,"Contenido");
    assert.equal((html.match(/data-theme-toggle/g)||[]).length,2);
    assert.match(html,/data-lucide="moon"/); assert.match(html,/data-lucide="sun"/);
    assert.match(html,/aria-label="Activar tema oscuro" aria-pressed="false"/);
  }
  const admin=AdminShell("/admin/alumnos","Alumnos"); assert.equal((admin.match(/data-theme-toggle/g)||[]).length,2);
  const director=readFileSync(new URL("../src/modules/director/DirectorShell.js",import.meta.url),"utf8"); assert.match(director,/themeToggle\(\)/);
});

test("la paleta oscura solo se aplica en pantalla y no altera los informes impresos", () => {
  const css=postcss.parse(readFileSync(new URL("../src/theme.css",import.meta.url),"utf8"));
  let colors=0;
  css.walkDecls(/^--theme-/, (declaration) => {
    let parent=declaration.parent;
    while(parent && !(parent.type === "atrule" && parent.name === "media" && parent.params === "screen")) parent=parent.parent;
    assert.ok(parent,`${declaration.prop} debe estar limitado a pantalla`); colors++;
  });
  assert.ok(colors>=10);
  const print=css.nodes.find((node)=>node.type === "atrule" && node.name === "media" && node.params === "print");
  assert.ok(print.toString().includes("color-scheme:light"));
  assert.ok(print.toString().includes("display:none !important"));
});

test("el horario y las insignias de Primaria conservan su color sin fijar fondos pastel", async () => {
  const previous=Object.getOwnPropertyDescriptor(globalThis,"sessionStorage");
  globalThis.sessionStorage={getItem:()=>null};
  let courseSubjectsBadges, scheduleList;
  try { ({courseSubjectsBadges,scheduleList}=await import("../src/modules/docente/UtilidadesDocente.js")); }
  finally { if(previous) Object.defineProperty(globalThis,"sessionStorage",previous); else delete globalThis.sessionStorage; }
  const html=scheduleList(SUBJECTS.map((subject)=>({ materiaId:subject.id, materia:subject.nombre, color:subject.color, periodo:"1", hora:"08:00 - 08:40" })),"");
  const badges=courseSubjectsBadges({materias:SUBJECTS.map((subject)=>subject.id)});
  for(const subject of SUBJECTS) {
    assert.ok(html.includes(`--surface-color:${subject.color}`));
    assert.ok(badges.includes(`--surface-color:${subject.color}`));
  }
  assert.match(html,/tinted-surface subject-accent/);
  assert.doesNotMatch(html,/style="background:/);
  assert.doesNotMatch(badges,/style="background:/);
});

test("los textos principales y secundarios tienen contraste AA sobre cada materia oscura", () => {
  const css=postcss.parse(readFileSync(new URL("../src/theme.css",import.meta.url),"utf8"));
  const colors={}; let mix, accentMix, mutedMix;
  css.walkDecls(/^--theme-/, d=>{colors[d.prop]=d.value;});
  css.walkRules(rule=>{
    if(rule.parent.type === "atrule" && rule.parent.params === "screen" && rule.selector.includes(".tinted-surface")) {
      const background=rule.nodes.find(d=>d.prop === "background-color");
      if(!background) return;
      mix=Number(background.value.match(/(\d+)%/)[1])/100;
      accentMix=Number(rule.nodes.find(d=>d.prop === "--surface-ink").value.match(/(\d+)%/)[1])/100;
      mutedMix=Number(rule.nodes.find(d=>d.prop === "--surface-muted").value.match(/(\d+)%/)[1])/100;
    }
  });
  const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16));
  const luminance=values=>values.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const base=rgb(colors["--theme-surface"]);
  assert.ok(mix>0 && mix<1);
  for(const subject of SUBJECTS) {
    const source=rgb(subject.color), ink=rgb(colors["--theme-ink"]);
    const background=source.map((v,i)=>v*mix+base[i]*(1-mix));
    const foregrounds={ nombre:source.map(v=>v*accentMix+255*(1-accentMix)), detalle:ink.map((v,i)=>v*mutedMix+source[i]*(1-mutedMix)) };
    for(const [kind,foreground] of Object.entries(foregrounds)) {
      const a=luminance(foreground), b=luminance(background);
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${subject.nombre}: ${kind}`);
    }
  }
});

test("los realces de materias y franjas de 4px no modifican el modo claro ni la impresion", () => {
  const css=postcss.parse(readFileSync(new URL("../src/theme.css",import.meta.url),"utf8"));
  const base=css.nodes.find(n=>n.type === "rule" && n.selector.includes(".tinted-surface"));
  assert.deepEqual(base.nodes.map(d=>[d.prop,d.value]),[["background-color","var(--surface-color,#fff)"]]);
  css.walkDecls(/^--surface-/,d=>{
    assert.ok(d.parent.selector.includes(':root[data-theme="dark"]'));
    assert.equal(d.parent.parent.name,"media"); assert.equal(d.parent.parent.params,"screen");
  });
  const stripe=css.nodes.find(n=>n.type === "atrule" && n.params === "screen").nodes.find(n=>n.selector?.includes(".subject-accent"));
  assert.ok(stripe.nodes.some(d=>d.prop === "box-shadow" && d.value === "inset 4px 0 var(--surface-color)"));
});

test("la cabecera de Primaria permite retirar los adornos claros solo en modo oscuro", () => {
  const dashboard=readFileSync(new URL("../src/modules/docente/DocenteDashboard.js",import.meta.url),"utf8");
  const css=postcss.parse(readFileSync(new URL("../src/theme.css",import.meta.url),"utf8"));
  assert.match(dashboard,/teacher-dashboard-accent/);
  assert.match(dashboard,/teacher-dashboard-watermark/);
  const rule=css.nodes.find(n=>n.type === "atrule" && n.params === "screen").nodes.find(n=>n.selector?.includes(".teacher-dashboard-accent"));
  assert.ok(rule.selector.includes(':root[data-theme="dark"]'));
  assert.ok(rule.nodes.some(d=>d.prop === "display" && d.value === "none"));
});
