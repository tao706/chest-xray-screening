import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const domain=process.argv[2];
if(!domain||! /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain))throw new Error('Usage: node deploy/configure.mjs your.real.domain');
const secret=()=>randomBytes(24).toString('hex');
const text=['CADDY_SITE='+domain,'PUBLIC_ORIGIN=https://'+domain,'MYSQL_ROOT_PASSWORD='+secret(),'MYSQL_PASSWORD='+secret(),'OWNER_PASSWORD='+secret(),'DEMO_PASSWORD='+secret(),'LLM_API_KEY=','LLM_BASE_URL=https://api.deepseek.com','LLM_MODEL=deepseek-flash',''].join('\n');
await writeFile(new URL('.env',import.meta.url),text,{flag:'wx',mode:0o600});
console.log('Created deploy/.env without printing secrets. Share only the demo account password with visitors; keep OWNER_PASSWORD private.');
