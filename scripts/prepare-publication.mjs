import { readFile, readdir, lstat, mkdir, writeFile, copyFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = process.argv[2];
if (!argument) throw new Error('Provide a new destination directory: node scripts/prepare-publication.mjs <directory>');
const output = path.resolve(argument);
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};
if (inside(root, output) || inside(output, root)) throw new Error('Destination must not overlap the source project.');
let exists = false;
try { await access(output); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (exists) throw new Error('Destination already exists; refusing to overwrite.');
const rules = JSON.parse(await readFile(path.join(root, 'docs/RELEASE_FILES.json'), 'utf8'));
const selected = new Set();
function safe(relative) {
  const absolute = path.resolve(root, relative);
  if (!inside(root, absolute) || absolute === root) throw new Error('Invalid source path in release rules.');
  return absolute;
}
async function add(relative) {
  const info = await lstat(safe(relative));
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Not a regular source file: ${relative}`);
  selected.add(relative.replaceAll('\\', '/'));
}
async function tree(relative, extensions) {
  const info = await lstat(safe(relative));
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Invalid source directory: ${relative}`);
  for (const entry of await readdir(safe(relative), { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink requires review: ${child}`);
    if (entry.isDirectory()) {
      if (!['__pycache__', 'node_modules', 'dist', '.git'].includes(entry.name)) await tree(child, extensions);
    } else if (extensions.includes(path.extname(entry.name))) await add(child);
  }
}
for (const relative of rules.files) await add(relative);
for (const rule of rules.trees) await tree(rule.path, rule.extensions);
const records = [];
for (const relative of [...selected].sort()) {
  const content = await readFile(safe(relative));
  records.push({ path: relative, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
}
await mkdir(output, { recursive: true });
for (const record of records) {
  const target = path.join(output, record.path);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(safe(record.path), target);
}
await mkdir(path.join(output, 'datasets'), { recursive: true });
await writeFile(path.join(output, 'datasets/.gitkeep'), '');
records.push({ path: 'datasets/.gitkeep', bytes: 0, sha256: createHash('sha256').update('').digest('hex') });
await writeFile(path.join(output, 'RELEASE_MANIFEST.json'), JSON.stringify({
  status: 'local publication candidate, not a published release',
  source: 'project-owned allowlisted source and documentation',
  excludes: rules.excludes,
  manifestSelfHashExcluded: true,
  files: records.sort((a, b) => a.path.localeCompare(b.path))
}, null, 2) + '\n');
console.log(`Prepared ${records.length} files with SHA-256 manifest at ${output}`);
