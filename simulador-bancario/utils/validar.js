const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(v, { min = 1, max = 100 } = {}) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}
function email(v) {
  const t = texto(v, { min: 5, max: 120 });
  return t && EMAIL.test(t) ? t.toLowerCase() : null;
}
function soloDigitos(v, min, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const t = String(v).trim();
  return new RegExp(`^\\d{${min},${max}}$`).test(t) ? t : null;
}
// Valor monetario: número finito, mayor que cero, máximo 2 decimales
function valor(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 1e10) return null;
  return Math.round(n * 100) / 100;
}
function password(v) {
  return typeof v === 'string' && v.length >= 8 && v.length <= 64 ? v : null;
}

module.exports = { texto, email, soloDigitos, valor, password };
