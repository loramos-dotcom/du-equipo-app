# Operación

La aplicación institucional usa el servidor de Vercel y Supabase. Las variables privadas incluyen APP_MODE=team, APP_ORIGIN, DU_WORKSPACE_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY. El servidor verifica identidad Google y padrón activo en cada acceso.

Calendar mantiene conexiones personales cifradas. Drive guarda respaldos cifrados mediante la cuenta configurada en DU_BACKUP_OWNER_EMAIL. Las credenciales OAuth y claves de cifrado permanecen en el servidor. La clave privada de recuperación se conserva por separado y nunca se despliega.

El ingreso DU exige una sesión OAuth verificada, identidad Google institucional y pertenencia al padrón activo. Coordinación puede marcar `Suspender acceso` al editar una persona en Equipo: el servidor bloquea sus siguientes solicitudes aun con una sesión previa, sin exigir reasignar antes sus tareas. La suspensión se puede revertir con motivo y se registra en el historial. No puede dejar al equipo sin otra Coordinación habilitada. Este bloqueo corresponde a DU; no revoca por sí solo accesos institucionales al Tablero, GitHub, Google o Vercel.

Calendar comparte con el equipo los eventos no privados de los calendarios elegidos expresamente, incluidas las citas sin invitados. Los eventos privados/confidenciales quedan excluidos y la vista inicial sigue siendo individual. La sincronización reserva cada conexión con control de revisión y respeta cinco minutos entre intentos, también al forzar o fallar una actualización; retirar calendarios elimina inmediatamente su caché compartida.

El cron diario se declara en vercel.json. Las APIs de datos, Calendar, respaldos y trabajos requieren autenticación o el secreto de cron correspondiente.

Las cifras educativas y los estados de obras se leen de los registros existentes de Supabase mediante el ingreso institucional y los permisos del Tablero. No hay cifras ni semáforos reales de respaldo en el cliente ni en la configuración del servidor. Ante una ausencia, la app muestra un estado neutro en lugar de inventar valores. La edición conserva los registros originales y su sincronización entre ambas apps.

GET /api/gestion/security-check permite a un integrante autenticado comprobar la presencia de datos almacenados. Devuelve únicamente cantidades, booleanos y la fuente de datos; no expone valores, nombres, identificadores ni credenciales. La comprobación de presencia no certifica por sí sola la configuración completa de RLS.

Los perfiles del Tablero vinculado se crean y administran mediante sus funciones autorizadas; los clientes no necesitan escrituras directas sobre esa tabla. El endurecimiento de esos permisos y de las dos validaciones administrativas se aplicó manualmente y se verificó mediante catálogos y una consulta anónima sin registros. El procedimiento revisado se conserva en `deploy/management-security-hardening.sql`. No se ejecuta al compilar o desplegar DU y no corresponde a la base SQLite/D1 de desarrollo ni a la base propia de DU.

Ese procedimiento conserva SELECT, RLS, propietarios y permisos de las funciones administrativas. Solo acepta los cuerpos originales o endurecidos que fueron revisados; ante otro esquema o definición, aborta. No quitar sus precondiciones para forzarlo ni volver a aplicar definiciones históricas que restablezcan permisos amplios o validaciones inseguras ante NULL. Antes de una operación futura, revisar el destino y la autorización y ensayar cualquier cambio en aislamiento.

La aplicación manual no registra automáticamente una migración en Supabase. Antes de reconciliar o publicar migraciones del Tablero, contrastar su historial real y generar las nuevas mediante la herramienta oficial; no inventar versiones ni marcar operaciones como aplicadas sin comprobarlas. Un privilegio SELECT de anon no demuestra lectura pública: comprobar también RLS y consultas reales sin sesión. Esta corrección de perfiles no certifica todos los objetos, lectores ni cambios históricos del origen.

## Lecturas institucionales del Tablero

En `qa_entries` y `source_documents` se retiró la lectura anónima y se agregó una policy SELECT restrictiva institucional, conservando las policies anteriores y la lectura de cuentas BUE. `private.apply_access_grant(uuid,text)` dejó de ser ejecutable por clientes; las altas y la administración siguen mediante sus funciones autorizadas y propietarios.

El procedimiento manual se conserva en `deploy/management-read-access-hardening.sql`, con el flag de aprobación comentado. Revisar destino, autorización y precondiciones antes de usarlo; corresponde al origen del Tablero, no a la base propia de DU ni al desarrollo local. No se ejecuta al compilar o desplegar. Si otra integración dependía de la lectura anónima de esas dos tablas, deberá adaptarse al acceso institucional: revisar esos consumidores antes de alterar permisos o quitar sus guards. El procedimiento no borra contenido y no registra automáticamente una migración.

Nunca guardar los valores institucionales en el código, tests, documentación, HTML, JSON estáticos, variables públicas ni logs de compilación. Usar datos ficticios en las pruebas. Un cambio del código actual no limpia automáticamente el historial ni las publicaciones anteriores.

Un cambio de repositorio no exige reinstalar ni migrar la base. Confirmar proyecto, cuenta, rama y dominio antes de modificar un despliegue. Para diagnosticar, usar metadatos sin valores de secretos.

Desarrollo: npm run build y npm run dev usan una base local de prueba. Las instalaciones nuevas requieren un padrón privado verificado; el padrón versionado contiene exclusivamente ejemplos.

Para comprobar una publicación real, ejecutar `node tests/live-access.mjs` con `DU_LIVE_ORIGIN` (dominio de la app) y `DU_LIVE_AUTH_ORIGIN` (URL pública de su proyecto Supabase). El ensayo verifica el destino exacto de Google, PKCE y las restricciones de acceso sin iniciar sesión ni modificar registros.
