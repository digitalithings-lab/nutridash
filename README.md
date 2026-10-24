# NutriPro · Dashboard

Panel web de NutriPro para nutricionistas y administración: Angular 22 + Tailwind 4.

- **Nutricionista:** inicio, pacientes y expediente (antecedentes, historia alimentaria, medicación, laboratorios),
  consultas con indicadores antropométricos, evolución, agenda, plan alimentario paso a paso
  (energía → macros → intercambios → tiempos de comida → menú → revisión y aprobación), alimentos, recetas,
  informes en PDF, soporte y configuración.
- **Administración** (correos en `ADMIN_EMAILS` del backend): resumen, cuentas y suscripciones, planes,
  catálogo de intercambios y alimentos, soporte.

## Desarrollo local

Requiere Node 24.

```bash
npm install
npm start
```

La API por defecto es `https://nutribackend.vercel.app` (`src/app/core/config.ts`). Para usar una API local,
en la consola del navegador: `localStorage.setItem('nutripro.apiUrl', 'http://localhost:3100')`.

## Despliegue en Vercel

Importa el repositorio; `vercel.json` ya define el build (`npm run build`), la carpeta de salida
(`dist/dashboard/browser`) y la redirección de rutas a `index.html`. No necesita variables de entorno.
