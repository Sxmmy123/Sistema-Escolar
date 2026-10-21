export function estadoMenuLateral(movil, abierto, soloMovil = false) {
  const abiertoEnMovil = movil && abierto;
  return { abierto: abiertoEnMovil, oculto: movil ? !abierto : soloMovil, contenidoBloqueado: abiertoEnMovil };
}
