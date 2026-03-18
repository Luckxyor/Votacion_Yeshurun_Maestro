# Monitor de Votacion para Profesores

Aplicacion web estatica para visualizar resultados de votacion en tiempo real usando Supabase.

## 1) Configurar conexion

Edita `config.js` y completa:

- `supabaseUrl`: URL del proyecto Supabase.
- `supabaseAnonKey`: clave anon publica.
- `tables`: nombres reales de tus tablas en Supabase.

Ejemplo:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJ...",
  tables: {
    propuestas: "Propuestas",
    votacion: "Votacion",
    sala: "Sala"
  }
};
```

## 2) Requisitos en Supabase

- Deben existir las tablas de propuestas, votacion y sala.
- Realtime debe estar habilitado para la tabla de votacion.
- Politicas RLS deben permitir `SELECT` para rol anon en tablas consultadas.

## 3) Ejecutar local

Como es estatico, puedes abrir `index.html` con cualquier servidor web simple.

Opciones:

- `npx serve .`
- `npx http-server .`

## 4) Despliegue

### GitHub Pages

1. Sube estos archivos al repositorio.
2. En GitHub: Settings > Pages > Source = branch principal (root).
3. Asegura que `config.js` tenga tu URL y key anon validas.

### Vercel

1. Importa el repositorio en Vercel.
2. Framework Preset: `Other`.
3. Deploy (no necesita build command).

## 5) Comportamiento en tiempo real

- La pagina consulta propuestas + votos iniciales.
- Se suscribe a cambios `INSERT/UPDATE/DELETE` en `Votacion`.
- Ante cada cambio, vuelve a consultar y repinta resultados automaticamente.
