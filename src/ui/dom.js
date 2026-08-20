export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function html(strings, ...values) {
  return strings.reduce((acc, part, index) => acc + part + (values[index] ?? ""), "");
}

export function setView(markup) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="route-enter">${markup}</div>`;
}

export function icon(name, className = "h-5 w-5") {
  return `<i data-lucide="${name}" class="${className}"></i>`;
}
