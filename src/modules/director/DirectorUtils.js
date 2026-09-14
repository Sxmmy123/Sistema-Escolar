import { createIcons, icons } from "lucide";

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
