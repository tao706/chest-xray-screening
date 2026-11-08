import { rm } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
interface DeletableTask extends RowDataPacket {
    id: number;
    task_id: string;
    status: string;
}
export class TaskDeletionError extends Error {
    constructor(message: string, public readonly status: number, public readonly code: string) {
        super(message);
    }
}
export async function deleteBatchTasks(taskIds: string[]) {
    const uniqueIds = [...new Set(taskIds)];
    if (!uniqueIds.length || uniqueIds.length > 100 || uniqueIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        throw new TaskDeletionError("请选择1至100个有效任务", 400, "INVALID_TASK_IDS");
    }
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const placeholders = uniqueIds.map(() => "?").join(",");
        const [rows] = await connection.execute<DeletableTask[]>(`SELECT id, task_id, status FROM batch_tasks WHERE task_id IN (${placeholders}) FOR UPDATE`, uniqueIds);
        if (rows.length !== uniqueIds.length) {
            throw new TaskDeletionError("部分任务已不存在，请刷新列表后重试", 404, "TASK_NOT_FOUND");
        }
        if (rows.some((row) => !["completed", "failed"].includes(row.status))) {
            throw new TaskDeletionError("进行中的任务暂不能删除，请等待任务结束", 409, "TASK_ACTIVE");
        }
        await connection.execute(`DELETE FROM batch_tasks WHERE id IN (${placeholders})`, rows.map((row) => row.id));
        await connection.commit();
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
    const exportRoot = path.resolve(process.cwd(), "exports");
    for (const taskId of uniqueIds) {
        try {
            await rm(path.join(exportRoot, taskId), { recursive: true, force: true });
        }
        catch (error) {
            console.error(`Failed to remove generated export for task ${taskId}:`, error);
        }
    }
    return uniqueIds.length;
}
