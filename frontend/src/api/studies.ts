import { requestJson } from "./http";
import type { ApiResponse, GradcamResult, Prediction, PredictionResult, StudyListResult } from "@/types/prediction";
export interface PredictStudyInput {
    subjectId: string;
    studyId: string;
    note?: string;
    images: File[];
}
function normalizeResult(result: PredictionResult): PredictionResult {
    return {
        ...result,
        inference_time_ms: Number(result.inference_time_ms ?? 0),
        total_time_ms: Number(result.total_time_ms ?? 0),
        image_count: Number(result.image_count ?? 0),
        predictions: result.predictions.map((item) => ({
            ...item,
            class_id: Number(item.class_id),
            probability: Number(item.probability)
        })),
        images: result.images?.map((image) => ({ ...image, id: Number(image.id), file_size: Number(image.file_size) }))
    };
}
export async function predictStudy(input: PredictStudyInput): Promise<PredictionResult> {
    const formData = new FormData();
    formData.append("subject_id", input.subjectId);
    formData.append("study_id", input.studyId);
    if (input.note)
        formData.append("note", input.note);
    input.images.forEach((image) => formData.append("images", image));
    const response = await requestJson<ApiResponse<PredictionResult>>("/api/studies/predict", {
        method: "POST",
        body: formData
    });
    return normalizeResult(response.data);
}
export async function getStudy(studyId: string): Promise<PredictionResult> {
    const response = await requestJson<ApiResponse<PredictionResult>>(`/api/studies/${encodeURIComponent(studyId)}`);
    return normalizeResult(response.data);
}
export interface StudyListQuery {
    page?: number;
    pageSize?: number;
    subjectId?: string;
    studyId?: string;
    status?: string;
}
export async function getStudies(query: StudyListQuery = {}): Promise<StudyListResult> {
    const search = new URLSearchParams();
    search.set("page", String(query.page ?? 1));
    search.set("page_size", String(query.pageSize ?? 20));
    if (query.subjectId)
        search.set("subject_id", query.subjectId);
    if (query.studyId)
        search.set("study_id", query.studyId);
    if (query.status)
        search.set("status", query.status);
    const response = await requestJson<ApiResponse<StudyListResult>>(`/api/studies?${search}`);
    return {
        ...response.data,
        items: response.data.items.map((item) => ({
            ...item,
            image_count: Number(item.image_count),
            inference_time_ms: item.inference_time_ms === null ? null : Number(item.inference_time_ms),
            total_time_ms: item.total_time_ms === null ? null : Number(item.total_time_ms),
            top_probability: item.top_probability === null ? null : Number(item.top_probability)
        }))
    };
}
export async function deleteStudy(studyId: string): Promise<void> {
    await requestJson<ApiResponse<null>>(`/api/studies/${encodeURIComponent(studyId)}`, { method: "DELETE" });
}
export function getStudyImageUrl(studyId: string, imageId: number) {
    return `/api/studies/${encodeURIComponent(studyId)}/images/${imageId}`;
}
export async function getImagePredictions(studyId: string, imageId: number): Promise<Prediction[]> {
    const response = await requestJson<ApiResponse<Prediction[]>>(`/api/studies/${encodeURIComponent(studyId)}/images/${imageId}/predictions`);
    return response.data.map((item) => ({ ...item, class_id: Number(item.class_id), probability: Number(item.probability) }));
}
export async function getGradcam(studyId: string, imageId: number, classId: number) {
    const search = new URLSearchParams({ image_id: String(imageId), class_id: String(classId) });
    const response = await requestJson<ApiResponse<GradcamResult>>(`/api/studies/${encodeURIComponent(studyId)}/gradcam?${search}`);
    return response.data;
}

export async function validateStudyImage(file: File) {
  const body = new FormData();
  body.append("images", file);
  return requestJson<ApiResponse<{ accepted: boolean }>>("/api/studies/validate-image", { method: "POST", body, signal: AbortSignal.timeout(20000) });
}
