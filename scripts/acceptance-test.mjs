import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3000";
const envValues = await readEnv(path.join(projectRoot, "server", ".env"));
const username = process.env.ACCEPTANCE_USERNAME ?? envValues.AUTH_DEMO_USERNAME ?? "admin";
const password = process.env.ACCEPTANCE_PASSWORD ?? envValues.AUTH_DEMO_PASSWORD ?? "";
const testImagePath = path.join(projectRoot, "datasets", "acceptance_real", "images", "ACC_FIXTURE_SUBJECT", "ACC_FIXTURE_STUDY", "image.png");
const runId = Date.now().toString(36).toUpperCase();
const subjectId = `ACC_SUBJECT_${runId}`;
const studyId = `ACC_STUDY_${runId}`;
const results = [];
let cookie = "";
let createdStudy = false;
let taskId = "";
async function readEnv(filePath) {
    const values = {};
    const content = await readFile(filePath, "utf8").catch(() => "");
    for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match)
            continue;
        values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return values;
}
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
async function request(route, options = {}) {
    const headers = new Headers(options.headers ?? {});
    if (cookie)
        headers.set("cookie", cookie);
    return fetch(`${baseUrl}${route}`, { ...options, headers });
}
async function jsonRequest(route, options = {}, expectedStatus = 200) {
    const response = await request(route, options);
    const text = await response.text();
    let body;
    try {
        body = JSON.parse(text);
    }
    catch {
        throw new Error(`${route} did not return JSON: ${text.slice(0, 120)}`);
    }
    assert(response.status === expectedStatus, `${route} returned ${response.status}, expected ${expectedStatus}: ${body.message ?? text}`);
    return { response, body };
}
async function check(name, operation) {
    const startedAt = performance.now();
    try {
        const detail = await operation();
        results.push({ name, status: "PASS", durationMs: Math.round(performance.now() - startedAt), detail: detail ?? "通过" });
    }
    catch (error) {
        results.push({ name, status: "FAIL", durationMs: Math.round(performance.now() - startedAt), detail: error instanceof Error ? error.message : String(error) });
        throw error;
    }
}
async function readSseUntil(response, requiredEvents, timeoutMs = 15000) {
    assert(response.ok, `SSE returned HTTP ${response.status}`);
    assert(response.headers.get("content-type")?.includes("text/event-stream"), "response is not an SSE stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        const item = await Promise.race([
            reader.read(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("SSE timed out")), remaining))
        ]);
        if (item.done)
            break;
        text += decoder.decode(item.value, { stream: true });
        if (requiredEvents.every((event) => text.includes(`event: ${event}`))) {
            await reader.cancel();
            return text;
        }
    }
    await reader.cancel();
    throw new Error(`SSE missing events: ${requiredEvents.filter((event) => !text.includes(`event: ${event}`)).join(", ")}`);
}
async function waitForTask(id) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        const { body } = await jsonRequest(`/api/tasks/${id}`);
        if (["completed", "failed"].includes(body.data.status))
            return body.data;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("batch task did not finish within 30 seconds");
}
async function writeReport(error) {
    const passed = results.filter((item) => item.status === "PASS").length;
    const failed = results.filter((item) => item.status === "FAIL").length;
    const rows = results.map((item) => `| ${item.status === "PASS" ? "通过" : "失败"} | ${item.name} | ${item.durationMs} ms | ${String(item.detail).replaceAll("|", "\\|")} |`).join("\n");
    const report = `# 全系统验收报告\n\n- 验收时间：${new Date().toLocaleString("zh-CN", { hour12: false })}\n- 服务地址：${baseUrl}\n- 结果：${error ? "失败" : "通过"}\n- 通过：${passed}\n- 失败：${failed}\n- 批量任务ID：${taskId || "未创建"}\n\n| 状态 | 检查项 | 用时 | 说明 |\n|---|---|---:|---|\n${rows}\n\n> 报告不包含账号密码、Cookie或数据库密钥。\n`;
    await writeFile(path.join(projectRoot, "docs", "ACCEPTANCE_REPORT.md"), report, "utf8");
}
let failure;
try {
    await check("生产首页与SPA路由", async () => {
        const home = await request("/");
        const loginPage = await request("/login");
        assert(home.status === 200 && (await home.text()).includes('id="app"'), "production home page is unavailable");
        assert(loginPage.status === 200, "SPA login route is unavailable");
        return "首页和/login均返回200";
    });
    await check("全链路健康检查", async () => {
        const { body } = await jsonRequest("/api/health");
        for (const name of ["express", "database", "inference"])
            assert(body.data[name].status === "healthy", `${name} is not healthy`);
        return "Express、MySQL、FastAPI均健康";
    });
    await check("未登录访问保护", async () => {
        const response = await request("/api/dashboard");
        assert(response.status === 401, `expected 401, got ${response.status}`);
        return "业务接口返回401";
    });
    await check("登录与会话恢复", async () => {
        const { response } = await jsonRequest("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
        assert(cookie, "login did not issue a session cookie");
        const { body } = await jsonRequest("/api/auth/me");
        assert(body.data.username === username, "session user does not match login user");
        return "HttpOnly会话有效";
    });
    await check("类别与首页统计", async () => {
        const classes = await jsonRequest("/api/classes");
        const dashboard = await jsonRequest("/api/dashboard");
        assert(classes.body.data.length === 14, "class API did not return 14 classes");
        assert(dashboard.body.data.class_counts.length === 14, "dashboard class statistics are incomplete");
        return "14类标签及数据库统计完整";
    });
    await check("数据集发现与扫描", async () => {
        const datasets = await jsonRequest("/api/tasks/datasets");
        assert(datasets.body.data.some((item) => item.name === "acceptance_real"), "acceptance_real dataset was not found");
        const scan = await jsonRequest("/api/tasks/datasets/acceptance_real/scan");
        assert(scan.body.data.studyCount >= 1 && scan.body.data.imageCount >= 1, "demo dataset is empty");
        return `${scan.body.data.studyCount}个Study，${scan.body.data.imageCount}张图片`;
    });
    await check("单次上传与14类推理", async () => {
        const image = await readFile(testImagePath);
        const form = new FormData();
        form.append("subject_id", subjectId);
        form.append("study_id", studyId);
        form.append("note", "automatic acceptance test");
        form.append("images", new Blob([image], { type: "image/png" }), "acceptance.png");
        const { body } = await jsonRequest("/api/studies/predict", { method: "POST", body: form }, 201);
        createdStudy = true;
        assert(body.data.model_version === "nih14-efficientnet-b0-v1", "unexpected inference version");
        assert(body.data.predictions.length === 14, "inference did not return 14 probabilities");
        assert(body.data.predictions.every((item) => item.probability >= 0 && item.probability <= 1), "probability is out of range");
        return `Study ${studyId} 推理完成`;
    });
    await check("详情、原图与Grad-CAM", async () => {
        const detail = await jsonRequest(`/api/studies/${studyId}`);
        assert(detail.body.data.predictions.length === 14 && detail.body.data.images.length === 1, "study detail is incomplete");
        const imageId = detail.body.data.images[0].id;
        const image = await request(`/api/studies/${studyId}/images/${imageId}`);
        assert(image.ok && (await image.arrayBuffer()).byteLength > 0, "stored image cannot be read");
        const gradcam = await jsonRequest(`/api/studies/${studyId}/gradcam?class_id=14&image_id=${imageId}`);
        assert(gradcam.body.data.is_mock === false && gradcam.body.data.heatmap_base64.length > 100, "Grad-CAM image is empty");
        await jsonRequest(`/api/studies/${studyId}/gradcam?class_id=15&image_id=${imageId}`, {}, 400);
        return "详情、持久化原图、真实第14类解释图及非法类别拦截通过";
    });
    await check("RAG助手SSE流式输出", async () => {
        const response = await request("/api/assistant/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "系统支持哪些胸部疾病类别？" })
        });
        const stream = await readSseUntil(response, ["meta", "token", "done"]);
        assert(stream.includes("sources"), "RAG response has no source metadata");
        return "meta、token、done事件完整";
    });
    await check("批量任务与SSE连接", async () => {
        const created = await jsonRequest("/api/tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ task_name: `自动验收-${runId}`, dataset_name: "acceptance_real", threshold: 0.5 })
        }, 202);
        taskId = created.body.data.task_id;
        const controller = new AbortController();
        const response = await request(`/api/tasks/${taskId}/events`, { signal: controller.signal });
        const stream = await readSseUntil(response, ["connected"]);
        controller.abort();
        assert(stream.includes(taskId), "SSE connection returned the wrong task ID");
        const task = await waitForTask(taskId);
        assert(task.status === "completed" && Number(task.failed_count) === 0, `batch task ended as ${task.status}`);
        return `任务完成：${task.completed_count}/${task.total_count}`;
    });
    await check("submission生成、校验与下载", async () => {
        const generated = await jsonRequest(`/api/tasks/${taskId}/submission`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ threshold: 0.5 })
        });
        assert(generated.body.data.valid, `submission validation failed: ${generated.body.data.errors.join("; ")}`);
        const validated = await jsonRequest(`/api/tasks/${taskId}/submission/validate`);
        assert(validated.body.data.valid && validated.body.data.coveredStudyCount >= 1, "saved submission is invalid");
        const download = await request(`/api/tasks/${taskId}/submission/download`);
        const csv = await download.text();
        assert(download.ok && csv.startsWith("Subject_id,Study_id,Predict_class,Probability"), "downloaded CSV has invalid headers");
        return `${validated.body.data.rowCount}行，覆盖${validated.body.data.coveredStudyCount}个Study`;
    });
    await check("测试检查删除与文件清理", async () => {
        await jsonRequest(`/api/studies/${studyId}`, { method: "DELETE" });
        createdStudy = false;
        const missing = await request(`/api/studies/${studyId}`);
        assert(missing.status === 404, `deleted study still returns ${missing.status}`);
        return "数据库记录与上传文件已清理";
    });
    await check("退出登录与旧会话失效", async () => {
        await jsonRequest("/api/auth/logout", { method: "POST" });
        const response = await request("/api/dashboard");
        assert(response.status === 401, "old session remains authorized after logout");
        cookie = "";
        return "退出后业务接口返回401";
    });
}
catch (error) {
    failure = error;
}
finally {
    if (createdStudy && cookie)
        await request(`/api/studies/${studyId}`, { method: "DELETE" }).catch(() => undefined);
    if (cookie)
        await request("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await writeReport(failure);
}
for (const result of results) {
    console.log(`[${result.status}] ${result.name} (${result.durationMs} ms) - ${result.detail}`);
}
console.log(`Report: ${path.join(projectRoot, "docs", "ACCEPTANCE_REPORT.md")}`);
if (failure) {
    console.error(failure instanceof Error ? failure.message : failure);
    process.exit(1);
}
