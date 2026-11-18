// Hash de contraseñas y PIN con scrypt (incluido en Node.js, no requiere dependencias nativas)
const crypto = require('crypto');

function hashear(texto) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(texto), sal, 64).toString('hex');
  return `scrypt$${sal}$${hash}`;
}

function verificar(texto, almacenado) {
  try {
    const [alg, sal, hash] = String(almacenado).split('$');
    if (alg !== 'scrypt') return false;
    const calculado = crypto.scryptSync(String(texto), sal, 64);
    const original = Buffer.from(hash, 'hex');
    return original.length === calculado.length && crypto.timingSafeEqual(original, calculado);
  } catch {
    return false;
  }
}

module.exports = { hashear, verificar };
