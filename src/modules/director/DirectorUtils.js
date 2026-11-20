import { createIcons, icons } from "../../ui/icons.js";

export function refreshDirectorIcons() {
  createIcons({ icons });
}

export function escapeDirectorHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
