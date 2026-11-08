import { Router } from "express";
import { checkDatabase } from "../config/database.js";
import { checkInferenceService } from "../services/inference.service.js";
export const healthRouter = Router();
healthRouter.get("/", async (_request, response) => {
    const checkedAt = new Date().toISOString();
    const [databaseCheck, inferenceCheck] = await Promise.all([
        measure(checkDatabase),
        measure(checkInferenceService)
    ]);
    const database = { ...databaseCheck.result, response_time_ms: databaseCheck.elapsedMs };
    const inference = { ...inferenceCheck.result, response_time_ms: inferenceCheck.elapsedMs };
    const healthy = database.status === "healthy" && inference.status === "healthy";
    response.status(healthy ? 200 : 503).json({
        success: healthy,
        data: {
            express: {
                status: "healthy",
                uptime_seconds: Math.floor(process.uptime()),
                node_version: process.version
            },
            database,
            inference,
            checked_at: checkedAt
        },
        message: healthy ? "所有核心服务正常" : "部分服务尚未就绪"
    });
});
async function measure<T>(operation: () => Promise<T>) {
    const startedAt = performance.now();
    const result = await operation();
    return { result, elapsedMs: Number((performance.now() - startedAt).toFixed(2)) };
}
