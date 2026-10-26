// Cliente de tests: un "equipo" (cookie jar) que manda el header propio que exige el CSRF.
import request from 'supertest';
import { crearApp } from '../src/app.js';

export const app = crearApp();

export function equipo() {
  const agente = request.agent(app);
  const conHeader = (r) => r.set('X-Requested-With', 'accesos');
  return {
    get: (ruta) => agente.get(ruta),
    post: (ruta, cuerpo) => conHeader(agente.post(ruta)).send(cuerpo),
    del: (ruta) => conHeader(agente.delete(ruta)),
    agente,
  };
}
