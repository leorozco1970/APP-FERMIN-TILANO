# Guía para crear tu App Genérica de Formación Integral

Sigue estos pasos una vez que hayas hecho el **Remix** (Copia) de este proyecto:

## 1. Limpieza de Archivos
En tu nuevo proyecto, puedes borrar las páginas que no necesites para ahorrar espacio y claridad:
- Borra `src/pages/Matriculas.tsx`
- Borra `src/pages/NuevoReporte.tsx`
- Borra `src/pages/PlanillasInstitucionales.tsx`
- ... (cualquier otra que no sea de Formación o Proyectos)

## 2. Aplicar el Diseño Simplificado
He dejado preparados dos archivos clave:
- `src/App_Generic.tsx` -> Debes renombrarlo a `src/App.tsx` (reemplazando el actual).
- `src/components/Layout_Generic.tsx` -> Debes renombrarlo a `src/components/Layout.tsx`.

## 3. Cambiar el Nombre de la Institución
En el archivo `src/components/Layout.tsx` (el nuevo), busca la línea que dice `INSTITUCIÓN EDUCATIVA GENÉRICA` y cámbiala por el nombre que desees o déjala así para que sirva para cualquiera.

## 4. Estilo Visual
Esta versión ya viene configurada para que el color azul sea el predominante, dándole un toque profesional y técnico adecuado para cualquier institución.
