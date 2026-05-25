# Diario de amor

Una web para escribir un diario compartido en pareja.

## Ejecutar en local

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

## Render

- Este repo incluye `render.yaml` para crear el servicio web.
- En Render usa estas variables:
	- `MONGODB_URI`: tu conexión de Atlas.
	- `MONGODB_DB`: `love_diary`.
	- `MONGODB_COLLECTION`: `diaries`.
- Comandos del servicio:
	- Build: `npm install`
	- Start: `npm start`
- Si no defines `MONGODB_URI`, la app usa un archivo local en `data/diary.json` para desarrollo.
