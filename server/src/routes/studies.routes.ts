import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
import { uploadStudyImages } from "../middleware/upload.js";
import { requestGradcam, requestInference, requestImageValidation } from "../services/inference.service.js";
import { isReadableStudyImagePath, persistStudyImages, removePersistedStudyImages } from "../services/image-storage.service.js";
export const studiesRouter = Router();
const validId = /^[A-Za-z0-9_-]{1,64}$/;
studiesRouter.get("/:studyId/images/:imageId", async (request, response, next) => {
    try {
        const [rows] = await database.execute<RowDataPacket[]>(`SELECT i.stored_path, i.mime_type, i.original_name, s.model_version
         FROM study_images i JOIN studies s ON s.id = i.study_pk
        WHERE s.study_id = ? AND i.id = ? LIMIT 1`, [request.params.studyId, request.params.imageId]);
        const image = rows[0];
        if (!image?.stored_path || !isReadableStudyImagePath(String(image.stored_path))) {
            response.status(404).json({ success: false, code: "IMAGE_NOT_FOUND", message: "未找到已保存的检查图片" });
            return;
        }
        response.type(String(image.mime_type));
        response.setHeader("Content-Disposition", `inline; filename="${path.basename(String(image.original_name)).replaceAll('"', "")}"`);
        response.sendFile(path.resolve(String(image.stored_path)));
    }
    catch (error) {
        next(error);
    }
});
studiesRouter.get("/:studyId/gradcam", async (request, response, next) => {
    const classId = Number(request.query.class_id);
    const imageId = Number(request.query.image_id);
    if (!Number.isInteger(classId) || classId < 1 || classId > 14 || !Number.isInteger(imageId) || imageId < 1) {
        response.status(400).json({ success: false, code: "INVALID_GRADCAM_INPUT", message: "类别ID或图片ID不合法" });
        return;
    }
    try {
        const [rows] = await database.execute<RowDataPacket[]>(`SELECT i.stored_path, i.mime_type, i.original_name, s.model_version
         FROM study_images i JOIN studies s ON s.id = i.study_pk
        WHERE s.study_id = ? AND i.id = ? LIMIT 1`, [request.params.studyId, imageId]);
        const image = rows[0];
        if (!image?.stored_path || !isReadableStudyImagePath(String(image.stored_path))) {
            response.status(404).json({ success: false, code: "IMAGE_NOT_FOUND", message: "该图片尚未持久化，无法生成热力图" });
            return;
        }
        if (!String(image.model_version).startsWith("nih14-")) {
            response.status(409).json({ success: false, message: "该检查使用历史分析版本，请重新分析图片后生成解释图" });
            return;
        }
        const result = await requestGradcam({
            name: String(image.original_name),
            mimeType: String(image.mime_type),
            buffer: await readFile(String(image.stored_path))
        }, classId);
        response.json({ success: true, data: result, message: result.is_mock ? "模拟解释图生成成功" : "Grad-CAM生成成功" });
    }
    catch (error) {
        next(error);
    }
});
studiesRouter.get("/", async (request, response, next) => {
    try {
        const page = Math.max(1, Number(request.query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(request.query.page_size) || 20));
        const offset = (page - 1) * pageSize;
        const filters: string[] = [];
        const values: Array<string | number> = [];
        const subjectId = String(request.query.subject_id ?? "").trim();
        const studyId = String(request.query.study_id ?? "").trim();
        const status = String(request.query.status ?? "").trim();
        if (subjectId) {
            filters.push("subject_id LIKE ?");
            values.push(`%${subjectId}%`);
        }
        if (studyId) {
            filters.push("study_id LIKE ?");
            values.push(`%${studyId}%`);
        }
        if (["pending", "processing", "completed", "failed"].includes(status)) {
            filters.push("status = ?");
            values.push(status);
        }
        const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        const [countRows] = await database.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM studies ${where}`, values);
        const [rows] = await database.execute<RowDataPacket[]>(`SELECT id, subject_id, study_id, status, image_count, model_version,
              inference_time_ms, total_time_ms, error_message, created_at, updated_at,
              (SELECT class_name FROM predictions p WHERE p.study_pk = studies.id
               ORDER BY p.probability DESC LIMIT 1) AS top_class_name,
              (SELECT probability FROM predictions p WHERE p.study_pk = studies.id
               ORDER BY p.probability DESC LIMIT 1) AS top_probability
       FROM studies ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...values, pageSize, offset]);
        response.json({
            success: true,
            data: { items: rows, page, page_size: pageSize, total: Number(countRows[0]?.total ?? 0) },
            message: "检查记录加载成功"
        });
    }
    catch (error) {
        next(error);
    }
});
studiesRouter.get("/:studyId", async (request, response, next) => {
    try {
        const [studies] = await database.execute<RowDataPacket[]>("SELECT * FROM studies WHERE study_id = ? LIMIT 1", [request.params.studyId]);
        const study = studies[0];
        if (!study) {
            response.status(404).json({ success: false, code: "STUDY_NOT_FOUND", message: "未找到该检查" });
            return;
        }
        const [predictions] = await database.execute<RowDataPacket[]>(`SELECT class_id, class_name, class_name_en, probability
       FROM predictions WHERE study_pk = ? ORDER BY class_id`, [study.id]);
        const [images] = await database.execute<RowDataPacket[]>(`SELECT id, original_name, mime_type, file_size, width, height, created_at
       FROM study_images WHERE study_pk = ? ORDER BY id`, [study.id]);
        response.json({ success: true, data: { ...study, images, predictions }, message: "检查详情加载成功" });
    }
    catch (error) {
        next(error);
    }
});
studiesRouter.delete("/:studyId", async (request, response, next) => {
    try {
        const [images] = await database.execute<RowDataPacket[]>(`SELECT i.stored_path FROM study_images i JOIN studies s ON s.id = i.study_pk
        WHERE s.study_id = ? AND i.stored_path IS NOT NULL`, [request.params.studyId]);
        const [result] = await database.execute<ResultSetHeader>("DELETE FROM studies WHERE study_id = ?", [request.params.studyId]);
        if (!result.affectedRows) {
            response.status(404).json({ success: false, code: "STUDY_NOT_FOUND", message: "未找到该检查" });
            return;
        }
        await removePersistedStudyImages(images.map((image) => String(image.stored_path)));
        response.json({ success: true, data: null, message: "检查记录已删除" });
    }
    catch (error) {
        next(error);
    }
});
studiesRouter.post("/validate-image", uploadStudyImages, async (request, response, next) => {
  try {
    const images = (request.files ?? []) as Express.Multer.File[];
    if (!images.length) { response.status(400).json({ success: false, message: "请选择胸部X线影像" }); return; }
    const data = await requestImageValidation(images);
    response.json({ success: true, data });
  } catch (error) { next(error); }
});
studiesRouter.post("/predict", uploadStudyImages, async (request, response, next) => {
    const subjectId = String(request.body.subject_id ?? "").trim();
    const studyId = String(request.body.study_id ?? "").trim();
    const note = String(request.body.note ?? "").trim().slice(0, 300);
    const images = (request.files ?? []) as Express.Multer.File[];
    if (!validId.test(subjectId) || !validId.test(studyId)) {
        response.status(400).json({ success: false, code: "INVALID_ID", message: "Subject_id和Study_id只能包含字母、数字、下划线和短横线" });
        return;
    }
    if (!images.length) {
        response.status(400).json({ success: false, code: "NO_IMAGES", message: "请至少上传一张胸片" });
        return;
    }
    let studyPk: number | undefined;
    const startedAt = performance.now();
    try {
        const inference = await requestInference(subjectId, studyId, images);
        const [insert] = await database.execute<ResultSetHeader>(`INSERT INTO studies (subject_id, study_id, note, status, image_count)
       VALUES (?, ?, ?, 'processing', ?)`, [subjectId, studyId, note || null, images.length]);
        studyPk = insert.insertId;
        const storedImages = await persistStudyImages(studyId, images);
        for (const { image, storedName, storedPath } of storedImages) {
            await database.execute(`INSERT INTO study_images (study_pk, original_name, stored_name, stored_path, mime_type, file_size)
         VALUES (?, ?, ?, ?, ?, ?)`, [studyPk, image.originalname, storedName, storedPath, image.mimetype, image.size]);
        }
        
        if (inference.predictions.length !== 14)
            throw new Error("模型服务没有返回完整的14个类别");
        const connection = await database.getConnection();
        try {
            await connection.beginTransaction();
            for (const prediction of inference.predictions) {
                await connection.execute(`INSERT INTO predictions
           (study_pk, class_id, class_name, class_name_en, probability)
           VALUES (?, ?, ?, ?, ?)`, [studyPk, prediction.class_id, prediction.class_name, prediction.class_name_en, prediction.probability]);
            }
            await connection.execute(`UPDATE studies SET status = 'completed', model_version = ?,
         inference_time_ms = ?, total_time_ms = ? WHERE id = ?`, [inference.model_version, inference.inference_time_ms, performance.now() - startedAt, studyPk]);
            await connection.commit();
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
        response.status(201).json({
            success: true,
            data: { ...inference, database_id: studyPk, total_time_ms: performance.now() - startedAt },
            message: "推理完成并已保存"
        });
    }
    catch (error) {
        if (studyPk) {
            await database.execute("UPDATE studies SET status = 'failed', error_message = ?, total_time_ms = ? WHERE id = ?", [error instanceof Error ? error.message.slice(0, 500) : "未知错误", performance.now() - startedAt, studyPk]).catch(() => undefined);
        }
        next(error);
    }
});
