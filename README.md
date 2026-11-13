# DU Equipo

Aplicación de coordinación del equipo: tareas, compromisos semanales, proyectos vinculados al Tablero de Gestión, incidencias, reuniones, minutas y respaldos cifrados.

El repositorio contiene código y ejemplos ficticios. Las cuentas autorizadas, datos institucionales, credenciales de Google y copias privadas se mantienen fuera del repositorio.

## Desarrollo

1. Instalar Git y la versión de Node indicada en `.nvmrc`.
2. Clonar este repositorio y ejecutar `npm ci`.
3. Ejecutar `npm run build` y `npm run dev`.
4. Abrir http://localhost:4173. Este modo usa datos ficticios locales; no modifica producción.

Las pruebas de navegador opcionales requieren Playwright instalado en el entorno (`npm install --no-save --package-lock=false playwright` y `npx playwright install chromium`). Los ensayos usan `DU_TEST_ORIGIN` para seleccionar un servidor local aislado.

## Verificación

`npm test`, `npm run test:auth`, `npm run test:install`, `npm run build`, `npm run test:worker` y `npm run validate`.

GitHub Actions ejecuta estas verificaciones sin credenciales de producción.

## Colaboración y publicación

Cada colaborador trabaja con su propia cuenta de GitHub y de Codex. Antes de cambiar código, actualizar la copia con `git pull --ff-only`. Comprobar los cambios y subirlos a `main`. El proyecto Vercel conectado publica automáticamente esa rama; no hay revisiones manuales obligatorias.

Solo los colaboradores autorizados pueden subir cambios. Que el código sea visible no concede acceso a la app ni a los datos de trabajo. Las contribuciones externas mediante pull requests no deben recibir secretos ni publicarse automáticamente.

## Producción

El proyecto existente de Vercel conserva sus variables privadas, Google OAuth y su base Supabase. El padrón institucional se consulta en la base; los ejemplos del repositorio no reemplazan usuarios existentes.

No ejecutar `bootstrap:team`, `prepare:team` ni SQL de instalación sobre la base existente. `config/team-authorized.json` y `deploy/du-equipo-inicial.sql` son ejemplos ficticios para pruebas y una instalación nueva aislada.

Ver [operación](docs/OPERACION.md) y [colaboración](docs/COLABORACION.md).

Prueba de colaboración desde Codex
