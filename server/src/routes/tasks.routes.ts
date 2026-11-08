import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
import { listDatasets, scanDataset } from "../services/dataset.service.js";
import { startBatchTask } from "../services/batch.service.js";
import { deleteBatchTasks, TaskDeletionError } from "../services/task-deletion.service.js";
import { subscribeTaskEvent } from "../services/task-events.service.js";
import { generateSubmission, getSubmissionFile, validateSubmission } from "../services/submission.service.js";
export const tasksRouter = Router();
tasksRouter.get("/datasets", async (_request, response, next) => {
    try {
        response.json({ success: true, data: await listDatasets(), message: "数据集加载成功" });
    }
    catch (error) {
        next(error);
    }
});
tasksRouter.get("/datasets/:name/scan", async (request, response, next) => {
    try {
        const { summary } = await scanDataset(request.params.name);
        response.json({ success: true, data: summary, message: "数据集扫描完成" });
    }
    catch (error) {
        next(error);
    }
});
tasksRouter.get("/", async (_request, response, next) => {
    try {
        const [rows] = await database.query<RowDataPacket[]>("SELECT * FROM batch_tasks ORDER BY created_at DESC LIMIT 100");
        response.json({ success: true, data: rows, message: "批量任务加载成功" });
    }
    catch (error) {
        next(error);
    }
});
tasksRouter.post("/", async (request, response, next) => {
    const taskName = String(request.body.task_name ?? "").trim();
    const datasetName = String(request.body.dataset_name ?? "").trim();
    const threshold = Number(request.body.threshold ?? 0.5);
    if (!taskName || taskName.length > 100) {
        response.status(400).json({ success: false, code: "INVALID_TASK_NAME", message: "任务名称不能为空且不能超过100字符" });
        return;
    }
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(datasetName)) {
        response.status(400).json({ success: false, code: "INVALID_DATASET", message: "请选择有效的数据集" });
        return;
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        response.status(400).json({ success: false, code: "INVALID_THRESHOLD", message: "阈值必须在0到1之间" });
        return;
    }
    try {
        await scanDataset(datasetName);
        const taskId = randomUUID();
        const [result] = await database.execute<ResultSetHeader>(`INSERT INTO batch_tasks (task_id, task_name, dataset_name, threshold_value)
       VALUES (?, ?, ?, ?)`, [taskId, taskName, datasetName, threshold]);
        startBatchTask(result.insertId, taskId, datasetName);
        response.status(202).json({ success: true, data: { task_id: taskId }, message: "批量任务已创建" });
    }
    catch (error) {
        next(error);
    }
});
async function handleTaskDeletion(taskIds: string[], response: Response, next: NextFunction) {
    try {
        const deletedCount = await deleteBatchTasks(taskIds);
        response.json({ success: true, data: { deleted_count: deletedCount }, message: `已删除${deletedCount}个批量任务` });
    }
    catch (error) {
        if (error instanceof TaskDeletionError) {
            response.status(error.status).json({ success: false, code: error.code, message: error.message });
            return;
        }
        next(error);
    }
}
tasksRouter.delete("/", async (request, response, next) => {
    const taskIds = request.body?.task_ids;
    await handleTaskDeletion(Array.isArray(taskIds) ? taskIds : [], response, next);
});
tasksRouter.delete("/:taskId", async (request, response, next) => {
    await handleTaskDeletion([request.params.taskId], response, next);
});
tasksRouter.post("/:taskId/submission", async (request, response, next) => {
    const threshold = request.body.threshold === undefined ? undefined : Number(request.body.threshold);
    if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
        response.status(400).json({ success: false, code: "INVALID_THRESHOLD", message: "阈值必须在0到1之间" });
        return;
    }
    try {
        const validation = await generateSubmission(request.params.taskId, threshold);
        response.json({ success: true, data: validation, message: "submission.csv已生成并校验" });
    }
    catch (error) {
        next(error);
    }
});
tasksRouter.get("/:taskId/submission/validate", async (request, response, next) => {
    try {
        const validation = await validateSubmission(request.params.taskId);
        response.json({ success: true, data: validation, message: "提交文件校验完成" });
    }
    catch (error) {
        next(error);
    }
});
tasksRouter.get("/:taskId/submission/download", async (request, response, next) => {
    try {
        const filePath = await getSubmissionFile(request.params.taskId);
        response.download(filePath, "submission.csv");
    }
    catch (error) {
        next(error);
    }
});
tasksRouter.get("/:taskId", async (request, response, next) => {
    try {
        const [rows] = await database.execute<RowDataPacket[]>("SELECT * FROM batch_tasks WHERE task_id = ? LIMIT 1", [request.params.taskId]);
        if (!rows[0]) {
            response.status(404).json({ success: false, code: "TASK_NOT_FOUND", message: "未找到该批量任务" });
            return;
        }
        response.json({ success: true, data: rows[0], message: "任务状态加载成功" });
    }
    catch (error) {
        next(error);
    }
});
tasksRouter.get("/:taskId/events", async (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    response.write(`event: connected\ndata: ${JSON.stringify({ taskId: request.params.taskId })}\n\n`);
    const unsubscribe = subscribeTaskEvent(request.params.taskId, (event) => {
        response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15000);
    request.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        response.end();
    });
});
