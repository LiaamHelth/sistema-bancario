const session = require('express-session');

// Cada módulo usa su propia cookie de sesión: así se puede tener
// cliente, administrador y cajero abiertos a la vez en el mismo navegador.
module.exports = (nombre) =>
  session({
    name: `sid_${nombre}`,
    secret: process.env.SESSION_SECRET || 'secreto-solo-para-desarrollo',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' ? 'auto' : false,
      maxAge: 1000 * 60 * 30 // 30 minutos
    }
  });
