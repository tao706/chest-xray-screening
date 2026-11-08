import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
import { generateGroundedAnswer, type ClinicalStudyContext } from "../services/llm.service.js";
import { classifyAssistantIntent, retrieveKnowledge } from "../services/rag.service.js";
import { parseClinicalInfo } from "../services/clinical-review.service.js";
export const assistantRouter = Router();
const validId = /^[A-Za-z0-9_-]{1,64}$/;
assistantRouter.get("/patients/:subjectId", async (request, response, next) => {
    const subjectId = String(request.params.subjectId ?? "").trim();
    if (!validId.test(subjectId)) {
        response.status(400).json({ success: false, code: "INVALID_SUBJECT_ID", message: "Subject_id格式不正确" });
        return;
    }
    try {
        const [studies] = await database.execute<RowDataPacket[]>(`SELECT id, subject_id, study_id, status, image_count, model_version, created_at
         FROM studies WHERE subject_id = ? ORDER BY created_at DESC LIMIT 20`, [subjectId]);
        if (!studies.length) {
            response.status(404).json({ success: false, code: "PATIENT_NOT_FOUND", message: "没有找到该Subject_id的检查记录" });
            return;
        }
        const [predictions] = await database.execute<RowDataPacket[]>(`SELECT s.study_id, p.class_name, p.class_name_en, p.probability
         FROM studies s JOIN predictions p ON p.study_pk = s.id
        WHERE s.subject_id = ? ORDER BY s.created_at DESC, p.probability DESC`, [subjectId]);
        const data = studies.map((study) => ({
            subject_id: String(study.subject_id),
            study_id: String(study.study_id),
            status: String(study.status),
            image_count: Number(study.image_count),
            model_version: study.model_version ? String(study.model_version) : null,
            created_at: String(study.created_at),
            top_findings: predictions
                .filter((item) => String(item.study_id) === String(study.study_id))
                .slice(0, 3)
                .map((item) => ({ class_name: String(item.class_name), class_name_en: String(item.class_name_en), probability: Number(item.probability) }))
        }));
        response.json({ success: true, data, message: `找到${data.length}次检查` });
    }
    catch (error) {
        next(error);
    }
});
async function loadClinicalContext(studyId: string, subjectId: string): Promise<ClinicalStudyContext | undefined> {
    if (!validId.test(studyId) || !validId.test(subjectId))
        return undefined;
    const [studies] = await database.execute<RowDataPacket[]>(`SELECT id, subject_id, study_id, image_count, model_version, created_at
       FROM studies WHERE study_id = ? AND subject_id = ? AND status = 'completed' LIMIT 1`, [studyId, subjectId]);
    const study = studies[0];
    if (!study)
        return undefined;
    const [predictions] = await database.execute<RowDataPacket[]>(`SELECT class_name, class_name_en, probability FROM predictions WHERE study_pk = ? ORDER BY probability DESC`, [study.id]);
    const [historyStudies] = await database.execute<RowDataPacket[]>(`SELECT id, created_at FROM studies
      WHERE subject_id = ? AND id <> ? AND status = 'completed'
      ORDER BY created_at DESC LIMIT 4`, [study.subject_id, study.id]);
    const history: ClinicalStudyContext["history"] = [];
    for (const item of historyStudies) {
        const [items] = await database.execute<RowDataPacket[]>(`SELECT class_name, probability FROM predictions WHERE study_pk = ? ORDER BY probability DESC LIMIT 3`, [item.id]);
        history.push({
            created_at: String(item.created_at),
            findings: items.map((prediction) => ({ class_name: String(prediction.class_name), probability: Number(prediction.probability) }))
        });
    }
    return {
        current: {
            created_at: String(study.created_at),
            image_count: Number(study.image_count),
            model_version: String(study.model_version ?? "unknown"),
            predictions: predictions.map((item) => ({ class_name: String(item.class_name), class_name_en: String(item.class_name_en), probability: Number(item.probability) }))
        },
        history
    };
}
assistantRouter.post("/chat", async (request, response) => {
    const question = String(request.body.message ?? "").trim();
    if (!question || question.length > 500) {
        response.status(400).json({ success: false, code: "INVALID_MESSAGE", message: "问题不能为空且不能超过500字" });
        return;
    }
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    let disconnected = false;
    request.on("aborted", () => { disconnected = true; });
    response.on("close", () => { disconnected = true; });
    const send = (event: string, data: unknown) => {
        if (!disconnected)
            response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
        const requestId = randomUUID();
        const studyId = String(request.body.study_id ?? "").trim();
        const subjectId = String(request.body.subject_id ?? "").trim();
        if (studyId && !validId.test(subjectId)) {
            send("error", { message: "当前检查缺少有效的患者关联，请重新选择检查" });
            return;
        }
        const clinicalContext = studyId ? await loadClinicalContext(studyId, subjectId) : undefined;
        if (studyId && !clinicalContext) {
            send("error", { message: "未找到与当前患者匹配的已完成检查，请重新选择检查" });
            return;
        }
        if (request.body.clinical_info !== undefined) {
            const clinicalInfo = parseClinicalInfo(request.body.clinical_info);
            if (!clinicalInfo || !clinicalContext) {
                send("error", { message: "临床信息格式不正确，或尚未选择已完成检查" });
                return;
            }
            clinicalContext.clinicalInfo = clinicalInfo;
        }
        const history = Array.isArray(request.body.history)
            ? request.body.history
                .slice(-8)
                .map((item: unknown) => {
                const candidate = item as {
                    role?: unknown;
                    content?: unknown;
                };
                return {
                    role: candidate.role === "assistant" ? "assistant" : "user",
                    content: String(candidate.content ?? "").trim().slice(0, 500)
                };
            })
                .filter((item: {
                content: string;
            }) => item.content)
            : [];
        const previousQuestion = [...history].reverse().find((item) => item.role === "user")?.content;
        const needsContext = question.length <= 12 || /^(那|它|这个|还有|为什么|怎么|具体)/u.test(question);
        const retrievalQuestion = needsContext && previousQuestion ? `${previousQuestion} ${question}` : question;
        const intent = classifyAssistantIntent(retrievalQuestion, Boolean(clinicalContext));
        const shouldRetrieve = intent === "knowledge" || intent === "hybrid";
        send("status", {
            stage: "retrieving",
            message: shouldRetrieve ? "正在检索并核对相关资料" : "正在整理当前检查与临床信息"
        });
        const sources = shouldRetrieve ? await retrieveKnowledge(retrievalQuestion, 4) : [];
        send("status", { stage: "generating", message: "正在生成有依据的回答并执行安全校验" });
        const generation = await generateGroundedAnswer(question, history, sources, clinicalContext, intent);
        send("meta", {
            request_id: requestId,
            mode: generation.mode,
            model: generation.model,
            intent,
            validated: generation.validated,
            retrieval: sources.length ? "LangChain.js + BM25 + TF-IDF混合检索" : "结构化检查查询",
            sources: sources.map(({ title, section, file, excerpt, score, updated_at, retrieval }) => ({ title, section, file, excerpt, score, updated_at, retrieval }))
        });
        const characters = [...generation.content];
        for (let index = 0; index < characters.length && !disconnected; index += 3) {
            send("token", { content: characters.slice(index, index + 3).join("") });
            await new Promise((resolve) => setTimeout(resolve, 16));
        }
        const suggestions = clinicalContext
            ? [
                "本次检查哪些模型提示值得重点复核？",
                clinicalContext.history.length ? "与既往检查相比有哪些变化？" : "还需要核对哪些临床信息？",
                "请生成简洁的医生审阅摘要"
            ]
            : ["如何查询患者的检查记录？", "模型提示结果应如何解读？", "为什么需要医生复核？"];
        send("done", { request_id: requestId, source_count: sources.length, suggestions });
    }
    catch (error) {
        send("error", { message: error instanceof Error ? error.message : "智能助手暂时不可用" });
    }
    finally {
        if (!disconnected)
            response.end();
    }
});
