import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'server/package.json'));
const {parse}=require('dotenv');
export function encodeEnvValue(value){
  if(/[\r\n\0]/.test(value))throw new Error('Local configuration values must be single-line text.');
  for(const quote of ["'",'`','"']){
    if(!value.includes(quote)&&!(quote==='"'&&/\\[nr]/.test(value)))return quote+value+quote;
  }
  throw new Error('This combination of quotation marks cannot be represented safely in dotenv. Use a different local password.');
}
export function configurationReady(config){
  return ['DB_HOST','DB_PORT','DB_USER','DB_NAME'].every(key=>config[key]&&!/CHANGE_ME|PLACEHOLDER/.test(config[key]))
    && Object.hasOwn(config,'DB_PASSWORD') && config.DB_PASSWORD!=='CHANGE_ME'
    && !/CHANGE_ME|PLACEHOLDER/.test(config.AUTH_DEMO_PASSWORD??'');
}
export function schemaForDatabase(schema,name){
  if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name))throw new Error('DB_NAME must contain letters, digits or underscores and start with a letter.');
  if(!schema.includes('CREATE DATABASE IF NOT EXISTS chest_xray')||!schema.includes('USE chest_xray;'))throw new Error('Unexpected schema template.');
  if(/\b(DROP|TRUNCATE|DELETE|INSERT|UPDATE|REPLACE)\s+(TABLE|DATABASE|FROM|INTO|[a-z_]+\s+SET)\b/i.test(schema))throw new Error('Schema contains unexpected data mutations.');
  return schema.replace('CREATE DATABASE IF NOT EXISTS chest_xray','CREATE DATABASE IF NOT EXISTS `'+name+'`').replace('USE chest_xray;','USE `'+name+'`;');
}
export async function initializeSchema(connection,sql,database){
  const expectedTables=[...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)].map(match=>match[1]);
  const [existing]=await connection.execute('SELECT TABLE_NAME AS table_name FROM information_schema.tables WHERE table_schema = ?',[database]);
  const existingNames=new Set(existing.map(row=>row.table_name));
  if(expectedTables.length&&expectedTables.every(name=>existingNames.has(name)))return false;
  await connection.query(sql);
  return true;
}
async function main(){
  const mode=process.argv[2];
  const envPath=path.join(root,'server/.env');
  let text=await readFile(envPath,'utf8').catch(()=> '');
  const config={DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_NAME:'chest_xray',...parse(text)};
  if(mode==='status'){console.log(JSON.stringify({ready:configurationReady(config),dbHost:config.DB_HOST??'127.0.0.1',dbPort:Number(config.DB_PORT??3306)}));return;}
  if(mode==='save'){
    let input='';for await(const chunk of process.stdin)input+=chunk;
    const changes=JSON.parse(input);
    const allowed=['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME','AUTH_DEMO_USERNAME','AUTH_DEMO_PASSWORD'];
    if(!allowed.every(key=>typeof changes[key]==='string'))throw new Error('Incomplete local configuration.');
    if(changes.AUTH_DEMO_PASSWORD.length<12)throw new Error('Use at least 12 characters for the initial administrator password.');
    if(!/^\d+$/.test(changes.DB_PORT)||Number(changes.DB_PORT)<1||Number(changes.DB_PORT)>65535)throw new Error('Invalid MySQL port.');
    schemaForDatabase(await readFile(path.join(root,'database/schema.sql'),'utf8'),changes.DB_NAME);
    if(!text)text=await readFile(path.join(root,'server/.env.example'),'utf8');
    for(const key of allowed){const line=key+'='+encodeEnvValue(changes[key]);const pattern=new RegExp('^'+key+'=.*$','gm');text=pattern.test(text)?text.replace(pattern,()=>line):text+'\n'+line;}
    await writeFile(envPath,text,'utf8');console.log('Local configuration saved. Passwords were not printed.');return;
  }
  if(mode!=='init')throw new Error('Use status, save or init.');
  if(!configurationReady(config))throw new Error('Run npm run configure first.');
  const sql=schemaForDatabase(await readFile(path.join(root,'database/schema.sql'),'utf8'),config.DB_NAME);
  const mysql=require('mysql2/promise');
  let connection;
  try{
    connection=await mysql.createConnection({host:config.DB_HOST,port:Number(config.DB_PORT),user:config.DB_USER,password:config.DB_PASSWORD,multipleStatements:true,connectTimeout:10000});
    const initialized=await initializeSchema(connection,sql,config.DB_NAME);
    console.log(initialized?'Database structure initialized. Existing tables and records were preserved.':'Existing database tables found; initialization skipped and records preserved.');
  }catch(error){throw new Error('MySQL initialization failed ('+String(error.code??'UNKNOWN')+'). Check service, credentials and CREATE privileges; see docs/INSTALL_WINDOWS.md.');}
  finally{if(connection)await connection.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
