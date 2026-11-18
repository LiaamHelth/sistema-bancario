const express = require('express');
const pool = require('../config/db');
const sesion = require('../middleware/sesion');
const { verificar } = require('../utils/seguridad');
const { asyncH, ErrorNegocio } = require('../utils/errores');
const v = require('../utils/validar');
const { retirar } = require('../services/transacciones');

const router = express.Router();
router.use(sesion('cajero'));

const requiereCajero = (req, res, next) =>
  req.session.cuentaId ? next() : next(new ErrorNegocio('Sesión de cajero no iniciada', 401));

async function datosCuenta(id) {
  const [[c]] = await pool.query(
    `SELECT c.id, c.numero_cuenta, c.saldo, c.estado, u.estado AS estado_usuario, u.nombre
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ?`, [id]);
  return c;
}

router.post('/login', asyncH(async (req, res) => {
  const numero = v.soloDigitos(req.body.numero_cuenta, 10, 10);
  const pin = v.soloDigitos(req.body.pin, 4, 4);
  if (!numero || !pin) throw new ErrorNegocio('Ingresa un número de cuenta de 10 dígitos y un PIN de 4 dígitos');
  const [[c]] = await pool.query(
    `SELECT c.id, c.pin_hash, c.estado, u.estado AS estado_usuario, u.nombre
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id WHERE c.numero_cuenta = ?`, [numero]);
  if (!c || !verificar(pin, c.pin_hash)) throw new ErrorNegocio('Cuenta o PIN incorrectos', 401);
  if (c.estado !== 'ACTIVO' || c.estado_usuario !== 'ACTIVO') throw new ErrorNegocio('La cuenta no está activa', 403);
  req.session.cuentaId = c.id;
  res.json({ ok: true, nombre: c.nombre });
}));

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

router.get('/saldo', requiereCajero, asyncH(async (req, res) => {
  const c = await datosCuenta(req.session.cuentaId);
  if (c.estado !== 'ACTIVO' || c.estado_usuario !== 'ACTIVO') throw new ErrorNegocio('La cuenta no está activa', 403);
  res.json({ numero_cuenta: c.numero_cuenta, nombre: c.nombre, saldo: c.saldo });
}));

router.post('/retiro', requiereCajero, asyncH(async (req, res) => {
  const monto = v.valor(req.body.valor);
  if (!monto) throw new ErrorNegocio('El valor debe ser mayor que cero');
  const r = await retirar(req.session.cuentaId, monto);
  res.json({ ok: true, mensaje: 'Retiro realizado con éxito', saldo: r.saldo });
}));

router.get('/movimientos', requiereCajero, asyncH(async (req, res) => {
  const [filas] = await pool.query(
    `SELECT fecha, tipo, descripcion, valor, saldo_resultante FROM movimientos
      WHERE cuenta_id = ? ORDER BY fecha DESC, id DESC LIMIT 5`, [req.session.cuentaId]);
  res.json(filas);
}));

module.exports = router;
