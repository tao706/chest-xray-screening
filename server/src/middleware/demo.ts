import type {Request,Response,NextFunction} from "express";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import type {RowDataPacket} from "mysql2";
import {database} from "../config/database.js";

export const demoEnabled=process.env.DEMO_MODE==="true";
export const demoSamplesRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../examples/chest-xrays");
export const demoSampleNames=["chest-pa-01.jpg","chest-pa-02.png"];
const hashes=new Set(demoEnabled?demoSampleNames.map(name=>createHash("sha256").update(readFileSync(path.join(demoSamplesRoot,name))).digest("hex")):[]);
export function approvedDemoImage(buffer:Buffer){return hashes.has(createHash("sha256").update(buffer).digest("hex"));}
export class DemoQuota {
    private windows=new Map<string,{expires:number,count:number}>();
    private active=0;
    allow(key:string,limit:number,period:number,now=Date.now()){
        for(const [id,value] of this.windows)if(now>=value.expires)this.windows.delete(id);
        const current=this.windows.get(key);
        if(!current){if(this.windows.size>=5000)return false;this.windows.set(key,{expires:now+period,count:1});return true;}
        if(current.count>=limit)return false;
        current.count++;return true;
    }
    acquire(){if(this.active>=1)return undefined;this.active++;let released=false;return ()=>{if(!released){released=true;this.active--;}};}
}
const quota=new DemoQuota();
function reject(response:Response,code:string,message:string,status=403){response.status(status).json({success:false,code,message});}
export function demoTraffic(request:Request,response:Response,next:NextFunction){
    if(!demoEnabled||!request.path.startsWith("/api/")||request.path==="/api/health")return next();
    if(!quota.allow("traffic:"+request.ip,120,60000))return reject(response,"DEMO_RATE_LIMIT","演示访问频率较高，请稍后重试。",429);
    next();
}
export async function demoPolicy(request:Request,response:Response,next:NextFunction){
    if(!demoEnabled)return next();
    const mutation=!["GET","HEAD","OPTIONS"].includes(request.method);
    const allowedPost=request.method==="POST"&&["/studies/predict","/studies/validate-image","/assistant/chat"].includes(request.path);
    if(mutation&&!allowedPost)return reject(response,"DEMO_READ_ONLY","演示环境不开放批量任务、删除及草稿保存；完整功能请在本地运行。");
    const expensive=allowedPost||request.path.endsWith("/gradcam");
    if(!expensive)return next();
    if(!quota.allow("expensive:"+request.ip,30,3600000)||!quota.allow("expensive:global",120,3600000))return reject(response,"DEMO_RATE_LIMIT","演示分析次数已达限额，请稍后再试。",429);
    const release=quota.acquire();
    if(!release)return reject(response,"DEMO_BUSY","当前有演示请求正在处理，请稍后重试。",429);
    response.once("finish",release);response.once("close",release);
    try{
        if(request.path==="/studies/predict"){
            const [rows]=await database.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM studies");
            if(Number(rows[0]?.total??0)>=200)return reject(response,"DEMO_STORAGE_LIMIT","演示记录已达容量上限，请联系维护者。",429);
        }
        next();
    }catch(error){release();next(error);}
}
