export interface AssistantSource {
    title: string;
    section?: string;
    file: string;
    excerpt: string;
    score: number;
    updated_at?: string;
    retrieval?: "hybrid";
}
export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources?: AssistantSource[];
    streaming?: boolean;
    error?: boolean;
    createdAt?: string;
    mode?: string;
    model?: string;
    sourceCount?: number;
    responseTimeMs?: number;
    retrieval?: string;
    validated?: boolean;
}
export interface AssistantHistoryItem {
    role: "user" | "assistant";
    content: string;
}
export interface ClinicalInfo {
    symptoms: string[];
    duration: "未提供" | "3天以内" | "3至14天" | "超过14天";
    heartLungHistory: "未提供" | "有" | "无";
    vitalsReview: "未提供" | "已核对" | "待核对";
}
export interface ReviewSections {
    modelFindings: string;
    reviewPoints: string;
    missingInformation: string;
    nextChecks: string;
}
export interface ClinicalReview {
    reviewId: string;
    studyId: string;
    status: "draft" | "reviewed_demo";
    modelVersion: string;
    clinicalInfo: ClinicalInfo;
    sections: ReviewSections;
    createdAt: string;
    reviewedAt: string | null;
}
export interface PatientStudySummary {
    subject_id: string;
    study_id: string;
    status: string;
    image_count: number;
    model_version: string | null;
    created_at: string;
    top_findings: Array<{
        class_name: string;
        class_name_en: string;
        probability: number;
    }>;
}
export type AssistantEvent = {
    type: "status";
    data: {
        stage: "retrieving" | "generating";
        message: string;
    };
} | {
    type: "meta";
    data: {
        request_id: string;
        mode: string;
        model?: string;
        intent?: string;
        validated?: boolean;
        retrieval?: string;
        sources: AssistantSource[];
    };
} | {
    type: "token";
    data: {
        content: string;
    };
} | {
    type: "done";
    data: {
        request_id: string;
        source_count: number;
        suggestions?: string[];
    };
} | {
    type: "error";
    data: {
        message: string;
    };
};
