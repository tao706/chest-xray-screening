export class ApiError extends Error {
    constructor(message: string, public readonly status: number, public readonly code?: string) {
        super(message);
        this.name = "ApiError";
    }
}
export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const response = await fetch(input, {
        credentials: "include",
        ...init
    });
    const payload = await response.json().catch(() => null) as {
        message?: string;
        code?: string;
    } | null;
    if (!response.ok) {
        throw new ApiError(payload?.message ?? `请求失败(HTTP ${response.status})`, response.status, payload?.code);
    }
    if (payload === null)
        throw new ApiError("服务响应格式异常，请重试", response.status, "INVALID_RESPONSE");
    return payload as T;
}
