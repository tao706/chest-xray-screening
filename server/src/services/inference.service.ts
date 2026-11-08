import { env } from "../config/env.js";
import type { InferenceResponse } from "../types/inference.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
export async function checkInferenceService() {
    try {
        const response = await fetch(`${env.inferenceUrl}/internal/health`, {
            signal: AbortSignal.timeout(3000)
        });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        return { status: "healthy" as const, data: await response.json() };
    }
    catch (error) {
        return {
            status: "unavailable" as const,
            message: error instanceof Error ? error.message : "模型服务连接失败"
        };
    }
}
export async function requestInference(subjectId: string, studyId: string, images: Express.Multer.File[]): Promise<InferenceResponse> {
    const formData = new FormData();
    formData.append("subject_id", subjectId);
    formData.append("study_id", studyId);
    for (const image of images) {
        formData.append("images", new Blob([new Uint8Array(image.buffer)], { type: image.mimetype }), image.originalname);
    }
    const response = await fetch(`${env.inferenceUrl}/internal/predict`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) await handleInferenceFailure(response);
    return response.json() as Promise<InferenceResponse>;
}
export async function requestInferenceFromPaths(subjectId: string, studyId: string, imagePaths: string[]): Promise<InferenceResponse> {
    const images = await Promise.all(imagePaths.map(async (imagePath) => {
        const extension = path.extname(imagePath).toLowerCase();
        return {
            originalname: path.basename(imagePath),
            mimetype: extension === ".png" ? "image/png" : "image/jpeg",
            buffer: await readFile(imagePath)
        } as Express.Multer.File;
    }));
    return requestInference(subjectId, studyId, images);
}
export async function requestGradcam(image: {
    name: string;
    mimeType: string;
    buffer: Buffer;
}, classId: number) {
    const formData = new FormData();
    formData.append("class_id", String(classId));
    formData.append("image", new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }), image.name);
    const response = await fetch(`${env.inferenceUrl}/internal/gradcam`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) await handleInferenceFailure(response);
    return response.json() as Promise<{
        success: boolean;
        class_id: number;
        method: string;
        is_mock: boolean;
        heatmap_mime_type: string;
        heatmap_base64: string;
    }>;
}

export class ImageInputError extends Error {
  readonly code = "INVALID_CHEST_IMAGE";
}

async function handleInferenceFailure(response: Response): Promise<never> {
  const payload = await response.json().catch(() => undefined) as { detail?: { code?: string; message?: string } } | undefined;
  if (response.status === 503 && payload?.detail?.code === "IMAGE_GATE_UNAVAILABLE") {
    throw new ImageGateUnavailableError("影像类型校验暂不可用，无法开始分析，请稍后重试。");
  }
  if (response.status === 422 && payload?.detail?.code === "INVALID_CHEST_IMAGE") {
    throw new ImageInputError(payload.detail.message ?? "未通过胸部X线影像初检，请上传清晰的胸片原图。");
  }
  throw new Error("影像分析服务暂时不可用，请稍后重试。");
}

export async function requestImageValidation(images: Express.Multer.File[]) {
  const body = new FormData();
  for (const image of images) body.append("images", new Blob([new Uint8Array(image.buffer)], { type: image.mimetype }), image.originalname);
  const response = await fetch(`${env.inferenceUrl}/internal/validate-images`, { method: "POST", body, signal: AbortSignal.timeout(15000) });
  if (!response.ok) await handleInferenceFailure(response);
  const payload = await response.json() as { accepted?: boolean };
  if (payload.accepted !== true) throw new ImageGateUnavailableError("影像类型校验未完成，无法开始分析。");
  return { accepted: true };
}

export class ImageGateUnavailableError extends Error { readonly code = "IMAGE_GATE_UNAVAILABLE"; }
