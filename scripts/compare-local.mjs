import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import localEngine from '../src/services/local.engine.js';

const { modelName } = localEngine;
const modes = ['traditional', 'generative'];
function validResult(value, mode) {
  return value && Object.keys(value).length === 5 && value.mode === mode
    && ['ACCESS', 'BUG', 'FEATURE', 'SECURITY'].includes(value.category)
    && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(value.priority)
    && typeof value.response === 'string' && value.response.trim().length > 0
    && typeof value.requiresHumanReview === 'boolean'
    && (value.category !== 'SECURITY' || value.requiresHumanReview);
}

const cases = JSON.parse(await readFile(new URL('../tests/cases.json', import.meta.url), 'utf8')).map(ticket => ({
  ...ticket, category: ticket.expectedCategory, priority: ticket.expectedPriority
}));
const endpoint = `http://127.0.0.1:${process.env.PORT ?? 3000}/api/analyze`;
const evidence = [];
const totals = Object.fromEntries(modes.map(mode => [mode, { validos: 0, correctos: 0 }]));

for (const ticket of cases) {
  const results = {};
  for (const mode of modes) {
    const request = { message: ticket.message, mode };
    let status;
    let body;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(120000)
      });
      status = response.status;
      body = await response.json();
    } catch {
      body = { error: 'La API no devolvió una respuesta JSON.' };
    }
    const valid = status === 200 && Boolean(validResult(body, mode));
    const correct = valid && body.category === ticket.category && body.priority === ticket.priority;
    results[mode] = { request, status: status ?? null, body, valid, correct };
    totals[mode].validos += Number(valid);
    totals[mode].correctos += Number(correct);
  }
  evidence.push({ reference: ticket, results });
  console.log(`Caso ${evidence.length}/${cases.length} completado`);
}

const labels = ['Caso', 'Mensaje', 'Referencia', ...modes.flatMap(mode => [
  `${mode} · resultado`, 'Formato', 'Acierto'
])];
const row = values => `| ${values.join(' | ')} |`;
const yesNo = value => value ? 'Sí' : 'No';
const classification = value => `${value.category} / ${value.priority}`;
const table = [
  row(labels),
  row(labels.map(() => '---')),
  ...evidence.map(({ reference, results }) => row([
    reference.id, reference.message.replaceAll('|', '\\|'), classification(reference),
    ...modes.flatMap(mode => {
      const { body, status, valid, correct } = results[mode];
      const label = body.category && body.priority ? classification(body) : '—';
      return [valid ? label : `Error ${status ?? 'de conexión'} (${label})`, yesNo(valid), yesNo(correct)];
    })
  ]))
].join('\n');

const summary = modes.map(mode => {
  const { correctos, validos } = totals[mode];
  return `- \`${mode}\` obtuvo **${correctos}/${cases.length} (${Number((100 * correctos / cases.length).toFixed(2))} %)** con ${validos}/${cases.length} respuestas válidas.`;
}).join('\n');
const report = `# Resultados comparativos

Modelo local configurado: ${modelName}.

Un acierto requiere HTTP 200, formato válido y coincidencia exacta de categoría y prioridad con la referencia. El denominador incluye todos los casos.

${table}

${summary}
`;

await mkdir('evidence/local', { recursive: true });
await writeFile('evidence/local/ejecucion.json', JSON.stringify({ endpoint, modelName, evidence, totals }, null, 2) + '\n');
await writeFile('evidence/local/tabla.md', report);
console.log('\nEjemplo de ejecución HTTP con el caso 1');
for (const { request, status, body } of Object.values(evidence[0].results)) {
  console.log(JSON.stringify({ request, status, body }, null, 2));
}
console.log(`\n${report}\nArchivos guardados en evidence/local/.`);
if (modes.some(mode => totals[mode].validos !== cases.length)) process.exitCode = 1;
