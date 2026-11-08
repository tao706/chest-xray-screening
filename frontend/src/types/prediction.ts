export interface Prediction {
    class_id: number;
    class_name: string;
    class_name_en: string;
    probability: number;
}
export interface PredictionResult {
    database_id?: number;
    subject_id: string;
    study_id: string;
    model_version: string;
    inference_time_ms: number;
    total_time_ms: number;
    image_count: number;
    predictions: Prediction[];
    created_at?: string;
    status?: string;
    error_message?: string | null;
    updated_at?: string;
    images?: StudyImage[];
}
export interface GradcamResult {
    success: boolean;
    class_id: number;
    method: string;
    is_mock: boolean;
    heatmap_mime_type: string;
    heatmap_base64: string;
}
export interface StudyImage {
    id: number;
    original_name: string;
    mime_type: string;
    file_size: number;
    width: number | null;
    height: number | null;
    created_at: string;
}
export interface StudySummary {
    id: number;
    subject_id: string;
    study_id: string;
    status: "pending" | "processing" | "completed" | "failed";
    image_count: number;
    model_version: string | null;
    inference_time_ms: number | null;
    total_time_ms: number | null;
    error_message: string | null;
    top_class_name: string | null;
    top_probability: number | null;
    created_at: string;
    updated_at: string;
}
export interface StudyListResult {
    items: StudySummary[];
    page: number;
    page_size: number;
    total: number;
}
export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message: string;
    code?: string;
}
