export interface SubmissionPreviewRow {
    Subject_id: string;
    Study_id: string;
    Predict_class: number;
    Probability: number;
}
export interface SubmissionValidation {
    valid: boolean;
    headersValid: boolean;
    rowCount: number;
    expectedStudyCount: number;
    coveredStudyCount: number;
    missingStudyIds: string[];
    duplicateCount: number;
    invalidRowCount: number;
    fallbackStudyCount: number;
    failedStudyCount: number;
    threshold: number;
    errors: string[];
    warnings: string[];
    preview: SubmissionPreviewRow[];
}
