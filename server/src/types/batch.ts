export interface DatasetStudy {
    subjectId: string;
    studyId: string;
    imagePaths: string[];
}
export interface DatasetSummary {
    name: string;
    studyCount: number;
    imageCount: number;
    invalidFileCount: number;
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
