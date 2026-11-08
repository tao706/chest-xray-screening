import type { HealthResult } from "@/types/health";
export async function getSystemHealth(): Promise<HealthResult> {
    const startedAt = performance.now();
    const response = await fetch("/api/health", {
        cache: "no-store",
        credentials: "include"
    });
    const payload = await response.json() as Omit<HealthResult, "browserResponseMs">;
    if (!payload.data)
        throw new Error(payload.message || `健康检查失败(HTTP ${response.status})`);
    return {
        ...payload,
        browserResponseMs: Number((performance.now() - startedAt).toFixed(2))
    };
}
