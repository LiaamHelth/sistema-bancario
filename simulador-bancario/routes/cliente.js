const express = require('express');
const pool = require('../config/db');
const sesion = require('../middleware/sesion');
const { verificar, hashear } = require('../utils/seguridad');
const { asyncH, ErrorNegocio } = require('../utils/errores');
const v = require('../utils/validar');
const { transferir } = require('../services/transacciones');

const router = express.Router();
router.use(sesion('cliente'));

// Solo deja pasar a clientes con sesión y estado ACTIVO (se revisa en cada petición)
const requiereCliente = asyncH(async (req, res, next) => {
  if (!req.session.userId) throw new ErrorNegocio('Debes iniciar sesión', 401);
  const [[u]] = await pool.query('SELECT id, estado FROM usuarios WHERE id = ? AND rol = "CLIENTE"', [req.session.userId]);
  if (!u || u.estado !== 'ACTIVO') {
    req.session.destroy(() => {});
    throw new ErrorNegocio('Tu usuario está bloqueado o inactivo. Comunícate con el banco', 403);
  }
  next();
});

async function cuentaDe(userId) {
  const [[c]] = await pool.query(
    'SELECT id, numero_cuenta, tipo, saldo, estado FROM cuentas WHERE usuario_id = ? ORDER BY id LIMIT 1', [userId]);
  return c;
}

router.post('/login', asyncH(async (req, res) => {
  const email = v.email(req.body.email);
  const pass = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !pass) throw new ErrorNegocio('Ingresa un correo y una contraseña válidos');
  const [[u]] = await pool.query('SELECT * FROM usuarios WHERE email = ? AND rol = "CLIENTE"', [email]);
  if (!u || !verificar(pass, u.password_hash)) throw new ErrorNegocio('Correo o contraseña incorrectos', 401);
  if (u.estado !== 'ACTIVO') throw new ErrorNegocio('Tu usuario está bloqueado o inactivo. Comunícate con el banco', 403);
  req.session.userId = u.id;
  res.json({ ok: true });
}));

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

router.get('/me', requiereCliente, asyncH(async (req, res) => {
  const [[u]] = await pool.query(
    'SELECT nombre, apellido, documento, email, telefono, direccion, estado FROM usuarios WHERE id = ?', [req.session.userId]);
  res.json({ usuario: u, cuenta: await cuentaDe(req.session.userId) });
}));

router.get('/movimientos', requiereCliente, asyncH(async (req, res) => {
  const cuenta = await cuentaDe(req.session.userId);
  const [filas] = await pool.query(
    `SELECT id, fecha, tipo, descripcion, valor, saldo_resultante FROM movimientos
      WHERE cuenta_id = ? ORDER BY fecha DESC, id DESC LIMIT 200`, [cuenta.id]);
  res.json(filas);
}));

router.post('/transferir', requiereCliente, asyncH(async (req, res) => {
  const destino = v.soloDigitos(req.body.cuenta_destino, 10, 10);
  const monto = v.valor(req.body.valor);
  const nota = req.body.descripcion ? v.texto(req.body.descripcion, { max: 80 }) : '';
  if (!destino) throw new ErrorNegocio('El número de cuenta destino debe tener 10 dígitos');
  if (!monto) throw new ErrorNegocio('El valor debe ser mayor que cero');
  if (nota === null) throw new ErrorNegocio('La descripción no puede superar 80 caracteres');
  const cuenta = await cuentaDe(req.session.userId);
  const r = await transferir(cuenta.id, destino, monto, nota);
  res.json({ ok: true, mensaje: 'Transferencia realizada con éxito', saldo: r.saldo });
}));

// El cliente solo puede cambiar correo, teléfono y dirección
router.put('/perfil', requiereCliente, asyncH(async (req, res) => {
  const email = v.email(req.body.email);
  const telefono = v.soloDigitos(req.body.telefono, 7, 15);
  const direccion = v.texto(req.body.direccion, { min: 5, max: 160 });
  if (!email) throw new ErrorNegocio('Correo electrónico no válido');
  if (!telefono) throw new ErrorNegocio('El teléfono debe tener entre 7 y 15 dígitos');
  if (!direccion) throw new ErrorNegocio('La dirección debe tener entre 5 y 160 caracteres');
  await pool.query('UPDATE usuarios SET email = ?, telefono = ?, direccion = ? WHERE id = ?',
    [email, telefono, direccion, req.session.userId]);
  res.json({ ok: true, mensaje: 'Perfil actualizado' });
}));

router.put('/password', requiereCliente, asyncH(async (req, res) => {
  const { actual, nueva, confirmar } = req.body;
  if (!v.password(nueva)) throw new ErrorNegocio('La nueva contraseña debe tener entre 8 y 64 caracteres');
  if (nueva !== confirmar) throw new ErrorNegocio('La confirmación no coincide con la nueva contraseña');
  const [[u]] = await pool.query('SELECT password_hash FROM usuarios WHERE id = ?', [req.session.userId]);
  if (!verificar(actual, u.password_hash)) throw new ErrorNegocio('La contraseña actual es incorrecta', 401);
  await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hashear(nueva), req.session.userId]);
  res.json({ ok: true, mensaje: 'Contraseña actualizada' });
}));

module.exports = router;
