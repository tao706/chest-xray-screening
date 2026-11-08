import { requestJson } from "./http";
import type { ApiResponse } from "@/types/prediction";
import type { AssistantEvent, AssistantHistoryItem, ClinicalInfo, ClinicalReview, PatientStudySummary, ReviewSections } from "@/types/assistant";
export async function getPatientStudies(subjectId: string) {
    const response = await requestJson<ApiResponse<PatientStudySummary[]>>(`/api/assistant/patients/${encodeURIComponent(subjectId)}`);
    return response.data.map((study) => ({
        ...study,
        image_count: Number(study.image_count),
        top_findings: study.top_findings.map((item) => ({ ...item, probability: Number(item.probability) }))
    }));
}
export async function streamAssistantMessage(message: string, history: AssistantHistoryItem[], studyId: string | undefined, subjectId: string | undefined, clinicalInfo: ClinicalInfo | undefined, signal: AbortSignal, onEvent: (event: AssistantEvent) => void) {
    const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message, history, study_id: studyId, subject_id: subjectId, clinical_info: clinicalInfo }),
        signal,
        credentials: "include"
    });
    if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => undefined) as {
            message?: string;
        } | undefined;
        throw new Error(payload?.message ?? `智能助手请求失败（HTTP ${response.status}）`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done }).replaceAll("\r", "");
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
            const eventName = block.match(/^event:\s*(.+)$/m)?.[1];
            const dataText = block.match(/^data:\s*(.+)$/m)?.[1];
            if (!eventName || !dataText)
                continue;
            onEvent({ type: eventName, data: JSON.parse(dataText) } as AssistantEvent);
            if (eventName === "done" || eventName === "error")
                finished = true;
        }
        if (done)
            break;
    }
    if (!finished)
        throw new Error("回答连接提前中断，请重新提问");
}
export async function getLatestReview(studyId: string) {
    const response = await requestJson<ApiResponse<ClinicalReview | null>>(`/api/assistant/reviews?study_id=${encodeURIComponent(studyId)}`);
    return response.data;
}
export async function createReview(studyId: string, clinicalInfo: ClinicalInfo) {
    const response = await requestJson<ApiResponse<ClinicalReview>>("/api/assistant/reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ study_id: studyId, clinical_info: clinicalInfo })
    });
    return response.data;
}
export async function saveReview(reviewId: string, sections: ReviewSections) {
    const response = await requestJson<ApiResponse<ClinicalReview>>(`/api/assistant/reviews/${encodeURIComponent(reviewId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections })
    });
    return response.data;
}
export async function confirmReview(reviewId: string, sections: ReviewSections) {
    const response = await requestJson<ApiResponse<ClinicalReview>>(`/api/assistant/reviews/${encodeURIComponent(reviewId)}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections, acknowledged: true })
    });
    return response.data;
}
