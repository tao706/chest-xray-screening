import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {configurationReady,schemaForDatabase,encodeEnvValue} from './local-database.mjs';
const {parse}=createRequire(new URL('../server/package.json',import.meta.url))('dotenv');

test('placeholder or missing configuration does not count as ready',()=>{
  assert.equal(configurationReady({}),false);
  assert.equal(configurationReady({DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:'CHANGE_ME',DB_NAME:'chest_xray',AUTH_DEMO_USERNAME:'admin',AUTH_DEMO_PASSWORD:'CHANGE_ME'}),false);
});
test('configured local connection can use an explicitly empty MySQL password',()=>{
  assert.equal(configurationReady({DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:'',DB_NAME:'chest_xray',AUTH_DEMO_USERNAME:'admin',AUTH_DEMO_PASSWORD:'test-only-not-a-real-password'}),true);
  assert.equal(configurationReady({DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:'',DB_NAME:'chest_xray'}),true);
});
const template='CREATE DATABASE IF NOT EXISTS chest_xray CHARACTER SET utf8mb4;\nUSE chest_xray;\nCREATE TABLE IF NOT EXISTS studies (id INT);';
test('schema initialization honors the configured database',()=>{
  const sql=schemaForDatabase(template,'screening_local');
  assert.match(sql,/CREATE DATABASE IF NOT EXISTS `screening_local`/);
  assert.match(sql,/USE `screening_local`;/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS studies/);
});
test('unsafe database names and data deletion are rejected',()=>{
  for(const name of ['x; DROP DATABASE x','x`','../x',''])assert.throws(()=>schemaForDatabase(template,name));
  assert.throws(()=>schemaForDatabase(template+'\nDROP TABLE studies;','screening_local'));
  assert.throws(()=>schemaForDatabase('SELECT 1','screening_local'));
});
test('password punctuation, Unicode and literal backslashes survive dotenv round-trip',()=>{
  for(const value of ['local#value$with"quotes','literal\\new\\route',"a'b#c",'测试用文本',"'`without-double"]){
    assert.equal(parse('VALUE='+encodeEnvValue(value)).VALUE,value);
  }
  assert.throws(()=>encodeEnvValue('line\nbreak'));
  assert.throws(()=>encodeEnvValue("'`\""));
});
