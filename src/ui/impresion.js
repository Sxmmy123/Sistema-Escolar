export function formatoCarta({ superior = 10, derecho = 10, inferior = 10 } = {}) {
  const izquierdo = 25;
  const margen = `${superior}mm ${derecho}mm ${inferior}mm ${izquierdo}mm`;
  return {
    ancho: Math.round((215.9 - izquierdo - derecho) * 10) / 10,
    alto: Math.round((279.4 - superior - inferior) * 10) / 10,
    margen,
    pagina: `@page { size: letter portrait; margin: ${margen}; }`
  };
}
