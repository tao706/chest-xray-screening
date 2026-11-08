import { Router } from "express";
import { chestXrayClasses } from "../constants/classes.js";
export const classesRouter = Router();
classesRouter.get("/", (_request, response) => {
    response.json({ success: true, data: chestXrayClasses, message: "类别加载成功" });
});
