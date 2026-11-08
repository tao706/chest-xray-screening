import { readdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import type { DatasetStudy, DatasetSummary } from "../types/batch.js";
const allowedExtensions = new Set([".jpg", ".jpeg", ".png"]);
async function collectFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(root, entry.name);
        return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
    }));
    return nested.flat();
}
function resolveDatasetRoot(datasetName: string) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(datasetName))
        throw new Error("数据集名称不合法");
    const resolved = path.resolve(env.batchDataRoot, datasetName);
    const relative = path.relative(env.batchDataRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("数据集路径超出允许范围");
    return resolved;
}
export async function scanDataset(datasetName: string): Promise<{
    studies: DatasetStudy[];
    summary: DatasetSummary;
}> {
    const datasetRoot = resolveDatasetRoot(datasetName);
    const imageRoot = path.join(datasetRoot, "images");
    const allFiles = await collectFiles(imageRoot);
    const imageFiles = allFiles.filter((file) => allowedExtensions.has(path.extname(file).toLowerCase()));
    const groups = new Map<string, DatasetStudy>();
    for (const file of imageFiles) {
        const relative = path.relative(imageRoot, file);
        const parts = relative.split(path.sep);
        if (parts.length < 3)
            continue;
        const subjectId = parts.at(-3)!;
        const studyId = parts.at(-2)!;
        const existing = groups.get(studyId) ?? { subjectId, studyId, imagePaths: [] };
        existing.imagePaths.push(file);
        groups.set(studyId, existing);
    }
    const studies = [...groups.values()].sort((a, b) => a.studyId.localeCompare(b.studyId));
    return {
        studies,
        summary: {
            name: datasetName,
            studyCount: studies.length,
            imageCount: studies.reduce((sum, study) => sum + study.imagePaths.length, 0),
            invalidFileCount: allFiles.length - imageFiles.length
        }
    };
}
export async function listDatasets(): Promise<DatasetSummary[]> {
    await readdir(env.batchDataRoot, { withFileTypes: true }).catch(async () => {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(env.batchDataRoot, { recursive: true });
        return [];
    });
    const entries = await readdir(env.batchDataRoot, { withFileTypes: true });
    const datasets: DatasetSummary[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        try {
            const { summary } = await scanDataset(entry.name);
            datasets.push(summary);
        }
        catch {
            datasets.push({ name: entry.name, studyCount: 0, imageCount: 0, invalidFileCount: 0 });
        }
    }
    return datasets;
}
