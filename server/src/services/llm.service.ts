import { env } from "../config/env.js";
import { composeGroundedAnswer, isUnsafeMedicalQuestion, type AssistantIntent, type RagSource } from "./rag.service.js";
import type { ClinicalInfo } from "./clinical-review.service.js";
interface ConversationItem {
    role: "user" | "assistant";
    content: string;
}
interface CompletionResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
    error?: {
        message?: string;
    };
}
export interface GroundedGeneration {
    content: string;
    mode: string;
    model: string;
    validated: boolean;
}
export interface ClinicalStudyContext {
    clinicalInfo?: ClinicalInfo;
    current: {
        created_at: string;
        image_count: number;
        model_version: string;
        predictions: Array<{
            class_name: string;
            class_name_en: string;
            probability: number;
        }>;
    };
    history: Array<{
        created_at: string;
        findings: Array<{
            class_name: string;
            probability: number;
        }>;
    }>;
}
function redactIdentifiers(value: string) {
    return value
        .replace(/\b(?:subject|study)[_-]?[a-z0-9_-]+\b/giu, "[检查标识符]")
        .replace(/\b1[3-9]\d{9}\b/gu, "[电话号码]")
        .replace(/\b\d{17}[\dXx]\b/gu, "[身份号码]");
}
function removeRepeatedDisclaimers(value: string) {
    return value
        .replace(/^(?:当前为|目前为).{0,20}(?:模型|推理).{0,24}(?:演示|参考)[。！]?\s*/u, "")
        .replace(/(?:以上|本回答|以下内容)仅供功能演示[，。；]?/gu, "")
        .trim();
}
function composeFallback(question: string, sources: RagSource[], clinicalContext: ClinicalStudyContext | undefined, intent: AssistantIntent) {
    if (!clinicalContext)
        return composeGroundedAnswer(question, sources);
    if (intent === "knowledge")
        return composeGroundedAnswer(question, sources);
    const clinical = composeClinicalFallback(question, clinicalContext);
    if (intent !== "hybrid" || !sources.length)
        return clinical;
    const knowledge = composeGroundedAnswer(question, sources);
    return `${clinical}\n\n相关系统资料\n${knowledge.replace(/^根据已核对的系统资料：\s*/u, "")}`;
}
function validateAnswer(content: string, question: string, sources: RagSource[], clinicalContext: ClinicalStudyContext | undefined, intent: AssistantIntent) {
    const cleaned = redactIdentifiers(removeRepeatedDisclaimers(content));
    const containsPrescription = /(?:服用|口服|静滴|注射|处方|剂量|每日\s*\d|\d+(?:\.\d+)?\s*(?:mg|g|ml|片|粒))/iu.test(cleaned);
    const unsupportedKnowledge = !clinicalContext && !sources.length && cleaned.length > 180;
    if ((isUnsafeMedicalQuestion(question) && containsPrescription) || unsupportedKnowledge) {
        return { content: composeFallback(question, sources, clinicalContext, intent), validated: false };
    }
    return { content: cleaned, validated: true };
}
export function composeClinicalFallback(question: string, context: ClinicalStudyContext) {
    if (/Grad-CAM|关注区域|热力图|检测框|病灶位置/iu.test(question)) {
    return "Grad-CAM颜色显示网络对所选类别的关注程度，不是病灶检测框，不能确认病灶的位置、范围或严重程度。请结合原始影像和正式报告复核。";
  }
  if (/正常|无异常|低于阈值|没有超过|都没超过/u.test(question)) {
    return "当前这套14类分析不包含‘无异常发现’标签。所有项目低于当前显示阈值，只表示没有项目达到该阈值，不能判定正常或排除疾病。页面阈值只控制突出显示，不改变原始评分，请结合原始影像和正式报告复核。";
  }
  const ranked = [...context.current.predictions]
        .filter((item) => item.class_name !== "无异常发现")
        .sort((a, b) => b.probability - a.probability);
    const notable = ranked.slice(0, 3);
    const findingText = notable.length
        ? notable.map((item) => `${item.class_name} ${(item.probability * 100).toFixed(1)}%`).join("、")
        : "没有可列出的异常类别分数";
    const info = context.clinicalInfo;
    const symptoms = info?.symptoms.join("、") || "未提供";
    const boundary = "模型分数不等于确诊概率；最终结论须由医生结合原始影像和临床资料作出。";
    if (/用药|处方|治疗|手术|确诊|诊断|住院|严重吗|严不严重/u.test(question)) {
        return `不能依据当前模型分数给出个人诊断、严重程度或治疗方案。本次检查的较高模型分数为：${findingText}。请由医生核对原始影像、正式报告和临床资料。${boundary}`;
    }
    if (/既往|历史|以前|对比|相比|变化|趋势/u.test(question)) {
        if (!context.history.length) {
            return `系统内没有这位患者可供比较的既往已完成检查，因此不能判断影像表现是新增、好转还是加重。本次较高的模型分数为：${findingText}。如有院外既往胸片或正式报告，可交由医生人工对照。`;
        }
        const historyText = context.history.slice(0, 3).map((item) => {
            const findings = item.findings.slice(0, 2)
                .map((finding) => `${finding.class_name} ${(finding.probability * 100).toFixed(1)}%`).join("、") || "无可列出的分数";
            return `${item.created_at}：${findings}`;
        }).join("\n");
        return `本次较高的模型分数：${findingText}。\n系统内既往检查：\n${historyText}\n这些是不同检查的模型输出，不能仅凭分数判断病情进展；请由医生对照原始影像、拍摄条件和正式报告。`;
    }
    if (/临床信息|症状|病史|生命体征|还需要|需要补充|核对哪些/u.test(question)) {
        const missing = [
            symptoms === "未提供" ? "主诉和相关症状" : "症状与本次检查是否对应",
            !info || info.duration === "未提供" ? "症状持续时间" : "症状起始和变化过程",
            !info || info.heartLungHistory === "未提供" ? "既往心肺病史" : "既往心肺病史与影像记录",
            !info || info.vitalsReview !== "已核对" ? "生命体征" : "已核对生命体征与当前状态"
        ];
        return `目前已填写：症状 ${symptoms}；持续时间 ${info?.duration ?? "未提供"}；既往心肺病史 ${info?.heartLungHistory ?? "未提供"}；生命体征 ${info?.vitalsReview ?? "未提供"}。\n建议由医生核对：${missing.join("、")}，以及拍摄体位、影像质量和正式报告。未填写不代表正常。`;
    }
    if (/复核|重点|关注|下一步|核查/u.test(question)) {
        return `针对这次检查，可先复核模型分数较高的项目：${findingText}。请医生在原始胸片上核对相应征象，并检查拍摄体位与图像质量；再结合正式报告、症状、生命体征及既往影像判断。这里是审阅顺序提示，不是针对患者的检查或治疗决定。`;
    }
    if (/摘要|总结|概述|汇总|报告|草稿/u.test(question)) {
        return `医生审阅摘要\n本次检查包含 ${context.current.image_count} 张图像。模型分数较高的项目：${findingText}。\n已填写临床信息：症状 ${symptoms}；持续时间 ${info?.duration ?? "未提供"}；既往心肺病史 ${info?.heartLungHistory ?? "未提供"}。系统内${context.history.length ? `有 ${context.history.length} 次` : "没有"}可比较的既往检查。\n待医生核对原始影像、拍摄条件与正式报告。`;
    }
    if (/概率|分数|百分比|含义|解释|怎么看|意味着什么/u.test(question)) {
        return `本次模型分数较高的项目为：${findingText}。百分比表示模型对相应标签的输出分数，不是患者患病概率，也不能单独用于判断严重程度。不同类别的分数可以同时较高，需要医生结合原始影像和临床资料复核。`;
    }
    return `我目前能依据这次已关联的检查回答模型分数、历史记录、待核对的临床信息和医生审阅摘要。你问的“${question.slice(0, 40)}”需要更明确的检查范围，或需要原始影像及正式报告才能可靠回答。本次较高的模型分数为：${findingText}。`;
}
export async function generateGroundedAnswer(question: string, history: ConversationItem[], sources: RagSource[], clinicalContext?: ClinicalStudyContext, intent: AssistantIntent = clinicalContext ? "clinical" : "knowledge"): Promise<GroundedGeneration> {
    const fallback = (): GroundedGeneration => ({
        content: composeFallback(question, sources, clinicalContext, intent),
        mode: "local-rag",
        model: "local-rag",
        validated: true
    });
    if (!env.llm.apiKey || env.llm.provider === "local" ||
        (clinicalContext && (!env.clinicalLlmEnabled || clinicalContext.current.model_version.toLowerCase().includes("mock"))) ||
        (!clinicalContext && isUnsafeMedicalQuestion(question)))
        return fallback();
    const references = sources.length
        ? sources.map((source, index) => `[资料${index + 1}｜${source.title}｜${source.section}]\n${source.excerpt}`).join("\n\n")
        : "没有检索到直接相关的本地资料。";
    const systemPrompt = clinicalContext
        ? [
            "你是面向医生的胸片多标签检查辅助审阅助手，不面向患者直接诊疗。",
        "当前14类没有无异常发现标签，不能由分数低推断正常；Grad-CAM是网络关注区域，不是已确认的病灶检测框。",
            "以下数据已经脱敏，只包含模型概率、检查时间和历史趋势，不包含患者身份或原始胸片。",
            "结构化临床信息来自人工填写；缺失项必须标为未提供，不能自行推断。",
            "若输入数据标记为模拟来源，只在用户询问数据来源、诊断、治疗或风险结论时简洁说明限制；普通问答不要重复模型类型或功能演示说明。",
            "不要在每次回答开头重复系统模式、模型类型、模拟状态或固定免责声明；只在当前问题确有安全风险时说明必要边界。",
            "先直接回答用户当前的问题，只呈现与问题相关的检查数据；不要每次固定输出相同的四段模板。",
            "只能称为模型提示或可能性，不得作出最终诊断、严重程度结论，不得给出具体药物、剂量、处方、手术或治疗方案。",
            "建议下一步只能是由医生结合原始影像与临床资料复核，或在临床指征下考虑相关检查。",
            "不得编造数据中没有的症状、病史、检查结果或患者身份。",
            "引用知识资料时只使用下方检索结果；资料不足必须明确说明。",
            `当前问题类型：${intent}`,
            `脱敏检查数据：\n${JSON.stringify(clinicalContext)}`,
            `检索资料：\n${references}`
        ].join("\n\n")
        : [
            "你是胸片多标签智能筛查系统的使用助手。",
            "优先依据提供的本地资料回答；资料不足时要明确说明，不得编造系统能力或医学事实。",
            "回答应使用简洁清晰的中文，可分点说明并给出可操作步骤。",
            "不要根据胸片、症状或个人描述作出诊断、严重程度判断、用药或治疗建议。",
            "不要索取或复述患者姓名、证件号、手机号等身份信息。",
            `本地资料：\n${references}`
        ].join("\n\n");
    try {
        const response = await fetch(`${env.llm.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.llm.apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: env.llm.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history.slice(-6).map(({ role, content }) => ({ role, content: redactIdentifiers(content) })),
                    { role: "user", content: redactIdentifiers(question) }
                ],
                thinking: { type: "disabled" },
                temperature: 0.2,
                max_tokens: 900
            }),
            signal: AbortSignal.timeout(env.llm.timeoutMs)
        });
        const payload = await response.json() as CompletionResponse;
        const content = payload.choices?.[0]?.message?.content?.trim();
        if (!response.ok || !content)
            throw new Error(payload.error?.message ?? `LLM HTTP ${response.status}`);
        const validated = validateAnswer(content, question, sources, clinicalContext, intent);
        return { content: validated.content, mode: `${env.llm.provider}-rag`, model: env.llm.model, validated: validated.validated };
    }
    catch (error) {
        console.warn(`${env.llm.provider} unavailable, using local RAG:`, error instanceof Error ? error.message : error);
        return fallback();
    }
}
