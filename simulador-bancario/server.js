require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.set('trust proxy', 1); // necesario detrás del proxy de Hostinger (cookies seguras)
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/cliente', require('./routes/cliente'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/cajero', require('./routes/cajero'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Manejador central de errores
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === 'ER_DUP_ENTRY') {
    const campo = /documento/.test(err.message) ? 'documento' : /email/.test(err.message) ? 'correo' : 'dato';
    return res.status(409).json({ error: `Ya existe un usuario con ese ${campo}` });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Simulador bancario en http://localhost:${PORT}`));
