import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(toolDirectory, '..');
const defaultHar = resolve(projectDirectory, '..', 'www.365.rsall.har');
const sourcePath = resolve(process.cwd(), process.argv[2] ?? defaultHar);
const outputPath = resolve(projectDirectory, 'public', 'team-logo-index.json');
const indexUrl = 'https://ibet-365.com/content/club-icons/vanja.json';

function compact(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\.(?:webp|png|jpe?g)$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function verifiedImageUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    if (url.protocol !== 'https:' || url.hostname !== 'ibet-365.com') return null;
    if (!url.pathname.startsWith('/content/club-icons/')) return null;
    if (!/\.(?:webp|png|jpe?g)$/i.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

const har = JSON.parse(await readFile(sourcePath, 'utf8'));
const entry = har?.log?.entries?.find((item) => item?.request?.url === indexUrl);
if (!entry?.response?.content?.text) {
  throw new Error(`Club icon index response was not found in ${sourcePath}`);
}

const captured = JSON.parse(entry.response.content.text);
const logos = new Map();
for (const item of captured) {
  const url = verifiedImageUrl(item?.url);
  if (!url) continue;
  const filename = new URL(url).pathname.split('/').at(-1);
  for (const key of [compact(item?.name), compact(filename)]) {
    if (key && !logos.has(key)) logos.set(key, url);
  }
}

const payload = {
  source: indexUrl,
  captured_at: entry.startedDateTime ?? null,
  count: logos.size,
  logos: Object.fromEntries([...logos].sort(([left], [right]) => left.localeCompare(right))),
};
await writeFile(outputPath, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`Wrote ${payload.count} verified team logo mappings to ${outputPath}`);
