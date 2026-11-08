import { requestJson } from "./http";
import type { DashboardData } from "@/types/dashboard";
import type { ApiResponse } from "@/types/prediction";
export async function getDashboard() {
    const response = await requestJson<ApiResponse<DashboardData>>("/api/dashboard");
    const data = response.data;
    return {
        ...data,
        recent_studies: data.recent_studies.map((study) => ({
            ...study,
            image_count: Number(study.image_count),
            inference_time_ms: study.inference_time_ms === null ? null : Number(study.inference_time_ms),
            total_time_ms: study.total_time_ms === null || study.total_time_ms === undefined ? null : Number(study.total_time_ms),
            top_probability: study.top_probability === null ? null : Number(study.top_probability)
        })),
        recent_tasks: data.recent_tasks.map((task) => ({
            ...task,
            threshold_value: Number(task.threshold_value ?? 0.5),
            total_count: Number(task.total_count),
            completed_count: Number(task.completed_count),
            failed_count: Number(task.failed_count)
        }))
    };
}
