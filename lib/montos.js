// Extrae montos candidatos del texto de una notificacion bancaria.
// Soporta "Bs 150,00", "150.00", "1.234,56", "150 Bs", "Bs. 150".
function extraerMontos(texto) {
  const nums = new Set();
  const re = /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})|\d+/g;
  for (const m of texto.match(re) || []) {
    let s = m;
    const tieneComa = s.includes(','), tienePunto = s.includes('.');
    if (tieneComa && tienePunto) {
      // El ultimo separador es el decimal
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (tieneComa) {
      s = s.replace(',', '.');
    } else if (tienePunto) {
      const partes = s.split('.');
      // "1.234" es miles; "150.00" es decimal
      if (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3) s = s.replace('.', '');
    }
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return [...nums];
}

module.exports = { extraerMontos };
