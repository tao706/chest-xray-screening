import { Router } from "express";
import type { Response } from "express";
import { randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { createSessionToken, ensureAuthSchema, hashPassword, hashSessionToken, readSessionToken, sessionCookie, sessionCookieName, verifyPassword } from "../services/auth.service.js";
export const authRouter = Router();
const failures = new Map<string, {
    count: number;
    firstAt: number;
}>();
const registrations = new Map<string, {
    count: number;
    firstAt: number;
}>();
authRouter.get("/registration", (_request, response) => {
    response.json({ success: true, data: { enabled: env.auth.registrationEnabled } });
});
authRouter.post("/register", async (request, response, next) => {
    if (!env.auth.registrationEnabled) {
        response.status(403).json({ success: false, code: "REGISTRATION_CLOSED", message: "当前未开放自主注册，请联系系统管理员" });
        return;
    }
    const key = request.ip ?? "unknown";
    const now = Date.now();
    const previous = registrations.get(key);
    const attempt = previous && now - previous.firstAt < 10 * 60000 ? previous : { count: 0, firstAt: now };
    if (attempt.count >= 5) {
        response.status(429).json({ success: false, code: "TOO_MANY_REGISTRATIONS", message: "注册尝试过于频繁，请10分钟后重试" });
        return;
    }
    registrations.set(key, { count: attempt.count + 1, firstAt: attempt.firstAt });
    const username = String(request.body.username ?? "").trim();
    const displayName = String(request.body.displayName ?? "").trim() || username;
    const password = String(request.body.password ?? "");
    if (!/^[A-Za-z0-9_-]{3,50}$/.test(username)) {
        response.status(400).json({ success: false, code: "INVALID_USERNAME", message: "用户名须为3至50位字母、数字、下划线或连字符" });
        return;
    }
    if (!/^[\p{L}\p{N} ._-]{2,40}$/u.test(displayName)) {
        response.status(400).json({ success: false, code: "INVALID_DISPLAY_NAME", message: "显示名称须为2至40位文字、数字、空格或常用符号" });
        return;
    }
    if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        response.status(400).json({ success: false, code: "WEAK_PASSWORD", message: "密码须为8至128位，且同时包含字母和数字" });
        return;
    }
    try {
        await ensureAuthSchema();
        const salt = randomBytes(16).toString("hex");
        const passwordHash = await hashPassword(password, salt);
        const [result] = await database.execute<ResultSetHeader>("INSERT INTO users (username, password_hash, password_salt, display_name, role) VALUES (?, ?, ?, ?, 'operator')", [username, passwordHash, salt, displayName]);
        await startSession(result.insertId, response);
        response.status(201).json({
            success: true,
            data: { id: result.insertId, username, displayName, role: "operator" },
            message: "注册成功"
        });
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") {
            response.status(409).json({ success: false, code: "USERNAME_EXISTS", message: "用户名已被使用，请更换" });
            return;
        }
        next(error);
    }
});
authRouter.post("/login", async (request, response, next) => {
    const username = String(request.body.username ?? "").trim();
    const password = String(request.body.password ?? "");
    if (!/^[A-Za-z0-9_-]{3,50}$/.test(username) || password.length < 6 || password.length > 128) {
        response.status(400).json({ success: false, code: "INVALID_CREDENTIALS", message: "用户名或密码格式不正确" });
        return;
    }
    const key = `${request.ip}:${username.toLowerCase()}`;
    const attempt = failures.get(key);
    if (attempt && attempt.count >= 5 && Date.now() - attempt.firstAt < 10 * 60000) {
        response.status(429).json({ success: false, code: "TOO_MANY_ATTEMPTS", message: "登录失败次数过多，请10分钟后重试" });
        return;
    }
    try {
        await ensureAuthSchema();
        const [rows] = await database.execute<RowDataPacket[]>("SELECT * FROM users WHERE username = ? AND is_active = 1 LIMIT 1", [username]);
        const user = rows[0];
        const verified = user ? await verifyPassword(password, String(user.password_salt), String(user.password_hash)) : false;
        if (!user || !verified) {
            const current = failures.get(key);
            failures.set(key, current && Date.now() - current.firstAt < 10 * 60000 ? { ...current, count: current.count + 1 } : { count: 1, firstAt: Date.now() });
            response.status(401).json({ success: false, code: "INVALID_CREDENTIALS", message: "用户名或密码不正确" });
            return;
        }
        failures.delete(key);
        await startSession(Number(user.id), response);
        await database.execute<ResultSetHeader>("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
        response.json({ success: true, data: publicUser(user), message: "登录成功" });
    }
    catch (error) {
        next(error);
    }
});
authRouter.get("/me", requireAuth, (request, response) => {
    response.json({ success: true, data: request.authUser, message: "登录状态有效" });
});
authRouter.post("/logout", requireAuth, async (request, response, next) => {
    try {
        const token = readSessionToken(request.headers.cookie);
        if (token)
            await database.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hashSessionToken(token)]);
        response.setHeader("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.auth.cookieSecure ? "; Secure" : ""}`);
        response.json({ success: true, data: null, message: "已退出登录" });
    }
    catch (error) {
        next(error);
    }
});
function publicUser(user: RowDataPacket) {
    return { id: Number(user.id), username: String(user.username), displayName: String(user.display_name), role: String(user.role) };
}
async function startSession(userId: number, response: Response) {
    const token = createSessionToken();
    const maxAgeSeconds = Math.max(1, env.auth.sessionHours) * 3600;
    await database.execute("DELETE FROM auth_sessions WHERE expires_at <= NOW()");
    await database.execute("INSERT INTO auth_sessions (user_pk, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))", [userId, hashSessionToken(token), maxAgeSeconds]);
    response.setHeader("Set-Cookie", sessionCookie(token, maxAgeSeconds));
}
