import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
import { env } from "../config/env.js";
const scrypt = promisify(scryptCallback);
export const sessionCookieName = "chest_ai_session";
let initialization: Promise<void> | undefined;
export function ensureAuthSchema() {
    initialization ??= initialize().catch((error) => {
        initialization = undefined;
        throw error;
    });
    return initialization;
}
async function initialize() {
    await database.execute(`CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    role ENUM('admin', 'operator', 'viewer') NOT NULL DEFAULT 'operator',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_login_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_users_username (username)
  ) ENGINE=InnoDB`);
    await database.execute(`CREATE TABLE IF NOT EXISTS auth_sessions (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_pk BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_pk) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_auth_sessions_token_hash (token_hash),
    KEY idx_auth_sessions_expires_at (expires_at)
  ) ENGINE=InnoDB`);
    const [rows] = await database.execute<RowDataPacket[]>("SELECT id FROM users WHERE username = ? LIMIT 1", [env.auth.demoUsername]);
    if (!rows[0]) {
        if (!env.auth.demoPassword || env.auth.demoPassword === "CHANGE_ME") throw new Error("首次启动前请设置 AUTH_DEMO_PASSWORD");
        const salt = randomBytes(16).toString("hex");
        const passwordHash = await hashPassword(env.auth.demoPassword, salt);
        await database.execute(`INSERT INTO users (username, password_hash, password_salt, display_name, role)
       VALUES (?, ?, ?, ?, 'admin')`, [env.auth.demoUsername, passwordHash, salt, env.auth.demoUsername]);
    }
    await database.execute("UPDATE users SET display_name = username WHERE username = ? AND role = 'admin' AND display_name IN ('演示管理员', '系统管理员')", [env.auth.demoUsername]);
}
export async function hashPassword(password: string, salt: string) {
    return Buffer.from(await scrypt(password, salt, 64) as ArrayBuffer).toString("hex");
}
export async function verifyPassword(password: string, salt: string, expectedHash: string) {
    const actual = Buffer.from(await hashPassword(password, salt), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createSessionToken() {
    return randomBytes(32).toString("hex");
}
export function hashSessionToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}
export function readSessionToken(cookieHeader?: string) {
    if (!cookieHeader)
        return undefined;
    for (const part of cookieHeader.split(";")) {
        const [rawName, ...rawValue] = part.trim().split("=");
        if (rawName === sessionCookieName) {
            const token = decodeURIComponent(rawValue.join("="));
            return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
        }
    }
    return undefined;
}
export function sessionCookie(token: string, maxAgeSeconds: number) {
    const secure = env.auth.cookieSecure ? "; Secure" : "";
    return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
