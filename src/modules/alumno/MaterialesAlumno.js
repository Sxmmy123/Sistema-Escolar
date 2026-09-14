function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function materialItemsForActivity(activity = {}) {
  const storedItems = Array.isArray(activity.materiales) ? activity.materiales : [];
  const items = storedItems
    .map((item) => ({
      cantidad: Math.max(1, Math.min(999, Math.round(Number(item?.cantidad) || 1))),
      material: String(item?.material || "").trim()
    }))
    .filter((item) => item.material);
  if (items.length) return items;
  const legacyTitle = String(activity.titulo || "").trim();
  if (!legacyTitle) return [];
  return legacyTitle
    .split(/\r?\n|,\s*/)
    .map((material) => material.replace(/^\s*[-*\u2022]\s*/, "").trim())
    .filter(Boolean)
    .map((material) => ({ cantidad: 1, material }));
}

function printableDate(date) {
  if (!date) return "Sin fecha";
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

export function printStudentMaterials({ activity, student, course, subject, trimesterLabel }) {
  const items = materialItemsForActivity(activity);
  if (!items.length) {
    window.alert("Esta actividad no tiene materiales para imprimir.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=800");
  if (!printWindow) {
    window.alert("El navegador bloqueo la ventana de impresion. Habilite las ventanas emergentes e intente nuevamente.");
    return;
  }

  const logoUrl = new URL("./images/logo-nueva-bolivia.png", window.location.href).href;
  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Materiales - ${escapeHtml(subject || "Materia")}</title>
        <style>
          @page { size: letter portrait; margin: 14mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #20251f; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
          .sheet { width: 100%; }
          .header { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 3px solid #087b2b; }
          .header img { width: 54px; height: 54px; object-fit: contain; }
          .school { margin: 0; font-size: 15px; font-weight: 700; }
          .system { margin: 3px 0 0; color: #5f6b63; font-size: 10px; }
          h1 { margin: 2px 0 0 auto; color: #087b2b; font-size: 20px; font-weight: 700; text-align: right; }
          .info { display: grid; grid-template-columns: 1.25fr .75fr; margin: 14px 0; border: 1px solid #aeb7b0; }
          .info div { min-height: 38px; padding: 7px 9px; border-right: 1px solid #d4d9d5; border-bottom: 1px solid #d4d9d5; }
          .info div:nth-child(2n) { border-right: 0; }
          .info div:nth-last-child(-n+2) { border-bottom: 0; }
          .label { display: block; margin-bottom: 2px; color: #66716a; font-size: 9px; text-transform: uppercase; }
          .value { font-size: 12px; font-weight: 700; text-transform: capitalize; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #5c655e; padding: 9px 10px; }
          th { background: #087b2b; color: white; font-size: 10px; letter-spacing: .04em; text-align: left; }
          th:first-child, td:first-child { width: 26%; text-align: center; }
          td { height: 37px; font-size: 13px; }
          tbody tr:nth-child(even) { background: #f4f8f4; }
          .footer { margin-top: 16px; color: #68726b; font-size: 10px; text-align: right; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <main class="sheet">
          <header class="header">
            <img src="${escapeHtml(logoUrl)}" alt="Escudo de la unidad educativa">
            <div><p class="school">U.E. Ecologica Nueva Bolivia</p><p class="system">Lista preparada por el docente</p></div>
            <h1>LISTA DE MATERIALES</h1>
          </header>
          <section class="info">
            <div><span class="label">Estudiante</span><span class="value">${escapeHtml(student?.nombre || "Alumno")}</span></div>
            <div><span class="label">Curso</span><span class="value">${escapeHtml(course?.nombre || "Curso")}</span></div>
            <div><span class="label">Materia</span><span class="value">${escapeHtml(subject || "Materia")}</span></div>
            <div><span class="label">Fecha de entrega</span><span class="value">${escapeHtml(printableDate(activity.fecha))}</span></div>
          </section>
          <table>
            <thead><tr><th>Cantidad</th><th>Material</th></tr></thead>
            <tbody>${items.map((item) => `<tr><td>${escapeHtml(item.cantidad)}</td><td>${escapeHtml(item.material)}</td></tr>`).join("")}</tbody>
          </table>
          <p class="footer">${escapeHtml(trimesterLabel || "")}</p>
        </main>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.addEventListener("load", () => {
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 150);
  }, { once: true });
}
