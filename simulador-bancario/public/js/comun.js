const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dinero = (n) => formato.format(Number(n));
const fechaHora = (f) => new Date(f).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const TIPOS = {
  CONSIGNACION: 'Consignación', RETIRO_CAJERO: 'Retiro cajero',
  TRANSFERENCIA_ENVIADA: 'Transferencia enviada', TRANSFERENCIA_RECIBIDA: 'Transferencia recibida'
};

// Evita inyección de HTML (XSS) al pintar datos
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const e = new Error(data.error || 'Ocurrió un error inesperado');
    e.status = res.status;
    throw e;
  }
  return data;
}

function aviso(mensaje, tipo = 'success') {
  let zona = document.getElementById('toastZona');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'toastZona';
    zona.className = 'toast-zona';
    zona.setAttribute('aria-live', 'polite');
    document.body.appendChild(zona);
  }
  const a = document.createElement('div');
  a.className = `alert alert-${tipo} shadow-sm mb-2`;
  a.textContent = mensaje;
  zona.appendChild(a);
  setTimeout(() => a.remove(), 5000);
}

function filasMovimientos(lista, conCliente = false) {
  if (!lista.length) return `<tr><td colspan="${conCliente ? 7 : 5}" class="vacio">Todavía no hay movimientos.</td></tr>`;
  return lista.map((m) => `
    <tr>
      <td>${fechaHora(m.fecha)}</td>
      ${conCliente ? `<td>${esc(m.cliente)}<br><small class="text-secondary">${esc(m.numero_cuenta)}</small></td>` : ''}
      <td>${TIPOS[m.tipo] || esc(m.tipo)}</td>
      <td>${esc(m.descripcion)}</td>
      <td class="text-end ${m.valor >= 0 ? 'entra' : 'sale'}">${m.valor >= 0 ? '+' : '−'}${dinero(Math.abs(m.valor))}</td>
      <td class="text-end">${dinero(m.saldo_resultante)}</td>
    </tr>`).join('');
}
