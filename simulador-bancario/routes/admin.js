const express = require('express');
const pool = require('../config/db');
const sesion = require('../middleware/sesion');
const { verificar, hashear } = require('../utils/seguridad');
const { asyncH, ErrorNegocio } = require('../utils/errores');
const v = require('../utils/validar');
const { consignar } = require('../services/transacciones');

const router = express.Router();
router.use(sesion('admin'));

const ESTADOS = ['ACTIVO', 'INACTIVO', 'BLOQUEADO'];

const requiereAdmin = asyncH(async (req, res, next) => {
  if (!req.session.adminId) throw new ErrorNegocio('Debes iniciar sesión como administrador', 401);
  const [[u]] = await pool.query('SELECT estado FROM usuarios WHERE id = ? AND rol = "ADMIN"', [req.session.adminId]);
  if (!u || u.estado !== 'ACTIVO') {
    req.session.destroy(() => {});
    throw new ErrorNegocio('Administrador no habilitado', 403);
  }
  next();
});

router.post('/login', asyncH(async (req, res) => {
  const email = v.email(req.body.email);
  const pass = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !pass) throw new ErrorNegocio('Ingresa un correo y una contraseña válidos');
  const [[u]] = await pool.query('SELECT * FROM usuarios WHERE email = ? AND rol = "ADMIN"', [email]);
  if (!u || !verificar(pass, u.password_hash)) throw new ErrorNegocio('Correo o contraseña incorrectos', 401);
  if (u.estado !== 'ACTIVO') throw new ErrorNegocio('Administrador no habilitado', 403);
  req.session.adminId = u.id;
  res.json({ ok: true, nombre: `${u.nombre} ${u.apellido}` });
}));

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

router.get('/dashboard', requiereAdmin, asyncH(async (req, res) => {
  const [[k]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(estado = 'ACTIVO'), 0) AS activos,
            COALESCE(SUM(estado = 'INACTIVO'), 0) AS inactivos,
            COALESCE(SUM(estado = 'BLOQUEADO'), 0) AS bloqueados
       FROM usuarios WHERE rol = 'CLIENTE'`);
  const [[s]] = await pool.query('SELECT COALESCE(SUM(saldo), 0) AS total_saldos, COUNT(*) AS cuentas FROM cuentas');
  res.json({
    total_clientes: Number(k.total), clientes_activos: Number(k.activos),
    clientes_inactivos: Number(k.inactivos), clientes_bloqueados: Number(k.bloqueados),
    total_cuentas: Number(s.cuentas), suma_saldos: Number(s.total_saldos)
  });
}));

// ---------- Clientes ----------
router.get('/clientes', requiereAdmin, asyncH(async (req, res) => {
  const q = `%${(req.query.q || '').toString().trim()}%`;
  const [filas] = await pool.query(
    `SELECT u.id, u.nombre, u.apellido, u.documento, u.email, u.estado, c.numero_cuenta, c.saldo
       FROM usuarios u LEFT JOIN cuentas c ON c.usuario_id = u.id
      WHERE u.rol = 'CLIENTE' AND (u.nombre LIKE ? OR u.apellido LIKE ? OR u.documento LIKE ?
            OR u.email LIKE ? OR c.numero_cuenta LIKE ?)
      ORDER BY u.id DESC`, [q, q, q, q, q]);
  res.json(filas);
}));

router.post('/clientes', requiereAdmin, asyncH(async (req, res) => {
  const b = req.body;
  const d = {
    nombre: v.texto(b.nombre, { max: 80 }), apellido: v.texto(b.apellido, { max: 80 }),
    documento: v.soloDigitos(b.documento, 5, 15), email: v.email(b.email),
    telefono: v.soloDigitos(b.telefono, 7, 15), direccion: v.texto(b.direccion, { min: 5, max: 160 }),
    password: v.password(b.password), pin: v.soloDigitos(b.pin, 4, 4)
  };
  const tipo = ['AHORROS', 'CORRIENTE'].includes(b.tipo_cuenta) ? b.tipo_cuenta : null;
  const mensajes = {
    nombre: 'Nombre obligatorio', apellido: 'Apellido obligatorio', documento: 'Documento: 5 a 15 dígitos',
    email: 'Correo no válido', telefono: 'Teléfono: 7 a 15 dígitos', direccion: 'Dirección: mínimo 5 caracteres',
    password: 'Contraseña: mínimo 8 caracteres', pin: 'El PIN debe tener 4 dígitos'
  };
  for (const k of Object.keys(mensajes)) if (!d[k]) throw new ErrorNegocio(mensajes[k]);
  if (!tipo) throw new ErrorNegocio('Tipo de cuenta no válido');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.query(
      `INSERT INTO usuarios (nombre, apellido, documento, email, telefono, direccion, password_hash, rol, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CLIENTE', 'ACTIVO')`,
      [d.nombre, d.apellido, d.documento, d.email, d.telefono, d.direccion, hashear(d.password)]);
    let numero;
    for (let i = 0; i < 10; i++) { // genera un número de cuenta único de 10 dígitos
      numero = '30' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
      const [[ex]] = await conn.query('SELECT id FROM cuentas WHERE numero_cuenta = ?', [numero]);
      if (!ex) break;
    }
    await conn.query(
      'INSERT INTO cuentas (usuario_id, numero_cuenta, tipo, saldo, pin_hash, estado) VALUES (?, ?, ?, 0, ?, "ACTIVO")',
      [u.insertId, numero, tipo, hashear(d.pin)]);
    await conn.commit();
    res.status(201).json({ ok: true, mensaje: `Cliente creado. Número de cuenta: ${numero}`, id: u.insertId, numero_cuenta: numero });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

router.get('/clientes/:id', requiereAdmin, asyncH(async (req, res) => {
  const [[u]] = await pool.query(
    `SELECT id, nombre, apellido, documento, email, telefono, direccion, estado, creado_en
       FROM usuarios WHERE id = ? AND rol = 'CLIENTE'`, [req.params.id]);
  if (!u) throw new ErrorNegocio('Cliente no encontrado', 404);
  const [cuentas] = await pool.query(
    'SELECT id, numero_cuenta, tipo, saldo, estado FROM cuentas WHERE usuario_id = ?', [u.id]);
  const [movs] = await pool.query(
    `SELECT m.fecha, m.tipo, m.descripcion, m.valor, m.saldo_resultante FROM movimientos m
       JOIN cuentas c ON c.id = m.cuenta_id WHERE c.usuario_id = ? ORDER BY m.fecha DESC, m.id DESC LIMIT 10`, [u.id]);
  res.json({ usuario: u, cuentas, movimientos: movs });
}));

router.put('/clientes/:id', requiereAdmin, asyncH(async (req, res) => {
  const b = req.body;
  const nombre = v.texto(b.nombre, { max: 80 });
  const apellido = v.texto(b.apellido, { max: 80 });
  const email = v.email(b.email);
  const telefono = v.soloDigitos(b.telefono, 7, 15);
  const direccion = v.texto(b.direccion, { min: 5, max: 160 });
  if (!nombre || !apellido) throw new ErrorNegocio('Nombre y apellido son obligatorios');
  if (!email) throw new ErrorNegocio('Correo no válido');
  if (!telefono) throw new ErrorNegocio('Teléfono: 7 a 15 dígitos');
  if (!direccion) throw new ErrorNegocio('Dirección: mínimo 5 caracteres');
  const [r] = await pool.query(
    `UPDATE usuarios SET nombre = ?, apellido = ?, email = ?, telefono = ?, direccion = ?
      WHERE id = ? AND rol = 'CLIENTE'`, [nombre, apellido, email, telefono, direccion, req.params.id]);
  if (!r.affectedRows) throw new ErrorNegocio('Cliente no encontrado', 404);
  res.json({ ok: true, mensaje: 'Cliente actualizado' });
}));

// Habilitar (ACTIVO), inactivar o bloquear: afecta al usuario y a sus cuentas
router.patch('/clientes/:id/estado', requiereAdmin, asyncH(async (req, res) => {
  const estado = req.body.estado;
  if (!ESTADOS.includes(estado)) throw new ErrorNegocio('Estado no válido');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('UPDATE usuarios SET estado = ? WHERE id = ? AND rol = "CLIENTE"', [estado, req.params.id]);
    if (!r.affectedRows) throw new ErrorNegocio('Cliente no encontrado', 404);
    await conn.query('UPDATE cuentas SET estado = ? WHERE usuario_id = ?', [estado, req.params.id]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  res.json({ ok: true, mensaje: `Cliente ${estado === 'ACTIVO' ? 'habilitado' : estado === 'BLOQUEADO' ? 'bloqueado' : 'inactivado'}` });
}));

// ---------- Cuentas, consignaciones y movimientos ----------
router.get('/cuentas', requiereAdmin, asyncH(async (req, res) => {
  const [filas] = await pool.query(
    `SELECT c.id, c.numero_cuenta, c.tipo, c.saldo, c.estado, u.nombre, u.apellido, u.documento
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id ORDER BY c.id`);
  res.json(filas);
}));

router.post('/consignaciones', requiereAdmin, asyncH(async (req, res) => {
  const numero = v.soloDigitos(req.body.numero_cuenta, 10, 10);
  const monto = v.valor(req.body.valor);
  const desc = req.body.descripcion ? v.texto(req.body.descripcion, { max: 100 }) : '';
  if (!numero) throw new ErrorNegocio('El número de cuenta debe tener 10 dígitos');
  if (!monto) throw new ErrorNegocio('El valor debe ser mayor que cero');
  if (desc === null) throw new ErrorNegocio('La descripción no puede superar 100 caracteres');
  const r = await consignar(numero, monto, desc ? `Consignación - ${desc}` : 'Consignación banco');
  res.json({ ok: true, mensaje: `Consignación realizada. Nuevo saldo: ${r.saldo}`, saldo: r.saldo });
}));

router.get('/movimientos', requiereAdmin, asyncH(async (req, res) => {
  const q = `%${(req.query.q || '').toString().trim()}%`;
  const tipos = ['CONSIGNACION', 'RETIRO_CAJERO', 'TRANSFERENCIA_ENVIADA', 'TRANSFERENCIA_RECIBIDA'];
  const tipo = tipos.includes(req.query.tipo) ? req.query.tipo : null;
  const [filas] = await pool.query(
    `SELECT m.id, m.fecha, m.tipo, m.descripcion, m.valor, m.saldo_resultante, c.numero_cuenta,
            CONCAT(u.nombre, ' ', u.apellido) AS cliente
       FROM movimientos m JOIN cuentas c ON c.id = m.cuenta_id JOIN usuarios u ON u.id = c.usuario_id
      WHERE (c.numero_cuenta LIKE ? OR u.nombre LIKE ? OR u.apellido LIKE ?) AND (? IS NULL OR m.tipo = ?)
      ORDER BY m.fecha DESC, m.id DESC LIMIT 300`, [q, q, q, tipo, tipo]);
  res.json(filas);
}));

module.exports = router;
