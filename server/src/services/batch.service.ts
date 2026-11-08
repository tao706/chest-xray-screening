import type { ResultSetHeader } from "mysql2";
import path from "node:path";
import { database } from "../config/database.js";
import { scanDataset } from "./dataset.service.js";
import { requestInferenceFromPaths } from "./inference.service.js";
import { publishTaskEvent } from "./task-events.service.js";
export function startBatchTask(taskPk: number, taskId: string, datasetName: string) {
    setImmediate(() => void runBatchTask(taskPk, taskId, datasetName));
}
async function runBatchTask(taskPk: number, taskId: string, datasetName: string) {
    let completed = 0;
    let failed = 0;
    try {
        await database.execute("UPDATE batch_tasks SET status = 'scanning', started_at = NOW() WHERE id = ?", [taskPk]);
        publishTaskEvent({ type: "scan", taskId, status: "scanning", total: 0, completed, failed, message: "正在扫描数据集" });
        const { studies } = await scanDataset(datasetName);
        if (!studies.length)
            throw new Error("数据集中没有符合目录结构的胸片检查");
        await database.execute("UPDATE batch_tasks SET status = 'running', total_count = ? WHERE id = ?", [studies.length, taskPk]);
        for (const study of studies) {
            const [itemResult] = await database.execute<ResultSetHeader>(`INSERT INTO batch_task_items (task_pk, subject_id, study_id, status, image_count, started_at)
         VALUES (?, ?, ?, 'processing', ?, NOW())`, [taskPk, study.subjectId, study.studyId, study.imagePaths.length]);
            try {
                const inference = await requestInferenceFromPaths(study.subjectId, study.studyId, study.imagePaths);
                const [studyResult] = await database.execute<ResultSetHeader>(`INSERT INTO studies (subject_id, study_id, status, image_count)
           VALUES (?, ?, 'processing', ?)
           ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), subject_id = VALUES(subject_id),
             status = 'processing', image_count = VALUES(image_count), error_message = NULL`, [study.subjectId, study.studyId, study.imagePaths.length]);
                const studyPk = studyResult.insertId;
                
                if (inference.predictions.length !== 14)
                    throw new Error("模型没有返回完整的14类概率");
                const connection = await database.getConnection();
                try {
                    await connection.beginTransaction();
                    await connection.execute("DELETE FROM predictions WHERE study_pk = ?", [studyPk]);
                    await connection.execute("DELETE FROM study_images WHERE study_pk = ?", [studyPk]);
                    for (const imagePath of study.imagePaths) {
                        await connection.execute(`INSERT INTO study_images (study_pk, original_name, stored_path, mime_type, file_size)
               VALUES (?, ?, ?, ?, 0)`, [studyPk, path.basename(imagePath), imagePath, imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"]);
                    }
                    for (const prediction of inference.predictions) {
                        await connection.execute(`INSERT INTO predictions (study_pk, class_id, class_name, class_name_en, probability)
               VALUES (?, ?, ?, ?, ?)`, [studyPk, prediction.class_id, prediction.class_name, prediction.class_name_en, prediction.probability]);
                    }
                    await connection.execute(`UPDATE studies SET status = 'completed', model_version = ?, inference_time_ms = ? WHERE id = ?`, [inference.model_version, inference.inference_time_ms, studyPk]);
                    await connection.execute("UPDATE batch_task_items SET status = 'completed', completed_at = NOW() WHERE id = ?", [itemResult.insertId]);
                    await connection.commit();
                    completed += 1;
                }
                catch (error) {
                    await connection.rollback();
                    throw error;
                }
                finally {
                    connection.release();
                }
            }
            catch (error) {
                failed += 1;
                await database.execute(`UPDATE batch_task_items SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`, [error instanceof Error ? error.message.slice(0, 500) : "未知错误", itemResult.insertId]);
            }
            await database.execute("UPDATE batch_tasks SET completed_count = ?, failed_count = ? WHERE id = ?", [completed, failed, taskPk]);
            publishTaskEvent({
                type: "progress", taskId, status: "running", total: studies.length,
                completed, failed, currentStudyId: study.studyId,
                message: `已处理 ${completed + failed}/${studies.length}`
            });
        }
        await database.execute("UPDATE batch_tasks SET status = 'completed', completed_at = NOW() WHERE id = ?", [taskPk]);
        publishTaskEvent({ type: "completed", taskId, status: "completed", total: studies.length, completed, failed, message: "批量推理完成" });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "批量任务失败";
        await database.execute("UPDATE batch_tasks SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?", [message.slice(0, 500), taskPk]).catch(() => undefined);
        publishTaskEvent({ type: "failed", taskId, status: "failed", total: completed + failed, completed, failed, message });
    }
}
