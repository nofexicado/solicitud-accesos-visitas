# Validación del QR de un pase

Hay una sola regla para decidir si un pase habilita a entrar: `validarPase()` en
`server/src/modules/validacion.js`. Hoy la usa la recepción de cada planta. Está pensada para que,
más adelante, el lector QR del intercomunicador de un pack la consulte **sin cambios en la regla**.
Lo único que va a faltar es la ruta para el dispositivo y su autenticación, que no están implementadas
(ver «Para el lector del intercomunicador»).

## Qué lleva el QR

El QR codifica una URL: `https://accesos.ejemplo.com/q/<token>`.

- `<token>` es `base64url(json).base64url(hmac-sha256)`, firmado con `QR_SECRET`.
- El JSON es `{ "p": "qr", "s": <id interno>, "v": <qr_version> }`, sin datos personales.
- Subir `qr_version` revoca todos los QR anteriores de esa solicitud.
- Quien lee el QR manda **el texto tal cual lo leyó**: la URL completa o solo el token.
  `tokenDeCodigo()` saca el token de cualquiera de las dos formas.

## Regla (en este orden)

| Resultado | Cuándo | `motivo` |
| --- | --- | --- |
| `desconocido` | El texto no es un token válido firmado por el sistema. | «El código no es un pase válido o está dañado.» |
| `no_habilitado` | `qr_version` del token ≠ la actual. | «Este QR fue reemplazado por uno nuevo…» |
| `no_habilitado` | Solicitud depurada por retención. | «La solicitud está cerrada.» |
| `no_habilitado` | Estado fuera de `aprobada`, `ingreso` o `egreso`. | Rechazada, vencida o «todavía no está aprobada». |
| `no_habilitado` | Hoy (hora de Tierra del Fuego) fuera de `fecha_desde` a `fecha_hasta`. | «Habilitado recién desde el dd/mm» o «El pase venció el dd/mm». |
| `no_habilitado` | El punto de control es de otra planta, o de otro pack si la solicitud es de «otra locación». | «Es para Planta X, no para esta planta.» |
| `habilitado` | Todo lo anterior está bien. | Vacío. |

El horario pedido (`hora_desde` a `hora_hasta`) **no bloquea**: si se llega fuera de ese horario,
va como texto en `avisos`.

`egreso` habilita mientras el pase esté en fecha: en una visita de varios días se sale a la noche y se
vuelve a entrar a la mañana.

## Endpoint actual (recepción en planta)

```
POST /api/control/validar
Canal: interno (LAN, nginx pone X-Canal: interno)
Sesión: cookie acc_sesion de un usuario con rol porteria (en una planta asignada) o hse
CSRF: header X-Requested-With: accesos

{ "codigo": "<texto leído del QR>", "planta_id": 1 }
```

Respuesta `200`:

```json
{
  "resultado": "habilitado",
  "habilitado": true,
  "motivo": "",
  "avisos": ["Está fuera del horario pedido (hasta las 18:00)."],
  "solicitud": { "numero": "ACC-2026-000015", "estado": "aprobada", "empresa": "…", "planta": "…", "pack": "…",
                 "fecha_desde": "2026-10-23", "fecha_hasta": "2026-10-25", "hora_desde": "07:00", "hora_hasta": "18:00" },
  "personas": [{ "id": 31, "nombre_apellido": "…", "tipo_doc": "dni", "nro_doc": "…", "cargo": "…", "dentro": false }],
  "vehiculos": [{ "id": 12, "patente": "AE908TR", "marca_modelo": "…", "vencido": false }]
}
```

Errores:

| Código | Cuándo |
| --- | --- |
| `404` | Desde internet: la ruta no existe. |
| `401` | Sin sesión. |
| `403` | Sin el rol, o es una planta donde el usuario no recibe. |
| `422` | Falta `codigo` o `planta_id`. |

La respuesta de recepción trae datos personales porque la persona de recepción los necesita para
registrar quién entra. Los movimientos se registran aparte, con `POST /api/control/movimientos`.

## Para el lector del intercomunicador (no implementado)

Cuando se conecte, alcanza con una ruta nueva que llame a la misma función:

```js
const v = await validarPase({ codigo }, { plantaId: dispositivo.planta_id }); // o el pack del dispositivo
res.json({ resultado: v.resultado, habilitado: v.habilitado, motivo: v.motivo, numero: v.solicitud?.numero ?? null });
```

Recomendaciones para ese momento:

- **Ruta propia:** por ejemplo `POST /api/dispositivos/validar-qr`, con el mismo cuerpo `{ "codigo": "…" }`.
- **Autenticación por dispositivo, no por usuario:** una clave por lector, guardada como hash en una
  tabla `dispositivos_control` (id, nombre, pack o planta, hash de la clave, activo, último uso).
  Viaja en el header `Authorization: Bearer <clave>` y se puede revocar desde Admin.
- **Respuesta mínima, sin datos personales:** `resultado`, `habilitado`, `motivo` corto y `numero`.
  La barrera solo necesita abrir o no.
- **Canal:** el lector vive en la red del pack, así que la ruta va solo por el canal interno, nunca
  por el nginx externo. Se puede agregar una lista de IPs permitidas por dispositivo.
- **Límite de pedidos por dispositivo** (por ejemplo, 60 por minuto) y log de cada consulta con
  dispositivo, resultado y número. Nunca se loguea el token completo.
- **Asentar el paso:** si la barrera abre, decidir con HSE si eso es un ingreso por persona (hoy los
  registra recepción por persona) o solo un evento de «pasó el pack». Los movimientos actuales no
  se tocan.

## Tests

`server/test/control.test.js` cubre la regla (código inválido, QR reemplazado, otra planta, no
aprobado, habilitado), los permisos por planta y el canal externo.
