# Intercambio Navideño 2026 (`exchange-client`)

Aplicación web en Angular 17 para organizar el **Intercambio Navideño 2026** (registro, inicio de sesión, lista de regalos, ruleta navideña SVG, panel administrativo con gestión de roles, CMS de textos/banners y reasignación manual de amigo secreto).

El backend independiente vive en el repositorio hermano `../exchange-service` (**Node.js + Express + SQLite + Arquitectura Hexagonal**, listo para desplegarse en **Fly.io**).

## Requisitos

- Node.js 22+
- npm 10+

## Ejecución en desarrollo

1. Inicia el backend en `../exchange-service` (puerto `3000`):

```bash
cd ../exchange-service
npm install
npm start
```

2. En otra terminal, inicia el cliente Angular (el proxy `proxy.conf.json` redirige `/api` a `http://localhost:3000`):

```bash
cd ../exchange-client
npm start
```

3. Abre `http://localhost:4200/` en tu equipo o `http://<IP-DE-TU-EQUIPO>:4200/` desde cualquier dispositivo en tu red local.

## Despliegue (GitHub Pages + Fly.io)

1. Despliega `../exchange-service` en **Fly.io** siguiendo la guía en `../exchange-service/README.md`.
2. En este repositorio (`exchange-client`) ve a **GitHub → Settings → Secrets and variables → Actions → Variables** y configura:
   - `API_URL`: URL pública de tu servicio en Fly.io terminada en `/api` (ej. `https://exchange-service-2026.fly.dev/api`).
   - `BASE_HREF` (opcional): por defecto `/<nombre-del-repo>/`; usa `/` si usas un dominio personalizado.
3. Ejecuta el workflow `.github/workflows/deploy-gh-pages.yml` (push a `main` o **Actions → Run workflow**).

## Pruebas y compilación

```bash
# Validar tipos y specs Angular
npx tsc -p tsconfig.spec.json --noEmit

# Pruebas unitarias Karma/Jasmine
npm test

# Compilación de producción
npm run build
```
