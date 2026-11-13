# Operación

La aplicación institucional usa el servidor de Vercel y Supabase. Las variables privadas incluyen APP_MODE=team, APP_ORIGIN, DU_WORKSPACE_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY. El servidor verifica identidad Google y padrón activo en cada acceso.

Calendar mantiene conexiones personales cifradas. Drive guarda respaldos cifrados mediante la cuenta configurada en DU_BACKUP_OWNER_EMAIL. Las credenciales OAuth y claves de cifrado permanecen en el servidor. La clave privada de recuperación se conserva por separado y nunca se despliega.

El cron diario se declara en vercel.json. Las APIs de datos, Calendar, respaldos y trabajos requieren autenticación o el secreto de cron correspondiente.

Un cambio de repositorio no exige reinstalar ni migrar la base. Confirmar proyecto, cuenta, rama y dominio antes de modificar un despliegue. Para diagnosticar, usar metadatos sin valores de secretos.

Desarrollo: npm run build y npm run dev usan una base local de prueba. Las instalaciones nuevas requieren un padrón privado verificado; el padrón versionado contiene exclusivamente ejemplos.

Para comprobar una publicación real, ejecutar `node tests/live-access.mjs` con `DU_LIVE_ORIGIN` (dominio de la app) y `DU_LIVE_AUTH_ORIGIN` (URL pública de su proyecto Supabase). El ensayo verifica el destino exacto de Google, PKCE y las restricciones de acceso sin iniciar sesión ni modificar registros.
