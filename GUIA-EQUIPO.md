# Guía de uso — Plataforma Real Estate (piloto)

**URL:** https://real-estate-plataforma.vercel.app
Funciona en teléfono, tablet y computadora. Los datos son compartidos: todos ven lo mismo en tiempo real.

## 1. Primer acceso de Jean (broker/administrador)

1. Abre la URL y da clic en **Regístrate** (no en "Iniciar sesión" — todavía no existe tu contraseña).
2. Usa el correo **niper987@gmail.com** y **crea una contraseña nueva** (mínimo 6 caracteres; tú la defines en ese momento, no hay una contraseña previa). Lo que está pre-creado es tu perfil de broker, que se vincula y activa solo al registrarte con ese correo.
3. Si el sistema pide confirmar correo, revisa tu bandeja y da clic en el enlace.
4. Al entrar verás el dashboard del broker con las 6 propiedades y 8 leads de ejemplo.

## 2. Registro del equipo

Cada persona:

1. Abre la URL → **Regístrate**.
2. Llena nombre, correo real y contraseña, y **elige el rol que va a probar**: Asesor de equipo, Asesor independiente, Propietario o Cliente/Comprador.
3. Su cuenta queda **Pendiente** hasta que Jean la apruebe.

Jean aprueba en: menú **Solicitudes de acceso** (aparece con un badge rojo cuando hay pendientes).

## 3. Cómo probar cada rol

- **Asesor (equipo o independiente):** al entrar ve su pipeline Kanban. Puede capturar propiedades (Nueva propiedad), dar de alta leads, arrastrarlos entre etapas y usar el botón "Notificar por WhatsApp".
- **Propietario:** ve el avance de SU propiedad. Para vincularla, un asesor debe capturar (o editar) una propiedad poniendo el **correo del propietario** igual al correo con el que esa persona se registró.
- **Cliente/Comprador:** ve su proceso de compra/renta (línea de tiempo, documentos, citas). Para vincularlo, el asesor registra un **lead con el correo del cliente** y lo lleva a etapa Cierre.

## 4. Instalar la app en el teléfono

La plataforma se instala en la pantalla de inicio como cualquier app: ícono propio, pantalla completa, sin barra del navegador. No está en App Store ni Google Play — se instala desde la misma URL.

**Android (Chrome):** abre la URL y toca **Instalar** en el aviso que aparece abajo. Si lo cerraste: menú ⋮ → *Instalar aplicación*.

**iPhone/iPad:** ábrela **en Safari** (Chrome en iOS no puede instalar). Toca **Compartir** → **Añadir a pantalla de inicio** → *Añadir*.

Notas:

- Una vez instalada, el aviso deja de aparecer.
- La app requiere internet para ver datos actualizados; sin conexión abre pero muestra la última pantalla cacheada.
- Las actualizaciones llegan solas al abrirla; no hay que reinstalar.

## 5. Reglas del sistema (ya activas)

- Nadie puede auto-nombrarse broker; solo Jean cambia roles y aprueba cuentas.
- Intake → Validación la hace el asesor; **Validación → Activa solo el broker**.
- Propietarios y clientes solo ven lo suyo; los asesores de equipo solo su propia operación (salvo permiso especial).

## 6. Si el correo de confirmación no llega

Supabase gratuito limita los correos de confirmación (~3 por hora). Si el equipo se registra en bloque y no llegan:
Jean puede desactivar la confirmación en **supabase.com → proyecto habitat-piloto → Authentication → Sign In / Up → desactivar "Confirm email"**. Para un piloto interno es aceptable; reactívala si el sitio se abre a externos.
