# Intercambio Navideño 2026 (`exchange-client`)

Aplicación web en Angular 17 para organizar el **Intercambio Navideño 2026** (registro, inicio de sesión, lista de regalos, ruleta de amigo secreto y panel administrativo) usando un **servidor local Node.js con base de datos SQLite** (`node:sqlite`) en sustitución de Supabase.

## Requisitos

- Node.js 22.5+ (probado con Node.js 26, usa el módulo nativo `node:sqlite` sin dependencias extra).
- npm 10+

## Ejecución en desarrollo (multi-dispositivo en red local)

1. Inicia el servidor local SQLite (puerto `3000`, crea automáticamente `server/data/exchange-2026.sqlite`):

```bash
npm run server
```

2. En otra terminal, inicia el cliente Angular (el proxy `proxy.conf.json` redirige `/api` al servidor local):

```bash
npm start
```

3. Abre `http://localhost:4200/` en tu equipo o `http://<IP-DE-TU-EQUIPO>:4200/` desde cualquier dispositivo conectado a la misma red local.

## Modo producción en un solo servidor

Puedes compilar Angular y servir tanto la aplicación web como la API SQLite desde el mismo servidor en el puerto `3000`:

```bash
npm run build
npm run server
```

Luego accede desde cualquier dispositivo en tu red local a `http://<IP-DE-TU-EQUIPO>:3000/`.

## Datos precargados (Intercambio 2026)

Al arrancar por primera vez, SQLite crea las tablas (`users`, `sessions`, `participants`, `gift`, `exchanges`) e inserta:

- **Evento 2026**:
  - Convocatoria / Sorteo: `12 de diciembre 2026` · `18:00 hrs`
  - Carga de regalos: `10 de diciembre 2026`
  - Día del intercambio: `24 de diciembre 2026`
  - Presupuesto sugerido: `$500 MXN`
- **Administrador por defecto** (personalizable con variables de entorno `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`):
  - Correo: `admin@intercambio2026.local`
  - Contraseña: `Admin2026!`

## Seguridad, cifrado en reposo y correos SMTP

- **Cifrado en SQLite** (`server/crypto.js`):
  - Contraseñas: hash irreversible `scrypt` + salt aleatorio de 16 bytes (`timingSafeEqual`).
  - Tokens de sesión y de confirmación: almacenados únicamente como hash **SHA-256**.
  - Correos electrónicos, nombres de usuario/participantes y asignaciones de amigo secreto (`friend_id_enc`): cifrados con **AES-256-GCM** (más índice ciego **HMAC-SHA256** `email_hash` para búsqueda).
  - La clave se lee desde `DATA_ENCRYPTION_KEY` en `.env` (o se genera automáticamente en `server/data/.encryption.key` con permisos `0600`, ignorado por Git).
- **Feature flag de correos (`EMAIL_ENABLED` / `email_notifications_enabled`, por defecto `false`)**:
  - Controla si la app funciona **sin envío de correos** (valor por defecto: registro con acceso inmediato a `/intercambio` y sorteo sin correos) o **con envío de correos** (confirmación de registro + notificaciones de amigo secreto).
  - Se puede activar por variable de entorno (`EMAIL_ENABLED=true` en `.env`) o activar/desactivar en caliente desde **Panel Admin → Configuración de textos y banners → Feature flags**.
- **Correos de confirmación y notificación de amigo secreto** (`server/mailer.js`):
  - Copia `.env.example` a `.env` y configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` para enviar correos reales vía SMTP (TLS/STARTTLS).
  - Si `SMTP_HOST` está vacío, el servidor entra en **modo local**: guarda los correos HTML en `server/data/outbox/` y ofrece un enlace de confirmación local para pruebas.

## Pruebas

- Pruebas del servidor local y SQLite:

```bash
npm run test:server
```

- Pruebas unitarias de Angular:

```bash
npm test
```

- Compilación de producción:

```bash
npm run build
```
