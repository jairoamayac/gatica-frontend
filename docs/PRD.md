# PRD & Handoff técnico — Gatica Boutique POS

> **Para:** desarrollador que continúa el proyecto.
> **Estado:** funcional en producción, en uso contra datos reales. Faltan mejoras (ver §10).
> **Fecha:** julio 2026 · **Versión:** v21

---

## 1. Qué es

POS (punto de venta) e inventario para una tienda de calzado femenino en Venezuela.
PWA instalable, sincronización en tiempo real, dos roles (dueña / vendedora).
Reemplaza el control en cuaderno/Excel: ventas, apartados con abonos, inventario
por talla, etiquetas con código de barras, reportes de caja y ganancia.

**Usuarios:**
- **CEO / dueña** (Isa): ve todo — costos, ganancia, inventario, etiquetas, borra transacciones.
- **Vendedora**: vende, aparta, abona, gestiona clientas y descuenta stock. NO ve costos/ganancia, NO borra, NO cambia precios.

---

## 2. Arquitectura (dos repos separados)

```
┌──────────────────────┐      HTTPS + JWT      ┌───────────────────────┐      supabase-js      ┌──────────────┐
│  gatica-frontend     │ ───── POST /api/* ──► │  gatica-backend       │ ───── select/…  ────► │  Supabase    │
│  PWA React (Vercel)  │ ◄──── JSON tipado ─── │  Serverless (Vercel)  │ ◄──── data/error ──── │  PostgreSQL  │
└──────────────────────┘                       └───────────────────────┘                       └──────────────┘
        │  WebSocket realtime (postgres_changes) directo a Supabase, con credenciales que entrega /api/config │
        └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend** (`github.com/jairoamayac/gatica-frontend`): Vite + React 18 + TypeScript + Tailwind + componentes shadcn hand-rolled. Sin credenciales de BD. Todo dato pasa por el backend.
- **Backend** (`github.com/jairoamayac/gatica-backend`): funciones serverless de Vercel (Node ESM). Autentica (JWT propio), aplica permisos por rol, y es el **único** que habla con Supabase para datos.
- **Base de datos**: proyecto Supabase `aglsychxednhgdczpsks` — **es de otra cuenta (del cliente), NO se puede modificar el esquema**. Regla dura del proyecto: no crear/renombrar/borrar tablas ni columnas existentes, no tocar la constraint `inventario_sku_key`, no desactivar Realtime, no rotar la clave.

**Por qué backend intermedio:** la clave publicable de Supabase salió del HTML (antes estaba hardcodeada) y el rol se valida en servidor, no solo en UI. La app original era un solo `index.html` que hablaba directo con Supabase (queda como referencia en el repo `gatica-pos`, monorepo histórico).

---

## 3. Stack y estructura

### Frontend
```
index.html               viewport bloqueado (app-like), fuentes
vite.config.ts           alias @ → src
tailwind.config.js       tema (negro/blanco estilo Zara), color navy=#111
vercel.json              build Vite → dist + SPA rewrite
src/
  main.tsx               monta React, registra service worker
  App.tsx                router por estado (5 vistas) + InstallPrompt
  index.css              tokens de tema (HSL vars), reglas app-like
  store.tsx              Context global: sesión, datos, realtime, recargas
  lib/
    api.ts               fetch tipado a /api/*, query-builder DbOp, sesión en localStorage
    types.ts             InvItem, Venta, Clienta, Abono, MetodoPago, Sesion…
    utils.ts             SKU, normalización, fechas Caracas, abonos, buscador, edad
    print.ts             etiquetas Zebra (CODE128, ventana de impresión)
    excel.ts             import/export xlsx
    notaEntrega.ts       comprobante imprimible media carta
  components/
    Layout.tsx           sidebar desktop / bottom-nav móvil, header con estado
    Thumb.tsx            miniatura de foto con zoom
    InstallPrompt.tsx    banner instalar PWA (beforeinstallprompt + iOS help)
    ui/                  button, card, input, label, badge, select, dialog (shadcn)
  views/
    Login.tsx  Ventas.tsx  Inventario.tsx  Clientas.tsx  Apartados.tsx  Reportes.tsx
```

### Backend
```
api/
  login.js     POST {usuario,password} → {token,rol,nombre}
  db.js        POST operación declarativa (ver §6) — valida rol + código admin
  config.js    POST (autenticado) → {sbUrl, sbKey} para el WebSocket realtime
lib/
  auth.js      firmar/verificar JWT (HMAC-SHA256, 12h), autenticar, esCodigoAdmin
  reglas.js    matriz rol × tabla × acción, filtra columna costo a vendedora
  config.js    SB_URL / SB_KEY (env con defaults del proyecto actual)
  http.js      CORS (FRONTEND_ORIGIN)
dev/server.js  emula Vercel en local: monta api/* y sirve ../gatica-frontend
```

---

## 4. Modelo de datos (Supabase — tal como está, no modificable)

```
inventario  1 fila por TALLA (variante)
  id bigint PK        → va codificado en el código de barras (6 dígitos)
  sku text UNIQUE     → MARCA-MODELO-COLOR-TALLA (constraint inventario_sku_key)
  marca, marca_cod, modelo, modelo_cod, color, color_cod, talla, nombre  text
  costo, precio numeric · stock, stock_min int · foto text (legacy, se vacía) · creado timestamptz

ventas
  id bigint PK · fecha timestamptz (America/Caracas) · tipo 'venta'|'apartado'
  estado 'pagado'|'activo'|'cancelado'
  items  jsonb  [{sku, nombre, precio, cantidad}]
  cliente jsonb {id, nombre} (desnormalizado)
  abonos jsonb  [{fecha, monto, metodo, moneda, tasa?, montoBs?}]   ← ampliado en esta versión
  abono, saldo, total numeric

clientas
  id bigint PK · nombre, telefono, cedula, nota text
  cumple date  ← OPCIONAL: solo si se corre el ALTER (ver §9). El código lo detecta y degrada solo.

fotos
  modelo_key text PK  → norm(marca)|norm(modelo)|norm(color)
  foto text           → JPEG base64 comprimido (una por modelo, no por talla)
```

**Notas de diseño heredadas (respetar):**
- El código de barras codifica el **id** (corto, estable), no el SKU → cambiar el SKU no invalida etiquetas ya pegadas.
- Fotos: 1 por modelo en tabla `fotos`; el `select` de inventario NO trae la foto (recarga rápida). Se comprimen a 480px / JPEG 0.62 al registrar.
- Todo timestamp en `America/Caracas` (-04:00): `toISOString()` en UTC caía en el día equivocado de noche.
- `abonos` es la fuente de verdad de la caja: cada pago cuenta en el día en que se recibió. `getAbonos()` en utils.ts mantiene compatibilidad con ventas viejas sin el array.

---

## 5. Autenticación y roles

- **Usuarios en variables de entorno** (no hay tabla de usuarios — la BD no se toca). Login → JWT HMAC-SHA256 de 12h guardado en localStorage.
- `lib/reglas.js` es la matriz de permisos. Vendedora: `inventario` solo lectura + update de columna `stock` únicamente; `ventas`/`clientas` crear+editar pero no borrar; `fotos` solo lectura. La columna `costo` se elimina de la respuesta para vendedora en `filtrarRespuesta()`.
- **Código de administradora**: borrar una venta (`delete` sobre `ventas`) exige `adminCode` (= `CEO_PASSWORD`) validado en servidor, incluso con sesión de CEO. Ver `esCodigoAdmin()`.

---

## 6. Contrato de la API

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /api/login` | `{usuario, password}` | `{token, rol, nombre}` · 401 |
| `POST /api/config` | — (Bearer) | `{sbUrl, sbKey}` · 401 |
| `POST /api/db` | operación declarativa (abajo) | `{data, error}` estilo supabase-js · 401/403 |

**Operación declarativa** (`DbOp` en `lib/api.ts`):
```ts
{
  table: 'inventario'|'ventas'|'clientas'|'fotos',
  action: 'select'|'insert'|'update'|'delete'|'upsert',
  values?: unknown,                 // insert/update/upsert
  select?: string,                  // select
  filters?: {type:'eq'|'in'|'gt', column, value}[],
  order?: {column, ascending?},
  single?: boolean,
  returning?: boolean,              // insert con .select()
  adminCode?: string,               // requerido para delete en ventas
}
```
El frontend nunca arma SQL: describe la operación y el backend la traduce a supabase-js. Si se necesita un filtro nuevo (ej. `lt`, `ilike`), agregarlo en `api/db.js` (whitelist) para no abrir inyección.

---

## 7. Funcionalidades implementadas

- **Ventas / Apartados**: carrito con foto, búsqueda, escáner. Método de pago (Efectivo $/Bs, Pago Móvil, Punto, Zelle, Transferencia, Otro), pago en Bs con tasa (se recuerda en localStorage) y conversión a USD. Deuda automática si el pago es parcial (queda `estado:'activo'`). Al confirmar ofrece imprimir nota de entrega.
- **Escáner**: `html5-qrcode`, solo CODE_128, resuelve por id → fallback SKU. iOS usa polyfill (barcode-detector) — cargar el polyfill si se nota lento en Safari (en la app original venía por CDN; en React conviene el paquete `barcode-detector`).
- **Inventario**: agrupado por modelo (marca+modelo+color), tallas expandibles, alta individual / corrida de tallas, editar grupo (aplica a todas las tallas), importar/exportar Excel, etiquetas Zebra (30×25mm, individual y por lote). Fotos ya entran optimizadas (se eliminó el botón manual "optimizar fotos").
- **Clientas**: alta/edición, ficha con historial de compras, pares, total pagado, deuda y pendientes con antigüedad. Campo opcional fecha de nacimiento.
- **Apartados**: apartados y ventas a crédito juntos, abonos con método de pago, barra de progreso, antigüedad en días.
- **Reportes**: filtros por período (Hoy/Ayer/7d/Mes/Mes pasado/Todo/Rango), recibido en caja, transacciones, pares, ticket promedio, ganancia (CEO), deudas pendientes con semáforo por antigüedad, caja desglosada por método de pago, transacciones con Nº y saldo, ventas por modelo, top modelos/colores, analítica de clientas (top compradoras, inactivas +60d, edades, cumpleañeras).
- **Notas de entrega**: comprobante imprimible media carta con Nº 000123, productos, pagos y saldo. Nº visible en todas las listas.
- **Realtime**: 4 canales `postgres_changes`; cambios en un dispositivo se reflejan en los demás.
- **PWA / app nativa**: instalable, sin zoom/pellizco, sin rebote de scroll, banner de instalación (Android nativo + instrucciones iOS).
- **Buscador multi-palabra**: `coincide()` en utils.ts — palabras en cualquier orden, cada una debe aparecer en algún campo; los números cuentan como talla exacta ("carey 8", "8.5 altos").

---

## 8. Correr en local

Clonar ambos repos como carpetas hermanas:
```
gatica-backend/   gatica-frontend/
```
**Backend:**
```bash
cd gatica-backend
cp .env.example .env      # ya trae defaults del proyecto real
npm install
npm run dev               # http://localhost:3199  (monta /api y sirve el frontend build si existe)
```
**Frontend (dev con hot reload):**
```bash
cd gatica-frontend
npm install
npm run dev               # http://localhost:5173 ; llama a la API en :3199
```
Usuarios de prueba (defaults): `isa` / `gatica-ceo` (CEO), `vendedora` / `gatica-venta`.

> ⚠️ Es la BD real del cliente. En local, hacer solo lecturas al probar; cualquier venta/edición/borrado se refleja de verdad. Idealmente crear un proyecto Supabase de pruebas y apuntar `SB_URL`/`SB_KEY` ahí para desarrollar.

---

## 9. Despliegue (Vercel) y variables de entorno

Dos proyectos Vercel, framework **Other**:

**gatica-backend** (`Settings → Environment Variables`):
```
SB_URL, SB_KEY               # conexión Supabase (defaults ya en lib/config.js)
JWT_SECRET                   # cadena larga aleatoria (cambiar en prod)
CEO_USER, CEO_NAME, CEO_PASSWORD
VENDEDORA_USER, VENDEDORA_NAME, VENDEDORA_PASSWORD
FRONTEND_ORIGIN              # https://<frontend>.vercel.app  (cierra el CORS)
```
**gatica-frontend:**
```
VITE_API_URL                 # https://<backend>.vercel.app  (si no, usa gatica-backend.vercel.app por defecto)
```
Push a `main` = redeploy automático en ambos.

**SQL opcional (fecha de nacimiento de clientas)** — aditivo, no toca datos:
```sql
alter table clientas add column if not exists cumple date;
```
Sin esto, el campo se guarda-degrada solo y la analítica de edades queda oculta.

---

## 10. Pendientes / roadmap (dónde ayudar)

**Prioridad alta**
- **Seguridad de fondo (RLS)**: hoy las políticas de Supabase son permisivas (`using true`). El login+backend protege el uso normal, pero quien extraiga la clave publicable de una sesión puede pegarle directo a la BD. Requiere reescribir RLS por rol autenticado — **necesita acceso al proyecto Supabase del cliente** (no lo tenemos aún).
- **Devoluciones/cambios como flujo formal**: hoy se elimina la venta y vuelve el stock. Falta un flujo de devolución con trazabilidad.

**Prioridad media**
- **Cierre de caja por turno**: monto de apertura, arqueo, cuadre por método al cerrar.
- **Descuentos / promociones** por venta o por ítem.
- **Historial de movimientos de inventario** (quién ajustó stock, cuándo, por qué).
- **Recibo por WhatsApp** (link `wa.me` con la nota de entrega).
- **Code-splitting**: el bundle es ~1.3MB (xlsx + html5-qrcode + jsbarcode pesan). Lazy-load de Reportes/escáner/Excel con `React.lazy` + dynamic import baja el arranque.

**Prioridad baja / detalles**
- Iconos PWA son placeholders (cuadro negro) — reemplazar por el logo real (192 y 512).
- Paginación de inventario si supera ~1000 variantes.
- `barcode-detector` como dependencia (hoy iOS depende del polyfill de la app vieja) para escaneo consistente en Safari.
- Tests: no hay. Al menos unit de `utils.ts` (SKU, abonos, buscador, fechas) que es lógica pura y crítica.

**Ideas de POS que aún no están** (investigadas, para cotizar como fases): multi-sucursal, facturación fiscal/SENIAT, pasarela de pago en línea, lector de código de barras USB (además de cámara), gestión de gastos/egresos para P&L real.

---

## 11. Convenciones y gotchas

- **No tocar el esquema de Supabase.** Toda info nueva de una venta va dentro del jsonb `abonos`/`items` o `cliente`. Así se agregó método de pago/moneda sin migración.
- Fechas: usar siempre los helpers de `utils.ts` (`ahoraISO`, `hoyVz`, `fmtFecha`…), nunca `Date` cruda para lógica de caja.
- Agrupación y filtros: siempre sobre `norm()` (sin acentos, minúsculas, trim). Un espacio invisible parte grupos.
- El frontend asume el formato de respuesta de supabase-js (`{data, error}`) porque el query-builder `DbOp` lo emula — mantener esa forma si se toca `api/db.js`.
- Realtime necesita `/api/config` tras el login; si falla, la app funciona igual pero sin sincronización automática (hay recargas manuales tras cada acción).
- El service worker (`public/sw.js`) es red-primero con caché de respaldo; los assets de Vite llevan hash, así que un redeploy no queda cacheado viejo.

---

*Repos:* `gatica-frontend`, `gatica-backend` (GitHub / jairoamayac). *Docs de arquitectura C4 detallada:* `gatica-backend/docs/arquitectura-c4.md`.
