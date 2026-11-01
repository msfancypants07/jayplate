import { readFile, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const entries = [
  ['/index.html', 'public/index.html'],
  ['/styles.css', 'public/styles.css'],
  ['/app.js', 'public/app.js']
];
const assets = Object.fromEntries(await Promise.all(entries.map(async ([route, file]) => [route, await readFile(resolve(root, file), 'utf8')])));
const worker = await readFile(resolve(root, 'worker/index.js'), 'utf8');
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'server'), { recursive: true });
await mkdir(resolve(dist, '.openai'), { recursive: true });
await writeFile(resolve(dist, 'server/index.js'), `const ASSETS = ${JSON.stringify(assets)};\n${worker}`);
await copyFile(resolve(root, '.openai/hosting.json'), resolve(dist, '.openai/hosting.json'));
console.log('Built JayPlate for public hosting');
