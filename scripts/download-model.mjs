import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import localEngine from '../src/services/local.engine.js';
const { modelFile } = localEngine;

const url = 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true';
const expectedHash = '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e';

async function isValid(path) {
  const file = await stat(path).catch(() => null);
  if (file?.size !== 1117320736) return false;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex') === expectedHash;
}

if (await isValid(modelFile)) {
  console.log('El modelo está listo.');
} else {
  const partial = `${modelFile}.${process.pid}.part`;
  await mkdir(dirname(modelFile), { recursive: true });
  try {
    const result = spawnSync(process.platform === 'win32' ? 'curl.exe' : 'curl', [
      '--fail', '--location', '--retry', '2', '--output', partial, url
    ], { stdio: 'inherit' });
    if (result.status !== 0 || !await isValid(partial)) {
      throw new Error('La descarga falló o el archivo no pasó la verificación.');
    }
    await rename(partial, modelFile);
    console.log('El modelo está listo.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await rm(partial, { force: true });
  }
}
