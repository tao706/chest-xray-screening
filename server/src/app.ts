import { ImageInputError, ImageGateUnavailableError } from "./services/inference.service.js";
import cors from "cors";
import express from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "./config/env.js";
import { classesRouter } from "./routes/classes.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { studiesRouter } from "./routes/studies.routes.js";
import { tasksRouter } from "./routes/tasks.routes.js";
import { assistantRouter } from "./routes/assistant.routes.js";
import { clinicalReviewsRouter } from "./routes/clinical-reviews.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { requireAuth } from "./middleware/auth.js";
import { ensureAuthSchema } from "./services/auth.service.js";
const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.get("/api", (_request, response) => {
    response.json({ success: true, message: "Chest AI Express API" });
});
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);
app.use("/api/classes", classesRouter);
app.use("/api/studies", studiesRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/assistant/reviews", clinicalReviewsRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api", (_request, response) => {
    response.status(404).json({ success: false, code: "NOT_FOUND", message: "接口不存在" });
});
if (existsSync(path.join(env.frontendDist, "index.html"))) {
    app.use(express.static(env.frontendDist, { index: false, maxAge: "1h" }));
    app.use((request, response, next) => {
        if (request.method === "GET" && request.accepts("html")) {
            response.sendFile(path.join(env.frontendDist, "index.html"));
            return;
        }
        next();
    });
}
app.use((_request, response) => response.status(404).json({ success: false, code: "NOT_FOUND", message: "资源不存在" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ImageGateUnavailableError) {
      response.status(503).json({ success: false, code: error.code, message: error.message });
      return;
    }
    if (error instanceof ImageInputError) {
      response.status(422).json({ success: false, code: error.code, message: error.message });
      return;
    }
    if (error instanceof multer.MulterError) {
        const message = error.code === "LIMIT_FILE_SIZE" ? "单张图片不能超过10MB" : error.message;
        response.status(400).json({ success: false, code: error.code, message });
        return;
    }
    const message = error instanceof Error ? error.message : "服务器内部错误";
    const duplicateStudy = message.includes("uk_studies_study_id") || message.includes("Duplicate entry");
    response.status(duplicateStudy ? 409 : 500).json({
        success: false,
        code: duplicateStudy ? "STUDY_EXISTS" : "INTERNAL_ERROR",
        message: duplicateStudy ? "该Study_id已经存在" : message
    });
});
void ensureAuthSchema().catch((error) => console.error("Auth schema initialization failed:", error));
app.listen(env.port, env.host, () => {
    console.log(`Chest AI server listening on http://${env.host}:${env.port}`);
});
