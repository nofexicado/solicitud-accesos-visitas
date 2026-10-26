// Arma la forma que usa PassPreview a partir del detalle que devuelve el servidor.
import { borradorVacio } from './useBorrador.js';

export function paseDesdeDetalle(d) {
  const b = borradorVacio();
  b.datos.solicitante = { razon_social: d.empresa, cuit: d.cuit, solicitante_nombre: d.solicitante_nombre, email: d.email, telefono: d.telefono };
  b.datos.destino.otra_locacion = d.otra_locacion;
  b.datos.motivo = { ...b.datos.motivo, categoria: d.categoria, fecha_desde: d.fecha_desde, fecha_hasta: d.fecha_hasta };
  b.datos.personal = { personas: d.personas, vehiculos: d.vehiculos };
  b.datos.seguridad.induccion_comprobante = d.induccion_fin ? 'visto' : '';
  b.vista = { ...b.vista, pack: d.pack, planta: d.planta ?? 'Otra locación' };
  return b;
}
