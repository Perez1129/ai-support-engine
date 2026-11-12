# AI Support Engine

API REST en Node.js 22 y Express para clasificar solicitudes de soporte con dos enfoques: reglas determinísticas y el modelo generativo real de Google Gemini. Ambos motores comparten el contrato de respuesta; el motor generativo nunca simula resultados cuando faltan credenciales.

## Requisitos

- Node.js 22 o superior y npm.
- Una clave de API de Gemini para invocar el modo generativo real.

## Instalación y configuración

```bash
npm install
```

Copia `.env.example` a `.env` y configura al menos:

```dotenv
GEMINI_API_KEY=tu_clave_de_api
GEMINI_MODEL=gemini-3.8-flash
PORT=3000
```

`GEMINI_API_KEY` no es necesaria para el motor tradicional ni para las pruebas automatizadas. Nunca agregues `.env` al repositorio; `.gitignore` ya lo excluye. Si no se configura la clave, las solicitudes generativas responden con `503 AI_CONFIGURATION_ERROR`.

## Ejecutar el servidor

```bash
npm run dev
# o
npm start
```

El servidor escucha en el puerto configurado en `PORT` (3000 por defecto).

## API

`POST /api/analyze`, con `Content-Type: application/json`:

```json
{
  "message": "No puedo iniciar sesión en mi cuenta",
  "mode": "traditional"
}
```

Usa `"mode": "generative"` para solicitar una clasificación real a Gemini mediante la biblioteca `openai` y el endpoint compatible con OpenAI de Google. El mensaje es obligatorio, no puede estar vacío y admite hasta 5000 caracteres. El modo acepta solamente `traditional` o `generative`.

Respuesta de ejemplo:

```json
{
  "category": "ACCESS",
  "priority": "MEDIUM",
  "response": "Hemos identificado un problema relacionado con el acceso.",
  "requiresHumanReview": false,
  "mode": "traditional"
}
```

Las categorías válidas son `ACCESS`, `BUG`, `FEATURE` y `SECURITY`; las prioridades válidas son `LOW`, `MEDIUM`, `HIGH` y `CRITICAL`. Todos los incidentes `SECURITY` requieren revisión humana.

## Pruebas y comparación

```bash
npm test
npm run compare
```

`npm test` usa el ejecutor integrado de Node.js y mocks de Chat Completions para probar el contrato, la validación, los errores, la salida JSON, el endpoint compatible y los intentos de prompt injection; no realiza llamadas a Gemini ni consume API. Los mocks no cuentan como evidencia de una ejecución real del modelo.

Para verificar primero una solicitud individual real, inicia el servidor:

```bash
npm start
```

En otra terminal de PowerShell, envía una única solicitud generativa:

```powershell
$body = @{ message = 'No puedo iniciar sesión en mi cuenta'; mode = 'generative' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/analyze' -Method Post -ContentType 'application/json' -Body $body
```

El servidor lee `GEMINI_API_KEY` y `GEMINI_MODEL` desde `.env`. Esta petición consume una llamada de API. No ejecutes todavía la comparación completa si deseas limitar la verificación a una solicitud: con la clave configurada, `npm run compare` hace 12 llamadas reales.

`npm run compare -- --offline` procesa los casos de `tests/cases.json` sin invocar Gemini, y guarda resultados diferenciados en `evidence/gemini/`. Después de validar manualmente una llamada, `npm run compare` invoca Gemini para los 12 casos. La comparación solo calcula exactitud generativa si todas las respuestas reales son válidas; si Gemini no está configurado o falla alguna llamada, informa `N/D` en vez de simular resultados.

La exactitud compara categoría y prioridad con las expectativas predefinidas. `validJson` indica el cumplimiento del contrato de salida, independiente de si la clasificación acertó.

## Evidencias

- `evidence/traditional/results.json`: salida y exactitud del motor de reglas.
- `evidence/generative/results.json` y `evidence/comparison/`: evidencias previas, conservadas sin sobrescribir.
- `evidence/gemini/generative-results.json` y `comparison-results.json` / `comparison-results.md`: evidencias nuevas diferenciadas para Gemini. El modo offline indica expresamente que no hubo una llamada real.
- Las pruebas con mocks son evidencia automatizada de validación técnica, no de desempeño real de Gemini.

## Conclusión técnica

El motor tradicional es reproducible, auditable y no depende de servicios externos, aunque las reglas pueden dejar fuera variaciones del lenguaje y solicitudes ambiguas. El motor generativo usa Gemini mediante Chat Completions, solicita JSON y valida estrictamente la respuesta antes de devolverla; además, exige revisión humana para incidentes de seguridad. Las pruebas con mocks verifican el contrato y el manejo de errores, pero no miden la calidad real del modelo. La comparación distingue las llamadas reales y solo reporta exactitud si todos los casos se completan; sin llamadas reales completas, informa `N/D` en lugar de fabricar resultados.