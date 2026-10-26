// Fase 3, control de acceso en planta: quién recibe en cada planta y el detalle de cada movimiento.
// Los movimientos son de solo inserción para la app: un egreso que faltó lo cierra HSE con otro
// movimiento (origen 'cierre_hse'), nunca editando el ingreso.

export const up = (pgm) => {
  pgm.sql(`
    -- Plantas donde recibe cada usuario de recepción (rol porteria). HSE recibe en todas.
    CREATE TABLE recepcion_plantas (
      usuario_id integer NOT NULL REFERENCES usuarios(id),
      planta_id  integer NOT NULL REFERENCES plantas(id),
      PRIMARY KEY (usuario_id, planta_id)
    );
    CREATE INDEX recepcion_plantas_planta_idx ON recepcion_plantas(planta_id);

    ALTER TABLE movimientos
      ADD COLUMN planta_id   integer REFERENCES plantas(id),
      ADD COLUMN origen      text NOT NULL DEFAULT 'recepcion' CHECK (origen IN ('recepcion', 'cierre_hse')),
      ADD COLUMN observacion text,
      ADD COLUMN ip          inet;
    -- Estado actual de cada persona: su último movimiento.
    CREATE INDEX movimientos_persona_ultimo_idx ON movimientos(persona_id, created_at DESC, id DESC);
    CREATE INDEX movimientos_planta_idx ON movimientos(planta_id, created_at DESC);

    GRANT SELECT, INSERT, DELETE ON recepcion_plantas TO accesos_app;
    REVOKE UPDATE, DELETE ON movimientos FROM accesos_app;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS movimientos_planta_idx, movimientos_persona_ultimo_idx;
    ALTER TABLE movimientos DROP COLUMN IF EXISTS ip, DROP COLUMN IF EXISTS observacion,
      DROP COLUMN IF EXISTS origen, DROP COLUMN IF EXISTS planta_id;
    DROP TABLE IF EXISTS recepcion_plantas;
  `);
};
