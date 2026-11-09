import {database} from '../server/dist/config/database.js';
import {ensureAuthSchema,hashPassword} from '../server/dist/services/auth.service.js';
import {randomBytes} from 'node:crypto';
try{
  const password=process.env.DEMO_PASSWORD;
  if(!password||password==='CHANGE_ME'||password.length<12)throw new Error('Set a strong DEMO_PASSWORD in deploy/.env.');
  await ensureAuthSchema();
  const salt=randomBytes(16).toString('hex');
  const hash=await hashPassword(password,salt);
  await database.execute("INSERT INTO users (username,password_hash,password_salt,display_name,role) VALUES ('demo',?,?, '演示访客','operator') ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), password_salt=VALUES(password_salt), role='operator',is_active=1",[hash,salt]);
  console.log('Dedicated demo account prepared; owner account is separate.');
}catch(error){console.error(error instanceof Error?error.message:'Demo initialization failed');process.exitCode=1;}
finally{await database.end();}
