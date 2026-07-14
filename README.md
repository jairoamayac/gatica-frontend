# Gatica Boutique POS — Frontend

PWA estática del punto de venta (diseño estilo Ramp: neutros cálidos, Inter,
bordes finos). No contiene credenciales: todos los datos pasan por el backend
([gatica-backend](https://github.com/jairoamayac/gatica-backend)) con sesión
JWT y roles (CEO / vendedora).

## Configuración del backend

`index.html` apunta por defecto a:

- `http://localhost` en desarrollo → mismo origen (el dev server del backend sirve este frontend)
- producción → `https://gatica-backend.vercel.app`

Si el backend queda en otra URL, defínela antes del script principal:

```html
<script>window.GATICA_API_URL='https://tu-backend.vercel.app'</script>
```

## Desarrollo local

Clona ambos repos como carpetas hermanas y corre el dev server del backend
(`npm run dev` en gatica-backend) — sirve este frontend en `http://localhost:3199`.

## Despliegue en Vercel

Importar este repo → framework **Other**, sin build. En el backend, configura
`FRONTEND_ORIGIN` con la URL de este deploy para restringir CORS.

## Pendiente de marca

`icon-192.png` es un placeholder — reemplazar por el logo real (192×192 PNG).
