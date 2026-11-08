export interface DatasetSummary {
    name: string;
    studyCount: number;
    imageCount: number;
    invalidFileCount: number;
}
export interface BatchTask {
    id: number;
    task_id: string;
    task_name: string;
    dataset_name: string;
    status: "pending" | "scanning" | "running" | "completed" | "failed";
    threshold_value: number;
    total_count: number;
    completed_count: number;
    failed_count: number;
    csv_path: string | null;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}
export interface BatchProgressEvent {
    type: "scan" | "progress" | "warning" | "completed" | "failed";
    taskId: string;
    status: string;
    total: number;
    completed: number;
    failed: number;
    currentStudyId?: string;
    message: string;
}
