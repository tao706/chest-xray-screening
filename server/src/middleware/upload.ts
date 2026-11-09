import type {RequestHandler} from "express";
import {demoEnabled,approvedDemoImage} from "./demo.js";
import multer from "multer";
const rawUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: demoEnabled ? 2 : 20,
        fileSize: 10 * 1024 * 1024
    },
    fileFilter(_request, file, callback) {
        if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
            callback(new Error(`${file.originalname}不是JPG、JPEG或PNG图片`));
            return;
        }
        callback(null, true);
    }
}).array("images", 20);

export const uploadStudyImages:RequestHandler=(request,response,next)=>rawUpload(request,response,error=>{
    if(error)return next(error);
    if(demoEnabled&&((request.files??[]) as Express.Multer.File[]).some(file=>!approvedDemoImage(file.buffer))){response.status(400).json({success:false,code:"DEMO_SAMPLE_ONLY",message:"演示环境仅接受页面提供的公开胸片样例，请下载后原样上传。"});return;}
    next();
});
