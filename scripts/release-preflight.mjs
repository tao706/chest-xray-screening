import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const excluded=new Set(['node_modules','dist','.venv','.venv312','.python_packages','.git','.runtime','__pycache__','.idea','.vscode','logs','uploads','exports','weights']);
const roots=['frontend','server','inference','scripts','database','docs','.github','examples'];
const files=['README.md','package.json','.gitignore','LICENSE','THIRD_PARTY_NOTICES.md'];
const issues=[];
async function walk(dir){
 for(const e of await readdir(path.join(root,dir),{withFileTypes:true})){
  const rel=path.posix.join(dir,e.name);
  if(e.isSymbolicLink()) {issues.push([rel,0,'symbolic link requires manual review']);continue;}
  if(e.isDirectory()){if(!excluded.has(e.name))await walk(rel);}
  else if(e.name!=='.env.example' && e.name.startsWith('.env'))continue;
  else if(!/\.(log|pyc|tsbuildinfo)$/i.test(e.name))files.push(rel);
 }
}
for(const dir of roots)await walk(dir);
const sensitive=[];
for(const name of ['server/.env','inference/.env']){
 const text=await readFile(path.join(root,name),'utf8').catch(()=> '');
 for(const line of text.split(/\r?\n/)){
  const match=line.match(/^([A-Z_]*(?:KEY|PASSWORD|SECRET|TOKEN)[A-Z_]*)=(.*)$/);
  if(match){const value=match[2].trim().replace(/^['"]|['"]$/g,'');if(value.length>=8&&!/CHANGE_ME|YOUR_|PLACEHOLDER/i.test(value))sensitive.push(value);}
 }
}
for(const rel of files){
 if(!/\.(vue|ts|js|mjs|cjs|py|css|html|json|sql|ps1|md|txt|example|yml|yaml)$/.test(rel)&&rel!=='.gitignore'&&rel!=='LICENSE')continue;
 const text=await readFile(path.join(root,rel),'utf8');
 text.split(/\r?\n/).forEach((line,index)=>{
  const add=type=>issues.push([rel,index+1,type]);
  if(sensitive.some(value=>line.includes(value)))add('local credential value found');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line))add('private key');
  if(/\bsk-[A-Za-z0-9_-]{20,}/.test(line))add('possible API key');
  if(/(?:C:|D:)\\Users\\[^\\\s]+|\u9676\u6d77\u82f1/.test(line))add('private user path/name');
 });
}
const ignore=await readFile(path.join(root,'.gitignore'),'utf8');
for(const rule of ['.env','node_modules/','server/uploads/','server/exports/','inference/weights/','datasets/*','.runtime/'])if(!ignore.split(/\r?\n/).includes(rule))issues.push(['.gitignore',0,`missing exclusion: ${rule}`]);
for(const [file,line,type]of issues)console.error(`${file}${line?':'+line:''} — ${type}`);
console.log(`Scanned ${files.length} source/documentation candidates; ${issues.length} findings. Local credentials and file contents were not printed.`);
console.log('This checks the proposed source scope, not Git history, redistribution rights, or arbitrary compressed folders.');
process.exitCode=issues.length?1:0;
