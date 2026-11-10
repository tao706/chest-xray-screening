import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
process.env.DEMO_MODE='true';
const {DemoQuota,approvedDemoImage,demoTraffic,demoPolicy}=await import('../server/dist/middleware/demo.js');
test('independent rate windows expire at their own deadline',()=>{
  const quota=new DemoQuota();
  assert.equal(quota.allow('hour',1,3600000,0),true);
  assert.equal(quota.allow('minute',1,60000,120000),true);
  assert.equal(quota.allow('hour',1,3600000,120000),false);
  assert.equal(quota.allow('hour',1,3600000,3600000),true);
});
test('only one expensive request acquires a slot and release is idempotent',()=>{
  const quota=new DemoQuota(),release=quota.acquire();
  assert.ok(release);assert.equal(quota.acquire(),undefined);
  release();release();assert.ok(quota.acquire());assert.equal(quota.acquire(),undefined);
});
test('only exact approved sample bytes are accepted',async()=>{
  const sample=await readFile(new URL('../examples/chest-xrays/chest-pa-01.jpg',import.meta.url));
  assert.equal(approvedDemoImage(sample),true);
  assert.equal(approvedDemoImage(Buffer.from('other image')),false);
});
function response(){return {statusCode:0,payload:null,status(code){this.statusCode=code;return this;},json(value){this.payload=value;return this;}};}
test('demo traffic delegates registration to auth configuration',()=>{
  let called=false;demoTraffic({path:'/api/auth/register',ip:'test'},response(),()=>{called=true;});assert.equal(called,true);
});
test('demo policy blocks destructive and batch operations',async()=>{
  for(const [method,path] of [['DELETE','/studies/example'],['POST','/tasks'],['PUT','/assistant/reviews/1']]){
    const res=response();await demoPolicy({method,path},res,()=>assert.fail());assert.equal(res.statusCode,403);
  }
});
test('demo policy keeps read-only browsing available',async()=>{
  let called=false;await demoPolicy({method:'GET',path:'/dashboard'},response(),()=>{called=true;});assert.equal(called,true);
});
