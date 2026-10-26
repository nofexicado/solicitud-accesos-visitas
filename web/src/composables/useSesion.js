// Sesión del operador. La cookie es httpOnly: el front solo sabe quién es preguntándole a /auth/sesion.
import { ref } from 'vue';
import { api } from './api.js';

export const usuario = ref(null);
let pedido = null;

/** Carga el usuario una vez (o de nuevo con forzar). null si no hay sesión. */
export function cargarSesion({ forzar = false } = {}) {
  if (forzar) pedido = null;
  pedido ??= api('/auth/sesion')
    .then(({ usuario: u }) => { usuario.value = u; return u; })
    .catch(() => { usuario.value = null; return null; });
  return pedido;
}

export async function ingresar(email, password) {
  const u = await api('/auth/login', { metodo: 'POST', cuerpo: { email, password } });
  usuario.value = u;
  pedido = Promise.resolve(u);
  return u;
}

export async function salir() {
  try { await api('/auth/logout', { metodo: 'POST' }); } finally {
    usuario.value = null;
    pedido = Promise.resolve(null);
  }
}

/** La sesión venció en medio del trabajo (401): se olvida para que el router mande al login. */
export function sesionVencida() {
  usuario.value = null;
  pedido = Promise.resolve(null);
}

export const tieneRol = (rol) => Boolean(usuario.value?.roles.includes(rol));

/** Después del login: a donde iba (si es del panel) o al inicio del rol (recepción si solo recibe). */
export function destinoTrasLogin(volver, u) {
  const valido = typeof volver === 'string' && /^\/(operador|recepcion|en-planta)(\/|\?|$)/.test(volver) && !volver.startsWith('/operador/ingresar');
  if (valido) return volver;
  return u?.roles.some((r) => ['hse', 'autorizante'].includes(r)) ? '/operador' : '/recepcion';
}
