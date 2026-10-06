const schoolDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/La_Paz",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function fechaEscolarIso(date = new Date(), offset = 0) {
  const parts = Object.fromEntries(schoolDateFormat.formatToParts(date).map((part) => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (!offset) return day;
  const shifted = new Date(`${day}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}
