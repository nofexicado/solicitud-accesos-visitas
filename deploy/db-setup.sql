-- Base y usuarios de PostgreSQL para Solicitud de accesos de visitas.
-- Ejecutar una vez como superusuario (psql -U postgres -f db-setup.sql) reemplazando las contraseñas.
--   accesos_migrator: dueño del esquema, solo se usa para migraciones y seeds.
--   accesos_app:      el que usa el servicio; solo DML, sin DDL. Los permisos finos por tabla
--                     (p. ej. historial append-only) los aplica la migración inicial.

CREATE ROLE accesos_migrator LOGIN PASSWORD 'CAMBIAR_MIGRATOR';
CREATE ROLE accesos_app LOGIN PASSWORD 'CAMBIAR_APP';

CREATE DATABASE accesos_visitas OWNER accesos_migrator ENCODING 'UTF8' TEMPLATE template0;

\connect accesos_visitas

REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO accesos_migrator;
GRANT USAGE ON SCHEMA public TO accesos_app;
REVOKE CONNECT ON DATABASE accesos_visitas FROM PUBLIC;
GRANT CONNECT ON DATABASE accesos_visitas TO accesos_migrator, accesos_app;
