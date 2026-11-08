import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let files;
try {
  files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
} catch {
  console.error('Tracked-path check requires a Git checkout. Run after initializing the publication repository.');
  process.exit(1);
}
const findings = [];
for (const file of files) {
  const parts = file.replaceAll('\\', '/').split('/');
  const name = parts.at(-1);
  let issue;
  if (parts.some(p => ['node_modules', '.venv', '.venv312', '.python_packages', '.runtime', '__pycache__', 'dist'].includes(p))) issue = 'generated dependency/runtime directory';
  else if (name.startsWith('.env') && name !== '.env.example') issue = 'environment credentials';
  else if (/\.(pt|pth|onnx|safetensors|dicom|dcm|log|tsbuildinfo|pem|key|p12|pfx)$/i.test(name)) issue = 'weight, image, runtime or key material';
  else if (/^(server\/(uploads|exports|logs)|inference\/(weights|\.cache)|datasets)\//.test(file) && name !== '.gitkeep') issue = 'local data or model material';
  if (issue) findings.push({ file, issue });
}
for (const item of findings) console.error(`${item.file} — ${item.issue}`);
console.log(`Inspected ${files.length} tracked paths; ${findings.length} findings.`);
process.exitCode = findings.length ? 1 : 0;
