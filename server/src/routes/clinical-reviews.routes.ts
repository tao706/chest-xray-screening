import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
import { buildReviewSections, parseClinicalInfo, parseReviewSections } from "../services/clinical-review.service.js";
import type { ClinicalStudyContext } from "../services/llm.service.js";
export const clinicalReviewsRouter = Router();
const validId = /^[A-Za-z0-9_-]{1,64}$/;
const validReviewId = /^[0-9a-f-]{36}$/i;
let schemaReady: Promise<void> | undefined;
function ensureSchema() {
    schemaReady ??= database.query(`CREATE TABLE IF NOT EXISTS clinical_review_drafts (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    review_id CHAR(36) NOT NULL,
    study_pk BIGINT UNSIGNED NOT NULL,
    author_user_pk BIGINT UNSIGNED NOT NULL,
    clinical_info_json JSON NOT NULL,
    sections_json JSON NOT NULL,
    status ENUM('draft', 'reviewed_demo') NOT NULL DEFAULT 'draft',
    model_version VARCHAR(64) NOT NULL,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_clinical_review_study FOREIGN KEY (study_pk) REFERENCES studies(id) ON DELETE CASCADE,
    CONSTRAINT fk_clinical_review_author FOREIGN KEY (author_user_pk) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_clinical_review_id (review_id),
    KEY idx_clinical_review_study_author (study_pk, author_user_pk, created_at)
  ) ENGINE=InnoDB`).then(() => undefined).catch((error: unknown) => { schemaReady = undefined; throw error; });
    return schemaReady;
}
function parseJson(value: unknown) {
    return typeof value === "string" ? JSON.parse(value) as unknown : value;
}
function publicReview(row: RowDataPacket) {
    return {
        reviewId: String(row.review_id),
        studyId: String(row.study_id),
        status: String(row.status),
        modelVersion: String(row.model_version),
        clinicalInfo: parseJson(row.clinical_info_json),
        sections: parseJson(row.sections_json),
        createdAt: String(row.created_at),
        reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null
    };
}
async function findOwnReview(reviewId: string, userId: number) {
    const [rows] = await database.execute<RowDataPacket[]>(`SELECT r.*, s.study_id FROM clinical_review_drafts r
       JOIN studies s ON s.id = r.study_pk
      WHERE r.review_id = ? AND r.author_user_pk = ? LIMIT 1`, [reviewId, userId]);
    return rows[0];
}
clinicalReviewsRouter.get("/", async (request, response, next) => {
    const studyId = String(request.query.study_id ?? "").trim();
    if (!validId.test(studyId))
        return void response.status(400).json({ success: false, message: "Study_id格式不正确" });
    try {
        await ensureSchema();
        const [rows] = await database.execute<RowDataPacket[]>(`SELECT r.*, s.study_id FROM clinical_review_drafts r
         JOIN studies s ON s.id = r.study_pk
        WHERE s.study_id = ? AND r.author_user_pk = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 1`, [studyId, request.authUser!.id]);
        response.json({ success: true, data: rows[0] ? publicReview(rows[0]) : null });
    }
    catch (error) {
        next(error);
    }
});
clinicalReviewsRouter.post("/", async (request, response, next) => {
    if (request.authUser?.role === "viewer")
        return void response.status(403).json({ success: false, message: "只读账号不能创建审阅草稿" });
    const studyId = String(request.body.study_id ?? "").trim();
    const clinicalInfo = parseClinicalInfo(request.body.clinical_info);
    if (!validId.test(studyId) || !clinicalInfo)
        return void response.status(400).json({ success: false, message: "检查或临床信息格式不正确" });
    try {
        await ensureSchema();
        const [studies] = await database.execute<RowDataPacket[]>("SELECT id, subject_id, study_id, image_count, model_version, created_at FROM studies WHERE study_id = ? AND status = 'completed' LIMIT 1", [studyId]);
        const study = studies[0];
        if (!study)
            return void response.status(404).json({ success: false, message: "未找到已完成的检查" });
        const [predictions] = await database.execute<RowDataPacket[]>("SELECT class_name, class_name_en, probability FROM predictions WHERE study_pk = ? ORDER BY probability DESC", [study.id]);
        const [history] = await database.execute<RowDataPacket[]>("SELECT created_at FROM studies WHERE subject_id = ? AND id <> ? AND status = 'completed' ORDER BY created_at DESC LIMIT 4", [study.subject_id, study.id]);
        const context: ClinicalStudyContext = {
            current: {
                created_at: String(study.created_at), image_count: Number(study.image_count),
                model_version: String(study.model_version ?? "unknown"),
                predictions: predictions.map((item) => ({ class_name: String(item.class_name), class_name_en: String(item.class_name_en), probability: Number(item.probability) }))
            },
            history: history.map((item) => ({ created_at: String(item.created_at), findings: [] }))
        };
        const reviewId = randomUUID();
        const sections = buildReviewSections(context, clinicalInfo);
        await database.execute<ResultSetHeader>("INSERT INTO clinical_review_drafts (review_id, study_pk, author_user_pk, clinical_info_json, sections_json, model_version) VALUES (?, ?, ?, ?, ?, ?)", [reviewId, study.id, request.authUser!.id, JSON.stringify(clinicalInfo), JSON.stringify(sections), context.current.model_version]);
        const row = await findOwnReview(reviewId, request.authUser!.id);
        response.status(201).json({ success: true, data: publicReview(row!), message: "审阅草稿已生成" });
    }
    catch (error) {
        next(error);
    }
});
clinicalReviewsRouter.put("/:reviewId", async (request, response, next) => {
    if (request.authUser?.role === "viewer")
        return void response.status(403).json({ success: false, message: "只读账号不能编辑审阅草稿" });
    const reviewId = String(request.params.reviewId ?? "");
    const sections = parseReviewSections(request.body.sections);
    if (!validReviewId.test(reviewId) || !sections)
        return void response.status(400).json({ success: false, message: "草稿内容格式不正确" });
    try {
        await ensureSchema();
        const row = await findOwnReview(reviewId, request.authUser!.id);
        if (!row)
            return void response.status(404).json({ success: false, message: "审阅草稿不存在" });
        if (row.status !== "draft")
            return void response.status(409).json({ success: false, message: "已审阅草稿不能修改" });
        await database.execute("UPDATE clinical_review_drafts SET sections_json = ? WHERE id = ?", [JSON.stringify(sections), row.id]);
        response.json({ success: true, data: publicReview((await findOwnReview(reviewId, request.authUser!.id))!), message: "草稿已保存" });
    }
    catch (error) {
        next(error);
    }
});
clinicalReviewsRouter.post("/:reviewId/confirm", async (request, response, next) => {
    if (request.authUser?.role === "viewer")
        return void response.status(403).json({ success: false, message: "只读账号不能确认审阅" });
    const reviewId = String(request.params.reviewId ?? "");
    const sections = parseReviewSections(request.body.sections);
    if (!validReviewId.test(reviewId) || !sections || request.body.acknowledged !== true) {
        return void response.status(400).json({ success: false, message: "请确认已人工审阅草稿" });
    }
    try {
        await ensureSchema();
        const row = await findOwnReview(reviewId, request.authUser!.id);
        if (!row)
            return void response.status(404).json({ success: false, message: "审阅草稿不存在" });
        if (row.status !== "draft")
            return void response.status(409).json({ success: false, message: "该草稿已标记为审阅" });
        await database.execute("UPDATE clinical_review_drafts SET sections_json = ?, status = 'reviewed_demo', reviewed_at = NOW() WHERE id = ?", [JSON.stringify(sections), row.id]);
        response.json({ success: true, data: publicReview((await findOwnReview(reviewId, request.authUser!.id))!), message: "已标记人工审阅（演示记录，非正式医疗报告）" });
    }
    catch (error) {
        next(error);
    }
});
