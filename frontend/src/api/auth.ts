import { requestJson } from "./http";
import type { AuthUser } from "@/types/auth";
import type { ApiResponse } from "@/types/prediction";
export async function login(username: string, password: string) {
    const response = await requestJson<ApiResponse<AuthUser>>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });
    return response.data;
}
export async function getRegistrationOptions() {
    const response = await requestJson<ApiResponse<{
        enabled: boolean;
    }>>("/api/auth/registration");
    return response.data;
}
export async function register(username: string, displayName: string, password: string) {
    const response = await requestJson<ApiResponse<AuthUser>>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password })
    });
    return response.data;
}
export async function getCurrentUser() {
    const response = await requestJson<ApiResponse<AuthUser>>("/api/auth/me");
    return response.data;
}
export async function logout() {
    await requestJson<ApiResponse<null>>("/api/auth/logout", { method: "POST" });
}
