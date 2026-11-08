import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
import { chestXrayClasses } from "../constants/classes.js";
export const dashboardRouter = Router();
interface OverviewRow extends RowDataPacket {
    total_count: number | string;
    completed_count: number | string;
    failed_count: number | string;
    active_count: number | string;
    today_count: number | string;
    average_inference_ms: number | string;
}
dashboardRouter.get("/", async (_request, response, next) => {
    try {
        const [overviewResult, classResult, dailyResult, recentResult, taskResult] = await Promise.all([
            database.query<RowDataPacket[]>(`SELECT COUNT(*) AS total_count,
                COALESCE(SUM(status = 'completed'), 0) AS completed_count,
                COALESCE(SUM(status = 'failed'), 0) AS failed_count,
                COALESCE(SUM(status IN ('pending', 'processing')), 0) AS active_count,
                COALESCE(SUM(DATE(created_at) = CURDATE()), 0) AS today_count,
                COALESCE(AVG(CASE WHEN status = 'completed' THEN inference_time_ms END), 0) AS average_inference_ms
           FROM studies`),
            database.query<RowDataPacket[]>(`SELECT p.class_name_en, COUNT(*) AS prediction_count
           FROM predictions p JOIN studies s ON s.id = p.study_pk
          WHERE s.status = 'completed' AND p.probability >= 0.5
            AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY p.class_name_en ORDER BY p.class_name_en`),
            database.query<RowDataPacket[]>(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS study_count,
                COALESCE(SUM(status = 'completed'), 0) AS completed_count,
                COALESCE(SUM(status = 'failed'), 0) AS failed_count
           FROM studies
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
          GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY day`),
            database.query<RowDataPacket[]>(`SELECT s.subject_id, s.study_id, s.status, s.image_count, s.model_version,
                s.inference_time_ms, s.created_at,
                (SELECT p.class_name FROM predictions p WHERE p.study_pk = s.id ORDER BY p.probability DESC LIMIT 1) AS top_class_name,
                (SELECT p.probability FROM predictions p WHERE p.study_pk = s.id ORDER BY p.probability DESC LIMIT 1) AS top_probability
           FROM studies s ORDER BY s.created_at DESC LIMIT 5`),
            database.query<RowDataPacket[]>(`SELECT task_id, task_name, dataset_name, status, total_count, completed_count, failed_count, created_at
           FROM batch_tasks ORDER BY created_at DESC LIMIT 5`)
        ]);
        const overviewRow = overviewResult[0][0] as OverviewRow;
        const completed = Number(overviewRow.completed_count ?? 0);
        const failed = Number(overviewRow.failed_count ?? 0);
        const classCounts = new Map(classResult[0].map((row) => [String(row.class_name_en), Number(row.prediction_count)]));
        response.json({
            success: true,
            data: {
                overview: {
                    total_count: Number(overviewRow.total_count ?? 0),
                    completed_count: completed,
                    failed_count: failed,
                    active_count: Number(overviewRow.active_count ?? 0),
                    today_count: Number(overviewRow.today_count ?? 0),
                    average_inference_ms: Number(overviewRow.average_inference_ms ?? 0),
                    success_rate: completed + failed ? completed / (completed + failed) : 0
                },
                class_counts: chestXrayClasses.map((item) => ({
                    class_id: item.id,
                    class_name: item.name,
                    class_name_en: item.nameEn,
                    count: classCounts.get(item.nameEn) ?? 0
                })),
                daily_counts: dailyResult[0].map((row) => ({
                    day: String(row.day),
                    study_count: Number(row.study_count),
                    completed_count: Number(row.completed_count),
                    failed_count: Number(row.failed_count)
                })),
                recent_studies: recentResult[0],
                recent_tasks: taskResult[0],
                generated_at: new Date().toISOString()
            },
            message: "首页统计加载成功"
        });
    }
    catch (error) {
        next(error);
    }
});
