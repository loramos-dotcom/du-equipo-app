# Instrucciones para colaborar

- Este es el código activo de DU Equipo. Mantener el diseño y funcionalidades existentes salvo cambios solicitados.
- Usar la identidad propia de GitHub para commits. No sustituir autores ni compartir cuentas o credenciales.
- Los cambios a main se publican automáticamente mediante la integración Git de Vercel.
- Trabajar con datos ficticios en desarrollo y pruebas. No exportar datos de producción a este repositorio público.
- No subir correos reales, padrón institucional, archivos privados, secretos, tokens, capturas con datos ni salidas de diagnóstico sin revisar.
- Mantener secretos exclusivamente en variables privadas del servidor. No agregar secretos a variables VITE_* ni al código del navegador.
- Las cifras, estados y referencias institucionales son datos privados aunque no sean contraseñas. No agregarlos como defaults del cliente ni como respaldos en configuración. Usar los registros autenticados de Supabase. No copiar valores reales a pruebas, documentación o mensajes de diagnóstico.
- No ejecutar scripts de instalación ni migraciones en producción como parte de un despliegue ordinario.
- En el Tablero vinculado, administrar perfiles mediante las funciones autorizadas. No conceder escrituras directas sobre profiles a los clientes ni restaurar GRANT ALL. Conservar las comprobaciones administrativas que rechazan identidades o perfiles ausentes. El procedimiento manual revisado está en deploy/management-security-hardening.sql.
- Mantener el plan gratuito; no activar servicios de pago.
- Ejecutar las verificaciones relevantes antes de subir cambios y confirmar el resultado de la publicación cuando se solicite publicar.
