export interface InferencePrediction {
    class_id: number;
    class_name: string;
    class_name_en: string;
    probability: number;
}
export interface InferenceResponse {
    success: true;
    subject_id: string;
    study_id: string;
    model_version: string;
    inference_time_ms: number;
    image_count: number;
    predictions: InferencePrediction[];
}
