import { requestJson } from "./http";
import type { ApiResponse } from "@/types/prediction";
import type { BatchTask, DatasetSummary } from "@/types/batch";
import type { SubmissionValidation } from "@/types/submission";
export async function getDatasets() {
    const response = await requestJson<ApiResponse<DatasetSummary[]>>("/api/tasks/datasets");
    return response.data;
}
export async function scanDataset(name: string) {
    const response = await requestJson<ApiResponse<DatasetSummary>>(`/api/tasks/datasets/${encodeURIComponent(name)}/scan`);
    return response.data;
}
export async function getBatchTasks() {
    const response = await requestJson<ApiResponse<BatchTask[]>>("/api/tasks");
    return response.data.map(normalizeTask);
}
export async function createBatchTask(input: {
    taskName: string;
    datasetName: string;
    threshold: number;
}) {
    const response = await requestJson<ApiResponse<{
        task_id: string;
    }>>("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_name: input.taskName, dataset_name: input.datasetName, threshold: input.threshold })
    });
    return response.data;
}
export async function getBatchTask(taskId: string) {
    const response = await requestJson<ApiResponse<BatchTask>>(`/api/tasks/${encodeURIComponent(taskId)}`);
    return normalizeTask(response.data);
}
export async function deleteBatchTask(taskId: string) {
    await requestJson<ApiResponse<{
        deleted_count: number;
    }>>(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
}
export async function deleteBatchTasks(taskIds: string[]) {
    await requestJson<ApiResponse<{
        deleted_count: number;
    }>>("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_ids: taskIds })
    });
}
export async function generateSubmission(taskId: string, threshold: number) {
    const response = await requestJson<ApiResponse<SubmissionValidation>>(`/api/tasks/${encodeURIComponent(taskId)}/submission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold })
    });
    return response.data;
}
export async function validateSubmission(taskId: string) {
    const response = await requestJson<ApiResponse<SubmissionValidation>>(`/api/tasks/${encodeURIComponent(taskId)}/submission/validate`);
    return response.data;
}
export function getSubmissionDownloadUrl(taskId: string) {
    return `/api/tasks/${encodeURIComponent(taskId)}/submission/download`;
}
function normalizeTask(task: BatchTask): BatchTask {
    return {
        ...task,
        threshold_value: Number(task.threshold_value),
        total_count: Number(task.total_count),
        completed_count: Number(task.completed_count),
        failed_count: Number(task.failed_count)
    };
}
