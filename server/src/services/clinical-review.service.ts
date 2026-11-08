import type { ClinicalStudyContext } from "./llm.service.js";
export const symptomOptions = ["咳嗽", "发热", "胸痛", "呼吸困难", "咳痰", "无明显症状"] as const;
export const durationOptions = ["未提供", "3天以内", "3至14天", "超过14天"] as const;
export const historyOptions = ["未提供", "有", "无"] as const;
export const vitalsOptions = ["未提供", "已核对", "待核对"] as const;
export interface ClinicalInfo {
    symptoms: string[];
    duration: string;
    heartLungHistory: string;
    vitalsReview: string;
}
export interface ReviewSections {
    modelFindings: string;
    reviewPoints: string;
    missingInformation: string;
    nextChecks: string;
}
export function parseClinicalInfo(value: unknown): ClinicalInfo | null {
    if (!value || typeof value !== "object")
        return null;
    const input = value as Record<string, unknown>;
    if (!Array.isArray(input.symptoms) || input.symptoms.length > symptomOptions.length ||
        !input.symptoms.every((item) => typeof item === "string" && symptomOptions.includes(item as typeof symptomOptions[number])))
        return null;
    if (!durationOptions.includes(input.duration as typeof durationOptions[number]) ||
        !historyOptions.includes(input.heartLungHistory as typeof historyOptions[number]) ||
        !vitalsOptions.includes(input.vitalsReview as typeof vitalsOptions[number]))
        return null;
    const symptoms = [...new Set(input.symptoms as string[])];
    if (symptoms.includes("无明显症状") && symptoms.length > 1)
        return null;
    return {
        symptoms,
        duration: String(input.duration),
        heartLungHistory: String(input.heartLungHistory),
        vitalsReview: String(input.vitalsReview)
    };
}
export function buildReviewSections(context: ClinicalStudyContext, info: ClinicalInfo): ReviewSections {
    const ranked = [...context.current.predictions]
        .filter((item) => item.class_name !== "无异常发现")
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 3);
    const mock = context.current.model_version.toLowerCase().includes("mock");
    const findings = ranked.length
        ? ranked.map((item) => `${item.class_name}：模型分数 ${(item.probability * 100).toFixed(1)}%`).join("；")
        : "未取得可列出的异常类别分数";
    const missing = [
        info.symptoms.length ? "" : "症状信息未提供",
        info.duration === "未提供" ? "症状持续时间未提供" : "",
        info.heartLungHistory === "未提供" ? "既往心肺病史未核对" : "",
        info.vitalsReview !== "已核对" ? "生命体征尚需核对" : ""
    ].filter(Boolean);
    return {
        modelFindings: `${mock ? "【模拟推理，仅供功能演示】" : "【模型提示，非诊断】"}本次检查 ${context.current.image_count} 张图像。${findings}。模型分数不等于患病概率。`,
        reviewPoints: `请由医生核对原始影像、拍摄体位与正式报告，并复核上述模型提示。已录入症状：${info.symptoms.join("、") || "未提供"}；持续时间：${info.duration}；既往心肺病史：${info.heartLungHistory}。${context.history.length ? `系统内有 ${context.history.length} 次既往检查可供人工对比。` : "系统内没有可供比较的既往检查。"}`,
        missingInformation: missing.length ? missing.join("；") + "。" : "结构化信息已填写；仍应核对与本次检查相关的完整临床资料。",
        nextChecks: mock
            ? "当前胸片推理为模拟模型，不能依据本草稿作出任何针对患者的检查、诊断或治疗决定。待真实模型和临床验证完成后，再由医生判断下一步。"
            : "由医生结合原始影像、症状、生命体征与既往资料判断是否需要进一步检查；本草稿不提供具体检查指令、处方或治疗方案。"
    };
}
export function parseReviewSections(value: unknown): ReviewSections | null {
    if (!value || typeof value !== "object")
        return null;
    const input = value as Record<string, unknown>;
    const keys = ["modelFindings", "reviewPoints", "missingInformation", "nextChecks"] as const;
    if (!keys.every((key) => typeof input[key] === "string" && String(input[key]).trim().length > 0 && String(input[key]).length <= 2000))
        return null;
    return Object.fromEntries(keys.map((key) => [key, String(input[key]).trim()])) as unknown as ReviewSections;
}
