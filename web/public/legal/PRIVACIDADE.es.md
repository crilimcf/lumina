# Política de privacidad de Lumina

**Versión:** 16 de agosto de 2026

## 1. Responsable del tratamiento

**Responsable:** Carlos Fernandes

**Correo electrónico:** carlos.fernandes@digibox.pt

**Dirección:** Rua da Cabecinha n.º 23, 5300-802 Rebordainhos, Bragança, Portugal

**NIF:** 227369661

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
- ubicación precisa o aproximada, solo cuando activas una función local;
- token de notificaciones, plataforma, identificador técnico del dispositivo, modelo y versión del sistema operativo;
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

Las bases jurídicas aplicables son la ejecución de las Condiciones y del servicio solicitado, el cumplimiento de obligaciones legales, los intereses legítimos de seguridad, prevención de abusos y mejora del servicio, y el consentimiento cuando se solicite específicamente. El consentimiento puede retirarse en cualquier momento sin afectar al tratamiento ya realizado.

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

En las aplicaciones iOS y Android, el token de sesión se guarda en el Keychain o Keystore protegido del dispositivo. Face ID, la huella y el código del dispositivo los valida el sistema operativo; Lumina solo recibe el resultado y no recibe ni almacena datos biométricos.

## 7. Proveedores

La arquitectura actual puede incluir:

- **Railway** — API;
- **PostgreSQL** — base de datos;
- **Vercel** — aplicación web;
- **Cloudflare R2 / servicio compatible con S3** — fotos y vídeos;
- **Resend** — correos electrónicos transaccionales;
- **Apple Push Notification service (APNs)** y **Google Firebase Cloud Messaging (FCM)** — entrega de notificaciones móviles;
- **Stripe** — solo cuando se activen funciones de pago.

Lumina aplica a sus proveedores las garantías contractuales y los mecanismos de transferencia exigidos por el RGPD, incluidas las decisiones de adecuación o las cláusulas contractuales tipo cuando correspondan.

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

Las solicitudes de acceso, rectificación, supresión, limitación, oposición y portabilidad pueden enviarse al correo electrónico indicado en la sección 1 y se tramitan dentro de los plazos legales. Cuando el tratamiento se base en el consentimiento, este podrá retirarse en cualquier momento. También puede presentarse una reclamación ante la autoridad portuguesa de protección de datos (CNPD).

Lumina no utiliza decisiones exclusivamente automatizadas que produzcan efectos jurídicos o efectos igualmente significativos sobre una persona.

## 10. Seguridad

Lumina aplica medidas técnicas como hash de contraseñas, sesiones revocables, verificación en dos pasos opcional, protección CSRF, limitación de peticiones, validación de cargas, Content-Security-Policy y control de acceso en el servidor.

Ningún sistema es invulnerable; los incidentes relevantes deben evaluarse y tratarse de acuerdo con las obligaciones legales aplicables.

## 11. Cambios

Esta Política puede actualizarse cuando cambien el producto, los proveedores o los requisitos legales. Los cambios relevantes deben comunicarse de forma adecuada.
