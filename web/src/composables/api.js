// Cliente de la API. Todas las mutaciones llevan el header propio que exige el backend (CSRF).
export class ErrorApi extends Error {
  constructor(status, cuerpo) {
    super(cuerpo?.error || 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.');
    this.status = status;
    this.campos = cuerpo?.campos ?? {};
    this.cuerpo = cuerpo;
  }
}

export async function api(ruta, { metodo = 'GET', cuerpo, encabezados = {}, signal } = {}) {
  const esForm = cuerpo instanceof FormData;
  let res;
  try {
    res = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      signal,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'accesos',
        ...(cuerpo && !esForm ? { 'Content-Type': 'application/json' } : {}),
        ...encabezados,
      },
      body: cuerpo ? (esForm ? cuerpo : JSON.stringify(cuerpo)) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ErrorApi(0, null);
  }
  const datos = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new ErrorApi(res.status, datos);
  return datos;
}
