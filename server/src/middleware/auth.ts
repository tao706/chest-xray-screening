import type { NextFunction, Request, Response } from "express";
import type { RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
import { ensureAuthSchema, hashSessionToken, readSessionToken } from "../services/auth.service.js";
export async function requireAuth(request: Request, response: Response, next: NextFunction) {
    try {
        await ensureAuthSchema();
        const token = readSessionToken(request.headers.cookie);
        if (!token)
            return void unauthorized(response);
        const [rows] = await database.execute<RowDataPacket[]>(`SELECT u.id, u.username, u.display_name, u.role
         FROM auth_sessions s JOIN users u ON u.id = s.user_pk
        WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_active = 1 LIMIT 1`, [hashSessionToken(token)]);
        const user = rows[0];
        if (!user)
            return void unauthorized(response);
        request.authUser = { id: Number(user.id), username: String(user.username), displayName: String(user.display_name), role: String(user.role) };
        next();
    }
    catch (error) {
        next(error);
    }
}
function unauthorized(response: Response) {
    response.status(401).json({ success: false, code: "UNAUTHORIZED", message: "登录状态已失效，请重新登录" });
}
