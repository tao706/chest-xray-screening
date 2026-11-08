import type { BatchTask } from "./batch";
import type { StudySummary } from "./prediction";
export interface DashboardData {
    overview: {
        total_count: number;
        completed_count: number;
        failed_count: number;
        active_count: number;
        today_count: number;
        average_inference_ms: number;
        success_rate: number;
    };
    class_counts: Array<{
        class_id: number;
        class_name: string;
        class_name_en: string;
        count: number;
    }>;
    daily_counts: Array<{
        day: string;
        study_count: number;
        completed_count: number;
        failed_count: number;
    }>;
    recent_studies: StudySummary[];
    recent_tasks: BatchTask[];
    generated_at: string;
}
