import { randomUUID } from "node:crypto";
import { mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
export async function persistStudyImages(studyId: string, images: Express.Multer.File[]) {
    const studyDirectory = path.join(env.uploadRoot, studyId);
    const relative = path.relative(env.uploadRoot, studyDirectory);
    if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("图片存储路径不合法");
    await mkdir(studyDirectory, { recursive: true });
    return Promise.all(images.map(async (image, index) => {
        const extension = image.mimetype === "image/png" ? ".png" : ".jpg";
        const storedName = `${String(index + 1).padStart(2, "0")}-${randomUUID()}${extension}`;
        const storedPath = path.join(studyDirectory, storedName);
        await writeFile(storedPath, image.buffer);
        return { image, storedName, storedPath };
    }));
}
export function isReadableStudyImagePath(filePath: string) {
    const resolved = path.resolve(filePath);
    return [env.uploadRoot, env.batchDataRoot].some((root) => {
        const relative = path.relative(root, resolved);
        return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
}
export async function removePersistedStudyImages(filePaths: string[]) {
    const directories = new Set<string>();
    for (const filePath of filePaths) {
        const resolved = path.resolve(filePath);
        const relative = path.relative(env.uploadRoot, resolved);
        if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "")
            continue;
        await unlink(resolved).catch(() => undefined);
        directories.add(path.dirname(resolved));
    }
    for (const directory of directories) {
        const relative = path.relative(env.uploadRoot, directory);
        if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
            await rmdir(directory).catch(() => undefined);
        }
    }
}
