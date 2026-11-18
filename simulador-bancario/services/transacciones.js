// Toda operación que mueve dinero pasa por aquí.
// El saldo SOLO se modifica en el backend, dentro de una transacción MySQL.
const pool = require('../config/db');
const { ErrorNegocio } = require('../utils/errores');

const r2 = (n) => Math.round(n * 100) / 100;
const activa = (c) => c.estado === 'ACTIVO' && c.estado_usuario === 'ACTIVO';

async function enTransaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Bloquea las filas (FOR UPDATE) en orden de id para evitar interbloqueos
async function bloquearCuentas(conn, ids) {
  const unicos = [...new Set(ids)].sort((a, b) => a - b);
  const [filas] = await conn.query(
    `SELECT c.id, c.numero_cuenta, c.saldo, c.estado, u.estado AS estado_usuario
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id IN (?) ORDER BY c.id FOR UPDATE`,
    [unicos]
  );
  return filas.map((f) => ({ ...f, saldo: Number(f.saldo) }));
}

async function registrarMovimiento(conn, { cuentaId, tipo, descripcion, valor, saldo, transferenciaId = null }) {
  await conn.query(
    `INSERT INTO movimientos (cuenta_id, tipo, descripcion, valor, saldo_resultante, transferencia_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [cuentaId, tipo, descripcion, valor, saldo, transferenciaId]
  );
}

function validarValor(valor) {
  if (!(Number(valor) > 0)) throw new ErrorNegocio('El valor debe ser mayor que cero');
}

async function retirar(cuentaId, valor) {
  validarValor(valor);
  return enTransaccion(async (conn) => {
    const [c] = await bloquearCuentas(conn, [cuentaId]);
    if (!c) throw new ErrorNegocio('La cuenta no existe', 404);
    if (!activa(c)) throw new ErrorNegocio('La cuenta no está activa. No se pueden realizar operaciones', 403);
    if (c.saldo < valor) throw new ErrorNegocio('Saldo insuficiente para realizar el retiro');
    const nuevo = r2(c.saldo - valor);
    await conn.query('UPDATE cuentas SET saldo = ? WHERE id = ?', [nuevo, c.id]);
    await registrarMovimiento(conn, {
      cuentaId: c.id, tipo: 'RETIRO_CAJERO', descripcion: 'Retiro cajero', valor: -valor, saldo: nuevo
    });
    return { saldo: nuevo };
  });
}

async function consignar(numeroCuenta, valor, descripcion) {
  validarValor(valor);
  const [[destino]] = await pool.query('SELECT id FROM cuentas WHERE numero_cuenta = ?', [numeroCuenta]);
  if (!destino) throw new ErrorNegocio('La cuenta no existe', 404);
  return enTransaccion(async (conn) => {
    const [c] = await bloquearCuentas(conn, [destino.id]);
    if (!activa(c)) throw new ErrorNegocio('La cuenta está bloqueada o inactiva. No se pueden realizar operaciones', 403);
    const nuevo = r2(c.saldo + valor);
    await conn.query('UPDATE cuentas SET saldo = ? WHERE id = ?', [nuevo, c.id]);
    await registrarMovimiento(conn, {
      cuentaId: c.id, tipo: 'CONSIGNACION', descripcion: descripcion || 'Consignación', valor, saldo: nuevo
    });
    return { saldo: nuevo, numero_cuenta: c.numero_cuenta };
  });
}

async function transferir(origenId, numeroDestino, valor, nota) {
  validarValor(valor);
  const [[destino]] = await pool.query('SELECT id FROM cuentas WHERE numero_cuenta = ?', [numeroDestino]);
  if (!destino) throw new ErrorNegocio('La cuenta destino no existe', 404);
  if (destino.id === origenId) throw new ErrorNegocio('No puedes transferir a tu propia cuenta');

  return enTransaccion(async (conn) => {
    const cuentas = await bloquearCuentas(conn, [origenId, destino.id]);
    const o = cuentas.find((c) => c.id === origenId);
    const d = cuentas.find((c) => c.id === destino.id);
    if (!o) throw new ErrorNegocio('La cuenta origen no existe', 404);
    if (!activa(o)) throw new ErrorNegocio('Tu cuenta no está activa. No puedes realizar operaciones', 403);
    if (!activa(d)) throw new ErrorNegocio('La cuenta destino está bloqueada o inactiva', 403);
    if (o.saldo < valor) throw new ErrorNegocio('Saldo insuficiente para realizar la transferencia');

    const saldoO = r2(o.saldo - valor);
    const saldoD = r2(d.saldo + valor);
    const [t] = await conn.query(
      'INSERT INTO transferencias (cuenta_origen_id, cuenta_destino_id, valor) VALUES (?, ?, ?)',
      [o.id, d.id, valor]
    );
    await conn.query('UPDATE cuentas SET saldo = ? WHERE id = ?', [saldoO, o.id]);
    await conn.query('UPDATE cuentas SET saldo = ? WHERE id = ?', [saldoD, d.id]);

    const sufijo = nota ? ` - ${nota}` : '';
    await registrarMovimiento(conn, {
      cuentaId: o.id, tipo: 'TRANSFERENCIA_ENVIADA', descripcion: `Transferencia a ${d.numero_cuenta}${sufijo}`,
      valor: -valor, saldo: saldoO, transferenciaId: t.insertId
    });
    await registrarMovimiento(conn, {
      cuentaId: d.id, tipo: 'TRANSFERENCIA_RECIBIDA', descripcion: `Transferencia de ${o.numero_cuenta}${sufijo}`,
      valor, saldo: saldoD, transferenciaId: t.insertId
    });
    return { saldo: saldoO, transferencia_id: t.insertId };
  });
}

module.exports = { retirar, consignar, transferir };
