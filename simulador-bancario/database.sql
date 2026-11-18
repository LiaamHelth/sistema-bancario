-- =====================================================
-- Simulador Bancario Web - Base de datos
-- Compatible con MySQL 8 y MariaDB 10.4+
-- =====================================================
-- En local, crea la base de datos antes de importar:
--   CREATE DATABASE banco_sim CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE banco_sim;
-- En Hostinger: crea la base desde hPanel e importa este archivo con phpMyAdmin.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS movimientos;
DROP TABLE IF EXISTS transferencias;
DROP TABLE IF EXISTS cuentas;
DROP TABLE IF EXISTS usuarios;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------- USUARIOS (clientes y administradores) ----------
CREATE TABLE usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(80)  NOT NULL,
  apellido      VARCHAR(80)  NOT NULL,
  documento     VARCHAR(20)  NOT NULL UNIQUE,
  email         VARCHAR(120) NOT NULL UNIQUE,
  telefono      VARCHAR(20)  NULL,
  direccion     VARCHAR(160) NULL,
  password_hash VARCHAR(300) NOT NULL,
  rol           ENUM('ADMIN','CLIENTE') NOT NULL DEFAULT 'CLIENTE',
  estado        ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- CUENTAS ----------
CREATE TABLE cuentas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NOT NULL,
  numero_cuenta VARCHAR(10)  NOT NULL UNIQUE,
  tipo          ENUM('AHORROS','CORRIENTE') NOT NULL DEFAULT 'AHORROS',
  saldo         DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  pin_hash      VARCHAR(300) NOT NULL,
  estado        ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_saldo_no_negativo CHECK (saldo >= 0),
  CONSTRAINT fk_cuentas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- TRANSFERENCIAS ----------
CREATE TABLE transferencias (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cuenta_origen_id   INT UNSIGNED NOT NULL,
  cuenta_destino_id  INT UNSIGNED NOT NULL,
  valor              DECIMAL(15,2) NOT NULL,
  fecha              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_transf_valor CHECK (valor > 0),
  CONSTRAINT chk_transf_distintas CHECK (cuenta_origen_id <> cuenta_destino_id),
  CONSTRAINT fk_transf_origen  FOREIGN KEY (cuenta_origen_id)  REFERENCES cuentas(id),
  CONSTRAINT fk_transf_destino FOREIGN KEY (cuenta_destino_id) REFERENCES cuentas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- MOVIMIENTOS (nunca se eliminan desde el sistema) ----------
-- valor: positivo = entra dinero, negativo = sale dinero
CREATE TABLE movimientos (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cuenta_id        INT UNSIGNED NOT NULL,
  tipo             ENUM('CONSIGNACION','RETIRO_CAJERO','TRANSFERENCIA_ENVIADA','TRANSFERENCIA_RECIBIDA') NOT NULL,
  descripcion      VARCHAR(200) NOT NULL,
  valor            DECIMAL(15,2) NOT NULL,
  saldo_resultante DECIMAL(15,2) NOT NULL,
  transferencia_id INT UNSIGNED NULL,
  fecha            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_mov_valor CHECK (valor <> 0),
  CONSTRAINT fk_mov_cuenta FOREIGN KEY (cuenta_id) REFERENCES cuentas(id),
  CONSTRAINT fk_mov_transf FOREIGN KEY (transferencia_id) REFERENCES transferencias(id),
  INDEX idx_mov_cuenta_fecha (cuenta_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- DATOS DE PRUEBA
-- Admin:    admin@banco.com / Admin123*
-- Clientes: contraseña Cliente123*  | PIN cajero: ver README
-- =====================================================
INSERT INTO usuarios (id,nombre,apellido,documento,email,telefono,direccion,password_hash,rol,estado) VALUES
(1,'Administrador','Banco','900000001','admin@banco.com','3000000000','Sede principal','scrypt$a5107debb748ef11f5f4fca9a3e62825$c72424577d630268818b2892b30b81b1537204288d3312445d8b2f144fc5477580361f7d630bf74692f7d1bbf35761b8c782976d5ad27fba2a990ea2322409fb','ADMIN','ACTIVO'),
(2,'Juan','Pérez','1001001001','juan@correo.com','3101112233','Calle 10 # 5-20, Pereira','scrypt$068ee3cf5aeb31b1282d91abca195bf1$2d5af58a2ddedb822fb7077f12e353458a9dd4646dfab124282bf40e3419bf43b65d7e0dd3f07df3fdb1adb314722a98477f05b9dedba3bc5468de5d849b9ae4','CLIENTE','ACTIVO'),
(3,'María','Gómez','1002002002','maria@correo.com','3204445566','Carrera 8 # 12-30, Dosquebradas','scrypt$068ee3cf5aeb31b1282d91abca195bf1$2d5af58a2ddedb822fb7077f12e353458a9dd4646dfab124282bf40e3419bf43b65d7e0dd3f07df3fdb1adb314722a98477f05b9dedba3bc5468de5d849b9ae4','CLIENTE','ACTIVO'),
(4,'Carlos','Rodríguez','1003003003','carlos@correo.com','3157778899','Avenida 30 de Agosto # 45-10, Pereira','scrypt$068ee3cf5aeb31b1282d91abca195bf1$2d5af58a2ddedb822fb7077f12e353458a9dd4646dfab124282bf40e3419bf43b65d7e0dd3f07df3fdb1adb314722a98477f05b9dedba3bc5468de5d849b9ae4','CLIENTE','ACTIVO'),
(5,'Laura','Ruiz','1004004004','laura@correo.com','3001239876','Calle 20 # 7-15, Santa Rosa de Cabal','scrypt$068ee3cf5aeb31b1282d91abca195bf1$2d5af58a2ddedb822fb7077f12e353458a9dd4646dfab124282bf40e3419bf43b65d7e0dd3f07df3fdb1adb314722a98477f05b9dedba3bc5468de5d849b9ae4','CLIENTE','BLOQUEADO');

INSERT INTO cuentas (id,usuario_id,numero_cuenta,tipo,saldo,pin_hash,estado) VALUES
(1,2,'3001000001','AHORROS',1000000.00,'scrypt$6c527475dbecce26d54e62f3c37d53d1$eba3982663679eeecb708010bed56f15ddef530afddc2e60a068ea2d95bb17af6410da1a51bd7cb18ff84ab8f5b0a079c46bab5a7e3afa6d2172070f18ed24c3','ACTIVO'),
(2,3,'3001000002','CORRIENTE',2500000.00,'scrypt$96db1dd614e785228934da77426ef196$e7e1b121d16253a0604eecf2ee00d681adad63886d8c93be26e20a5222f8640ba49ae94aa93f81a7ffa7c76fab4f80912b5e88ab9ce69fb41939385808c901a7','ACTIVO'),
(3,4,'3001000003','AHORROS',1300000.00,'scrypt$e58c0a27dfe10115c896ac9f8ca6feb8$7af401f891801e368d7664180c89ebd0931443cf02d5a5543613aae296bc149b8e5e5caf20301ce9010334ae8661331556b19fed8839ba167f61a26a2acab9d5','ACTIVO'),
(4,5,'3001000004','AHORROS',250000.00,'scrypt$f0d2a41cb68931d79973439a57c37318$8ad4f70f3ddb0a0e04b43fd7e2f21637660ff47118ca0719bf50e770902eb4c6ef9e69d606365bc479d0dd650df3ee660346009132a9023314c0e2d7f3385b89','BLOQUEADO');

INSERT INTO transferencias (id,cuenta_origen_id,cuenta_destino_id,valor,fecha) VALUES
(1,2,3,500000.00,'2026-11-12 11:30:00');

INSERT INTO movimientos (cuenta_id,tipo,descripcion,valor,saldo_resultante,transferencia_id,fecha) VALUES
(1,'CONSIGNACION','Consignación inicial',1500000.00,1500000.00,NULL,'2026-11-09 09:00:00'),
(1,'RETIRO_CAJERO','Retiro cajero',-300000.00,1200000.00,NULL,'2026-11-10 14:20:00'),
(1,'RETIRO_CAJERO','Retiro cajero',-200000.00,1000000.00,NULL,'2026-11-11 16:45:00'),
(2,'CONSIGNACION','Consignación inicial',3000000.00,3000000.00,NULL,'2026-11-09 09:10:00'),
(2,'TRANSFERENCIA_ENVIADA','Transferencia a 3001000003',-500000.00,2500000.00,1,'2026-11-12 11:30:00'),
(3,'CONSIGNACION','Consignación inicial',800000.00,800000.00,NULL,'2026-11-09 09:20:00'),
(3,'TRANSFERENCIA_RECIBIDA','Transferencia de 3001000002',500000.00,1300000.00,1,'2026-11-12 11:30:00'),
(4,'CONSIGNACION','Consignación inicial',250000.00,250000.00,NULL,'2026-11-09 09:30:00');
