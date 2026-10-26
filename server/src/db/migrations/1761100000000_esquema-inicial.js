// Esquema inicial del portal de accesos.
// Los valores permitidos de estado/categoría replican packages/shared/src/estados.js.

export const up = (pgm) => {
  pgm.sql(`
    -- Catálogo -------------------------------------------------------------
    CREATE TABLE videos_induccion (
      id            serial PRIMARY KEY,
      titulo        text NOT NULL,
      archivo       text NOT NULL,          -- nombre de archivo dentro de DATA_DIR/videos
      duracion_seg  integer NOT NULL CHECK (duracion_seg > 0),
      sha256        text,
      version       integer NOT NULL DEFAULT 1,
      activo        boolean NOT NULL DEFAULT true,
      created_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE packs (
      id          serial PRIMARY KEY,
      codigo      text NOT NULL UNIQUE,
      nombre      text NOT NULL,
      descripcion text NOT NULL DEFAULT '',
      orden       integer NOT NULL DEFAULT 0,
      activo      boolean NOT NULL DEFAULT true
    );

    CREATE TABLE plantas (
      id                    serial PRIMARY KEY,
      pack_id               integer NOT NULL REFERENCES packs(id),
      codigo                text NOT NULL UNIQUE,
      nombre                text NOT NULL,
      normativa_particular  text NOT NULL DEFAULT '',
      video_id              integer REFERENCES videos_induccion(id),
      orden                 integer NOT NULL DEFAULT 0,
      activo                boolean NOT NULL DEFAULT true
    );
    CREATE INDEX plantas_pack_idx ON plantas(pack_id);

    CREATE TABLE requisitos_hse (
      id          serial PRIMARY KEY,
      planta_id   integer REFERENCES plantas(id),     -- null = aplica a todas las plantas
      tipo        text NOT NULL CHECK (tipo IN ('normativa', 'induccion', 'epp')),
      titulo      text NOT NULL,
      detalle     text NOT NULL DEFAULT '',
      obligatorio boolean NOT NULL DEFAULT true,
      orden       integer NOT NULL DEFAULT 0,
      activo      boolean NOT NULL DEFAULT true,
      revisar_hse boolean NOT NULL DEFAULT false      -- contenido de muestra a confirmar por HSE
    );
    CREATE INDEX requisitos_hse_planta_idx ON requisitos_hse(planta_id, tipo);

    CREATE TABLE configuracion (
      clave text PRIMARY KEY,
      valor jsonb NOT NULL
    );

    -- Usuarios y permisos -------------------------------------------------
    CREATE TABLE roles (
      codigo text PRIMARY KEY,
      nombre text NOT NULL
    );

    CREATE TABLE usuarios (
      id                serial PRIMARY KEY,
      email             text NOT NULL UNIQUE,
      nombre            text NOT NULL,
      password_hash     text,
      es_invitado       boolean NOT NULL DEFAULT false,
      activo            boolean NOT NULL DEFAULT true,
      intentos_fallidos integer NOT NULL DEFAULT 0,
      bloqueado_hasta   timestamptz,
      ultimo_login      timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now(),
      CHECK (es_invitado OR password_hash IS NOT NULL)
    );

    CREATE TABLE usuario_roles (
      usuario_id integer NOT NULL REFERENCES usuarios(id),
      rol        text NOT NULL REFERENCES roles(codigo),
      PRIMARY KEY (usuario_id, rol)
    );

    CREATE TABLE autorizante_plantas (
      usuario_id integer NOT NULL REFERENCES usuarios(id),
      planta_id  integer NOT NULL REFERENCES plantas(id),
      PRIMARY KEY (usuario_id, planta_id)
    );
    CREATE INDEX autorizante_plantas_planta_idx ON autorizante_plantas(planta_id);

    CREATE TABLE sesiones (
      jti        uuid PRIMARY KEY,
      usuario_id integer NOT NULL REFERENCES usuarios(id),
      expira     timestamptz NOT NULL,
      revocada   boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE dispositivos (
      id         uuid PRIMARY KEY,
      token_hash text NOT NULL UNIQUE,
      creado     timestamptz NOT NULL DEFAULT now(),
      ultimo_uso timestamptz NOT NULL DEFAULT now()
    );

    -- Solicitudes ----------------------------------------------------------
    CREATE TABLE empresas (
      id           serial PRIMARY KEY,
      cuit         char(11) NOT NULL UNIQUE,
      razon_social text NOT NULL
    );

    CREATE TABLE solicitud_contadores (
      anio   integer PRIMARY KEY,
      ultimo integer NOT NULL DEFAULT 0
    );

    CREATE TABLE solicitudes (
      id                      bigserial PRIMARY KEY,
      numero                  text NOT NULL UNIQUE CHECK (numero ~ '^ACC-[0-9]{4}-[0-9]{6}$'),
      estado                  text NOT NULL DEFAULT 'enviada' CHECK (estado IN
                                ('enviada','validacion_hse','pendiente_autorizacion','aprobada',
                                 'rechazada','ingreso','egreso','vencida')),
      empresa_id              integer NOT NULL REFERENCES empresas(id),
      -- Datos personales: el job de retención los vacía ('') y marca depurada_at.
      solicitante_nombre     text NOT NULL,
      email                   text NOT NULL,
      telefono                text NOT NULL,
      pack_id                 integer NOT NULL REFERENCES packs(id),
      planta_id               integer REFERENCES plantas(id),
      otra_locacion           text NOT NULL DEFAULT '',
      contacto_interno        text NOT NULL,
      autorizante_id          integer REFERENCES usuarios(id),
      categoria               text NOT NULL CHECK (categoria IN
                                ('visita','contratista','servicio_tecnico','auditoria','proveedor','otro')),
      contrato_ref            text NOT NULL DEFAULT '',
      motivo                  text NOT NULL,
      fecha_desde             date NOT NULL,
      fecha_hasta             date NOT NULL CHECK (fecha_hasta >= fecha_desde),
      hora_desde              time,
      hora_hasta              time,
      induccion_video_id      integer REFERENCES videos_induccion(id),
      induccion_inicio        timestamptz,
      induccion_fin           timestamptz,
      epp_aceptado_at         timestamptz,
      qr_version              integer NOT NULL DEFAULT 1,
      motivo_rechazo          text,
      idempotency_key         uuid NOT NULL UNIQUE,
      creado_por_usuario      integer REFERENCES usuarios(id),
      creado_por_dispositivo  uuid REFERENCES dispositivos(id),
      ip                      inet,
      cerrada_at              timestamptz,     -- pasó a vencida, rechazada o egreso: desde acá cuenta la retención
      depurada_at             timestamptz,     -- datos personales y adjuntos ya borrados
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      CHECK (planta_id IS NOT NULL OR otra_locacion <> ''),
      CHECK (depurada_at IS NULL OR cerrada_at IS NOT NULL)
    );
    CREATE INDEX solicitudes_retencion_idx ON solicitudes(cerrada_at) WHERE depurada_at IS NULL;
    CREATE INDEX solicitudes_estado_fecha_idx ON solicitudes(estado, fecha_desde);
    CREATE INDEX solicitudes_planta_estado_idx ON solicitudes(planta_id, estado);
    CREATE INDEX solicitudes_empresa_idx ON solicitudes(empresa_id);
    CREATE INDEX solicitudes_dispositivo_idx ON solicitudes(creado_por_dispositivo);
    CREATE INDEX solicitudes_hasta_idx ON solicitudes(fecha_hasta) WHERE estado IN
      ('enviada','validacion_hse','pendiente_autorizacion','aprobada');

    CREATE TABLE dispositivo_solicitudes (
      dispositivo_id uuid NOT NULL REFERENCES dispositivos(id),
      solicitud_id   bigint NOT NULL REFERENCES solicitudes(id),
      created_at     timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (dispositivo_id, solicitud_id)
    );

    CREATE TABLE solicitud_personas (
      id              bigserial PRIMARY KEY,
      solicitud_id    bigint NOT NULL REFERENCES solicitudes(id),
      nombre_apellido text NOT NULL,                  -- al depurar: 'Persona N'
      tipo_doc        text NOT NULL CHECK (tipo_doc IN ('dni','pasaporte')),
      nro_doc         text,                           -- null solo después de depurar
      cargo           text NOT NULL,
      UNIQUE (solicitud_id, tipo_doc, nro_doc)
    );
    CREATE INDEX solicitud_personas_doc_idx ON solicitud_personas(nro_doc);

    CREATE TABLE solicitud_vehiculos (
      id           bigserial PRIMARY KEY,
      solicitud_id bigint NOT NULL REFERENCES solicitudes(id),
      patente      text,                              -- null solo después de depurar
      marca_modelo text NOT NULL,
      vto_seguro   date NOT NULL,
      vto_vtv      date NOT NULL,
      UNIQUE (solicitud_id, patente)
    );
    CREATE INDEX solicitud_vehiculos_patente_idx ON solicitud_vehiculos(patente);

    CREATE TABLE uploads_temporales (
      id              uuid PRIMARY KEY,
      dispositivo_id  uuid NOT NULL REFERENCES dispositivos(id),
      archivo         text NOT NULL,
      nombre_original text NOT NULL,
      mime_real       text NOT NULL,
      tamano          integer NOT NULL,
      sha256          text NOT NULL,
      av_escaneado_at timestamptz,                    -- Defender sin amenazas; null = antivirus desactivado (dev)
      expira          timestamptz NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX uploads_temporales_expira_idx ON uploads_temporales(expira);

    CREATE TABLE documentos (
      id              bigserial PRIMARY KEY,
      solicitud_id    bigint NOT NULL REFERENCES solicitudes(id),
      tipo            text NOT NULL CHECK (tipo IN ('art','nomina','otro')),
      nombre_original text NOT NULL,                  -- al depurar: ''
      archivo         text UNIQUE,                    -- null = archivo borrado por retención
      mime_real       text NOT NULL,
      tamano          integer NOT NULL,
      sha256          text NOT NULL,
      av_escaneado_at timestamptz,
      subido_at       timestamptz NOT NULL DEFAULT now(),
      estado_revision text NOT NULL DEFAULT 'pendiente' CHECK (estado_revision IN ('pendiente','aceptado','observado')),
      revisado_por    integer REFERENCES usuarios(id),
      revisado_at     timestamptz,
      observacion     text
    );
    CREATE INDEX documentos_solicitud_idx ON documentos(solicitud_id);

    CREATE TABLE solicitud_eventos (
      id              bigserial PRIMARY KEY,
      solicitud_id    bigint NOT NULL REFERENCES solicitudes(id),
      estado_anterior text,
      estado_nuevo    text,
      accion          text NOT NULL,
      usuario_id      integer REFERENCES usuarios(id),
      actor           text NOT NULL,
      -- Solo-agregar y fuera de la depuración: nunca guardar acá nombres, documentos, patentes ni mails.
      detalle        jsonb NOT NULL DEFAULT '{}',
      ip              inet,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX solicitud_eventos_solicitud_idx ON solicitud_eventos(solicitud_id, created_at);

    CREATE TABLE movimientos (
      id           bigserial PRIMARY KEY,
      solicitud_id bigint NOT NULL REFERENCES solicitudes(id),
      persona_id   bigint REFERENCES solicitud_personas(id),
      vehiculo_id  bigint REFERENCES solicitud_vehiculos(id),
      tipo         text NOT NULL CHECK (tipo IN ('ingreso','egreso')),
      pack_id      integer REFERENCES packs(id),
      usuario_id   integer NOT NULL REFERENCES usuarios(id),
      created_at   timestamptz NOT NULL DEFAULT now(),
      CHECK (persona_id IS NOT NULL OR vehiculo_id IS NOT NULL)
    );
    CREATE INDEX movimientos_persona_idx ON movimientos(persona_id, created_at DESC);
    CREATE INDEX movimientos_solicitud_idx ON movimientos(solicitud_id);

    -- Notificaciones y auditoría -------------------------------------------
    CREATE TABLE notificaciones_cola (
      id                bigserial PRIMARY KEY,
      destinatario      text NOT NULL,              -- al depurar: '' y payload '{}'
      plantilla         text NOT NULL,
      payload           jsonb NOT NULL DEFAULT '{}',
      estado            text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviando','enviado','error')),
      intentos          integer NOT NULL DEFAULT 0,
      ultimo_error      text,
      proximo_intento_at timestamptz NOT NULL DEFAULT now(),
      solicitud_id      bigint REFERENCES solicitudes(id),
      created_at        timestamptz NOT NULL DEFAULT now(),
      enviado_at        timestamptz
    );
    CREATE INDEX notificaciones_cola_pendientes_idx ON notificaciones_cola(estado, proximo_intento_at);

    CREATE TABLE auditoria_admin (
      id         bigserial PRIMARY KEY,
      usuario_id integer REFERENCES usuarios(id),
      entidad    text NOT NULL,
      entidad_id text NOT NULL,
      accion     text NOT NULL,
      antes      jsonb,
      despues    jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Permisos de accesos_app ---------------------------------------------
    -- Lectura y escritura sin DDL; el historial y la auditoría son solo-agregar.
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO accesos_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO accesos_app;
    REVOKE UPDATE ON solicitud_eventos, auditoria_admin FROM accesos_app;
    -- Solo se borran filas efímeras: uploads vencidos, sesiones caducas, ligas de dispositivo y
    -- relaciones que edita el admin.
    GRANT DELETE ON uploads_temporales, sesiones, dispositivo_solicitudes,
      autorizante_plantas, usuario_roles TO accesos_app;
    -- La tabla de migraciones no es asunto de la app.
    REVOKE ALL ON pgmigrations FROM accesos_app;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS auditoria_admin, notificaciones_cola, movimientos, solicitud_eventos,
      documentos, uploads_temporales, solicitud_vehiculos, solicitud_personas,
      dispositivo_solicitudes, solicitudes, solicitud_contadores, empresas, dispositivos, sesiones,
      autorizante_plantas, usuario_roles, usuarios, roles, configuracion, requisitos_hse, plantas,
      packs, videos_induccion CASCADE;
  `);
};
