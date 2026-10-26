// Datos iniciales. Idempotente: se puede correr varias veces sin duplicar.
// Usa DATABASE_URL_MIGRATOR (el usuario de la app no tiene permisos para todo esto).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenv.config({ path: path.join(raiz, '.env'), quiet: true });

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) throw new Error('Falta DATABASE_URL_MIGRATOR en server/.env');

const ROLES = [
  ['invitado', 'Invitado'],
  ['autorizante', 'Autorizante'],
  ['hse', 'Operador HSE'],
  ['porteria', 'Portería'],
  ['admin', 'Administrador'],
];

const PACKS = [
  { codigo: 'norte', nombre: 'Pack Norte', orden: 1, plantas: [['norte-1', 'Planta Norte 1'], ['norte-2', 'Planta Norte 2']] },
  { codigo: 'centro', nombre: 'Pack Centro', orden: 2, plantas: [['centro', 'Planta Centro']] },
  { codigo: 'sur', nombre: 'Pack Sur', orden: 3, plantas: [['sur', 'Planta Sur']] },
];

// Contenido de muestra: queda marcado revisar_hse hasta que HSE lo confirme o reemplace.
const REQUISITOS_GENERALES = [
  ['induccion', 'Inducción de seguridad', 'Video de inducción completo antes de cada solicitud. Se registra fecha y hora de finalización.'],
  ['normativa', 'Permiso de trabajo', 'Toda tarea operativa requiere permiso de trabajo emitido por la planta antes de iniciar.'],
  ['epp', 'Casco de seguridad', 'Con barbijo, en buen estado y dentro de su vida útil.'],
  ['epp', 'Calzado de seguridad', 'Con puntera y suela antideslizante.'],
  ['epp', 'Anteojos de seguridad', 'Lente claro; lente oscuro para trabajos a la intemperie con sol.'],
  ['epp', 'Ropa de trabajo ignífuga', 'Mameluco o conjunto ignífugo, mangas largas.'],
  ['epp', 'Protección auditiva', 'Obligatoria en zonas señalizadas de compresión y generación.'],
  ['epp', 'Guantes', 'Según la tarea: de vaqueta, nitrilo o dieléctricos.'],
];

const CONFIGURACION = {
  upload_max_mb: 10,
  upload_tipos: ['application/pdf', 'image/jpeg', 'image/png'],
  induccion_tolerancia_seg: 5,
  // Meses después de vencida, rechazada o egresada en que se borran adjuntos y datos personales.
  retencion_meses: 12,
  // Casillas que reciben el aviso de solicitud nueva, además de los usuarios con rol HSE.
  notificar_hse: [],
  // Categorías que no presentan ART con nómina (a confirmar con HSE; las demás sí).
  categorias_sin_documentos: ['visita'],
  // Hora (de TDF) desde la que quien sigue adentro aparece en "Sin egreso" y HSE recibe el aviso.
  cierre_dia_hora: '20:00',
};

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');

  for (const [codigo, nombre] of ROLES) {
    await client.query('INSERT INTO roles (codigo, nombre) VALUES ($1, $2) ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre', [codigo, nombre]);
  }

  const { rows: [invitado] } = await client.query(
    `INSERT INTO usuarios (email, nombre, es_invitado) VALUES ('invitado@accesos.local', 'Invitado', true)
     ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
  );
  await client.query("INSERT INTO usuario_roles (usuario_id, rol) VALUES ($1, 'invitado') ON CONFLICT DO NOTHING", [invitado.id]);

  const { rows: videos } = await client.query('SELECT id FROM videos_induccion WHERE activo LIMIT 1');
  let videoId = videos[0]?.id;
  if (!videoId) {
    const r = await client.query(
      "INSERT INTO videos_induccion (titulo, archivo, duracion_seg) VALUES ('Inducción general (video de prueba)', 'induccion-prueba.mp4', 120) RETURNING id",
    );
    videoId = r.rows[0].id;
  }

  for (const pack of PACKS) {
    const { rows: [p] } = await client.query(
      `INSERT INTO packs (codigo, nombre, orden) VALUES ($1, $2, $3)
       ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden RETURNING id`,
      [pack.codigo, pack.nombre, pack.orden],
    );
    for (const [i, [codigo, nombre]] of pack.plantas.entries()) {
      await client.query(
        `INSERT INTO plantas (pack_id, codigo, nombre, orden) VALUES ($1, $2, $3, $4)
         ON CONFLICT (codigo) DO UPDATE SET pack_id = EXCLUDED.pack_id, nombre = EXCLUDED.nombre, orden = EXCLUDED.orden`,
        [p.id, codigo, nombre, i + 1],
      );
    }
  }

  const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM requisitos_hse WHERE planta_id IS NULL');
  if (n === 0) {
    for (const [i, [tipo, titulo, detalle]] of REQUISITOS_GENERALES.entries()) {
      await client.query(
        'INSERT INTO requisitos_hse (planta_id, tipo, titulo, detalle, orden, revisar_hse) VALUES (NULL, $1, $2, $3, $4, true)',
        [tipo, titulo, detalle, i + 1],
      );
    }
  }

  for (const [clave, valor] of Object.entries(CONFIGURACION)) {
    await client.query('INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO NOTHING', [clave, JSON.stringify(valor)]);
  }

  await client.query('COMMIT');
  console.log(`Seeds aplicados: ${ROLES.length} roles, usuario invitado, ${PACKS.length} packs, video ${videoId}, requisitos HSE de muestra.`);
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  await client.end();
}
