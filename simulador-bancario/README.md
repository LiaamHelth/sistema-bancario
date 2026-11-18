# Banco Sim – Simulador Bancario Web

## Descripción
Aplicación web que simula las funciones básicas de un banco con **tres módulos** que trabajan sobre la **misma base de datos MySQL**:

- **Banca virtual** (`/cliente/`): el cliente consulta su saldo, movimientos, transfiere dinero y gestiona su perfil.
- **Administración** (`/admin/`): dashboard, gestión de clientes, cuentas, consignaciones e historial general.
- **Cajero automático** (`/cajero/`): ingreso con número de cuenta y PIN, consulta de saldo, retiros y últimos movimientos.

Cualquier operación hecha en un módulo se ve de inmediato en los otros.

## Integrantes
- _Nombre del integrante 1_
- _Nombre del integrante 2_
- _Nombre del integrante 3_

## Tecnologías utilizadas
Node.js · Express.js · MySQL (`mysql2`) · express-session · dotenv · HTML, CSS, JavaScript · Bootstrap 5

## Requisitos
- Node.js 18 o superior
- MySQL 8 (o MariaDB 10.4+)
- Git

## Instalación
```bash
git clone <URL_DEL_REPOSITORIO>
cd simulador-bancario
npm install
cp .env.example .env     # en Windows: copy .env.example .env
```
Edita `.env` con los datos de tu base de datos.

## Configuración de la base de datos
```sql
CREATE DATABASE banco_sim CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
Luego importa el script (crea tablas, relaciones, restricciones y datos de prueba):
```bash
mysql -u root -p banco_sim < database.sql
```
Diagrama de la base de datos: [`docs/diagrama_bd.md`](docs/diagrama_bd.md)

## Ejecución
```bash
npm start
```
Abre http://localhost:3000

## Usuarios de prueba
| Rol | Usuario | Contraseña | Cuenta | PIN cajero | Saldo inicial |
|---|---|---|---|---|---|
| Administrador | admin@banco.com | Admin123* | – | – | – |
| Cliente (Juan Pérez) | juan@correo.com | Cliente123* | 3001000001 | 1234 | $1.000.000 |
| Cliente (María Gómez) | maria@correo.com | Cliente123* | 3001000002 | 2345 | $2.500.000 |
| Cliente (Carlos Rodríguez) | carlos@correo.com | Cliente123* | 3001000003 | 3456 | $1.300.000 |
| Cliente bloqueado (Laura Ruiz) | laura@correo.com | Cliente123* | 3001000004 | 4567 | $250.000 |

## Principales funcionalidades
- Autenticación con roles (cliente / administrador) y sesiones independientes por módulo.
- Contraseñas y PIN con hash (scrypt), nunca en texto plano.
- Consignaciones, retiros y transferencias con **transacciones MySQL** (`FOR UPDATE`): el saldo y sus movimientos se guardan siempre juntos o no se guardan.
- Registro automático de cada movimiento con saldo resultante. Los movimientos no se pueden eliminar.
- Estados ACTIVO / INACTIVO / BLOQUEADO: una cuenta o usuario bloqueado no puede operar.
- Validaciones en el frontend y en el backend. Un cliente solo accede a su propia información.
- Dashboard: total de clientes, activos, bloqueados y suma de saldos.

## Prueba mínima de funcionamiento (para la sustentación)
1. Cliente Juan entra a `/cliente/` y ve su saldo ($1.000.000).
2. En `/cajero/` ingresa con `3001000001` y PIN `1234`, y retira $200.000.
3. En `/cliente/` el saldo baja a $800.000 y aparece "Retiro cajero −$200.000".
4. En `/admin/` el administrador ve la cuenta con $800.000.
5. El administrador consigna $300.000 a esa cuenta.
6. Juan vuelve a `/cliente/` y ve $1.100.000.

> Los tres módulos usan cookies de sesión distintas: puedes tener cliente, cajero y admin abiertos a la vez en pestañas del mismo navegador.

## Despliegue en Hostinger (Node.js)
1. Sube el proyecto a GitHub (sin `node_modules` ni `.env`).
2. En hPanel crea una **Web App Node.js** (requiere un plan Business o superior) y conéctala al repositorio.
3. Crea una base de datos MySQL en hPanel e importa `database.sql` con phpMyAdmin.
4. En las variables de entorno de la app define: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET` y `NODE_ENV=production`.
5. Comando de inicio: `npm start` (o `node server.js`). Despliega.
