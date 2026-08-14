# Política de privacidad de Lumina

**Versión:** 9 de agosto de 2026

> Este texto es una base técnica del producto y debe ser revisado por asesoramiento jurídico antes de un lanzamiento público amplio.

## 1. Responsable del tratamiento

**Responsable:** `[nombre/empresa por completar]`

**Correo electrónico:** `[correo electrónico por completar]`

**Dirección/NIF:** `[por completar]`

Estos campos deben completarse antes del lanzamiento público.

## 2. Datos tratados

Según las funciones utilizadas, Lumina puede tratar:

- identificador interno de la cuenta;
- nombre, nombre de usuario, correo electrónico y fecha de nacimiento;
- biografía, avatar e intereses añadidos al perfil;
- configuración de perfil público o privado;
- relaciones de seguimiento, solicitudes de seguimiento y bloqueos;
- publicaciones, comentarios, reacciones y republicaciones;
- Momentos y sus visualizaciones;
- Salas creadas o a las que se ha unido, invitaciones y mensajes de Sala;
- mensajes privados, estado de lectura/apertura y llamadas;
- fotos y vídeos cargados;
- denuncias y decisiones de moderación;
- datos técnicos de seguridad como sesiones, user-agent, IP e intentos de inicio de sesión;
- solicitudes de recuperación de contraseña, verificación en dos pasos y códigos de recuperación en formato protegido;
- datos necesarios para pagos cuando una función de pago esté realmente activada.

## 3. Para qué usamos los datos

Los datos se tratan para:

- crear y proteger la cuenta;
- mostrar el Feed, los perfiles y las conexiones sociales;
- gestionar perfiles privados y solicitudes de seguimiento;
- permitir Salas, Mensajes, llamadas, Momentos y Radar;
- almacenar y servir contenido multimedia;
- prevenir abusos, spam y accesos no autorizados;
- moderar contenido denunciado;
- ejecutar solicitudes de exportación, corrección y eliminación;
- operar, diagnosticar y mejorar el servicio.

La base jurídica aplicable depende de la finalidad concreta y debe confirmarse en el texto jurídico final antes del lanzamiento público.

## 4. Visibilidad

- Un perfil público puede ser consultado por otras personas autenticadas en Lumina.
- Un perfil privado solo muestra sus publicaciones después de aceptar una solicitud de seguimiento.
- El Feed social muestra a la propia persona y a los autores que sigue.
- Las Salas públicas pueden ser descubiertas por usuarios de Lumina; las Salas privadas funcionan por invitación.
- Un bloqueo corta las relaciones y la visibilidad entre las dos cuentas.
- Los Momentos siguen la misma relación social que el Feed y caducan después de 24 horas.

## 5. Mensajes y contenido efímero

Los mensajes privados y los mensajes de Sala se almacenan para prestar el servicio.

Los mensajes con temporizador o de una sola visualización y los Momentos se eliminan del contenido activo según las reglas mostradas en el producto. Lumina no puede impedir que otra persona haga una captura de pantalla, grabación o copia antes de que caduquen.

## 6. Sesión y almacenamiento local

La sesión principal del navegador utiliza una cookie `HttpOnly`, `Secure`, `SameSite=Lax` y `Path=/`. El JavaScript de la aplicación no lee esa cookie.

El valor CSRF necesario para solicitudes que cambian el estado lo devuelve la API y se mantiene en memoria por la aplicación. La PWA también puede utilizar el almacenamiento local del navegador para preferencias técnicas no sensibles.

## 7. Proveedores

La arquitectura actual puede incluir:

- **Railway** — API;
- **PostgreSQL** — base de datos;
- **Vercel** — aplicación web;
- **Cloudflare R2 / servicio compatible con S3** — fotos y vídeos;
- **Resend** — correos electrónicos transaccionales;
- **Stripe** — solo cuando se activen funciones de pago.

Antes del lanzamiento público deben confirmarse los contratos, regiones de tratamiento, subencargados y mecanismos de transferencia aplicables.

## 8. Conservación

- Los Momentos caducan después de 24 horas.
- Los mensajes temporales se limpian después de abrirse o caducar según el modo elegido.
- Los tokens de recuperación caducados y los intentos antiguos de inicio de sesión se limpian periódicamente.
- Las solicitudes de eliminación de cuenta tienen un plazo de 30 días antes de su ejecución, salvo obligaciones legales en contrario.
- Las cargas abandonadas o huérfanas se limpian mediante tareas de la API.

## 9. Derechos

La aplicación incluye mecanismos técnicos para:

- corregir datos del perfil;
- exportar datos de la cuenta;
- solicitar la eliminación;
- cancelar la solicitud durante el plazo previsto;
- gestionar privacidad, seguimientos, bloqueos y sesiones.

Para ejercer otros derechos previstos por la legislación aplicable, debe existir un canal de contacto completado en la sección 1.

## 10. Seguridad

Lumina aplica medidas técnicas como hash de contraseñas, sesiones revocables, verificación en dos pasos opcional, protección CSRF, limitación de peticiones, validación de cargas, Content-Security-Policy y control de acceso en el servidor.

Ningún sistema es invulnerable; los incidentes relevantes deben evaluarse y tratarse de acuerdo con las obligaciones legales aplicables.

## 11. Cambios

Esta Política puede actualizarse cuando cambien el producto, los proveedores o los requisitos legales. Los cambios relevantes deben comunicarse de forma adecuada.
