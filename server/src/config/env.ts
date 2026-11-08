import "dotenv/config";
import path from "node:path";
export const env = {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:5173",
    inferenceUrl: process.env.INFERENCE_URL ?? "http://127.0.0.1:8000",
    batchDataRoot: path.resolve(process.cwd(), process.env.BATCH_DATA_ROOT ?? "../datasets"),
    uploadRoot: path.resolve(process.cwd(), process.env.UPLOAD_ROOT ?? "uploads"),
    frontendDist: path.resolve(process.cwd(), process.env.FRONTEND_DIST ?? "../frontend/dist"),
    llm: {
        provider: process.env.LLM_PROVIDER ?? "deepseek",
        apiKey: process.env.LLM_API_KEY ?? "",
        baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
        model: process.env.LLM_MODEL ?? "deepseek-flash",
        timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 20000)
    },
    clinicalLlmEnabled: process.env.CLINICAL_LLM_ENABLED === "true",
    auth: {
        demoUsername: process.env.AUTH_DEMO_USERNAME ?? "admin",
        demoPassword: process.env.AUTH_DEMO_PASSWORD ?? "",
        registrationEnabled: process.env.AUTH_ALLOW_REGISTRATION === undefined
            ? ["127.0.0.1", "localhost", "::1"].includes(process.env.HOST ?? "127.0.0.1")
            : process.env.AUTH_ALLOW_REGISTRATION === "true",
        sessionHours: Number(process.env.AUTH_SESSION_HOURS ?? 8),
        cookieSecure: process.env.AUTH_COOKIE_SECURE === "true"
    },
    database: {
        host: process.env.DB_HOST ?? "127.0.0.1",
        port: Number(process.env.DB_PORT ?? 3306),
        user: process.env.DB_USER ?? "root",
        password: process.env.DB_PASSWORD ?? "",
        database: process.env.DB_NAME ?? "chest_xray"
    }
};
