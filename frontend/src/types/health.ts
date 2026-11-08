export type ServiceStatus = "healthy" | "unavailable";
export interface HealthData {
    express: {
        status: ServiceStatus;
        uptime_seconds: number;
        node_version: string;
    };
    database: {
        status: ServiceStatus;
        response_time_ms: number;
        message?: string;
    };
    inference: {
        status: ServiceStatus;
        response_time_ms: number;
        message?: string;
        data?: {
            status: string;
            model_ready: boolean;
            model_version: string;
            device: string;
            is_mock?: boolean;
        };
    };
    checked_at: string;
}
export interface HealthResult {
    success: boolean;
    data: HealthData;
    message: string;
    browserResponseMs: number;
}
