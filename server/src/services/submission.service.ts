import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { database } from "../config/database.js";
const headers = ["Subject_id", "Study_id", "Predict_class", "Probability"] as const;
const exportRoot = path.resolve(process.cwd(), "exports");
interface TaskRow extends RowDataPacket {
    id: number;
    task_id: string;
    status: string;
    threshold_value: string | number;
    total_count: number;
    completed_count: number;
    failed_count: number;
    csv_path: string | null;
}
interface PredictionRow extends RowDataPacket {
    subject_id: string;
    study_id: string;
    item_status: string;
    class_id: number | null;
    probability: string | number | null;
}
export interface SubmissionPreviewRow {
    Subject_id: string;
    Study_id: string;
    Predict_class: number;
    Probability: number;
}
export interface SubmissionValidation {
    valid: boolean;
    headersValid: boolean;
    rowCount: number;
    expectedStudyCount: number;
    coveredStudyCount: number;
    missingStudyIds: string[];
    duplicateCount: number;
    invalidRowCount: number;
    fallbackStudyCount: number;
    failedStudyCount: number;
    threshold: number;
    errors: string[];
    warnings: string[];
    preview: SubmissionPreviewRow[];
}
function csvCell(value: string | number) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function parseCsvLine(line: string) {
    const cells: string[] = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index]!;
        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                value += '"';
                index += 1;
            }
            else {
                quoted = !quoted;
            }
        }
        else if (character === "," && !quoted) {
            cells.push(value);
            value = "";
        }
        else {
            value += character;
        }
    }
    cells.push(value);
    return cells;
}
async function getTask(taskId: string) {
    const [rows] = await database.execute<TaskRow[]>("SELECT * FROM batch_tasks WHERE task_id = ? LIMIT 1", [taskId]);
    if (!rows[0])
        throw new Error("未找到该批量任务");
    return rows[0];
}
async function getTaskPredictions(taskPk: number) {
    const [rows] = await database.execute<PredictionRow[]>(`SELECT i.subject_id, i.study_id, i.status AS item_status,
            p.class_id, p.probability
       FROM batch_task_items i
       LEFT JOIN studies s ON s.study_id = i.study_id
       LEFT JOIN predictions p ON p.study_pk = s.id
      WHERE i.task_pk = ?
      ORDER BY i.study_id ASC, p.class_id ASC`, [taskPk]);
    return rows;
}
export async function generateSubmission(taskId: string, requestedThreshold?: number) {
    const task = await getTask(taskId);
    if (task.status !== "completed")
        throw new Error("只有已完成的批量任务可以生成提交文件");
    const threshold = requestedThreshold ?? Number(task.threshold_value);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
        throw new Error("阈值必须在0到1之间");
    const sourceRows = await getTaskPredictions(task.id);
    const studies = new Map<string, PredictionRow[]>();
    for (const row of sourceRows) {
        const rows = studies.get(row.study_id) ?? [];
        rows.push(row);
        studies.set(row.study_id, rows);
    }
    const outputRows: SubmissionPreviewRow[] = [];
    let fallbackStudyCount = 0;
    for (const rows of studies.values()) {
        if (rows[0]?.item_status !== "completed")
            continue;
        const predictions = rows
            .filter((row) => row.class_id !== null && row.probability !== null)
            .map((row) => ({ ...row, probabilityNumber: Number(row.probability) }));
        if (predictions.length !== 14)
            throw new Error("该任务包含历史类别结果，请重新创建分析任务后导出");
        let selected = predictions.filter((row) => row.probabilityNumber >= threshold);
        if (!selected.length) {
            selected = [...predictions].sort((a, b) => b.probabilityNumber - a.probabilityNumber).slice(0, 1);
            fallbackStudyCount += 1;
        }
        for (const row of selected) {
            outputRows.push({
                Subject_id: row.subject_id,
                Study_id: row.study_id,
                Predict_class: Number(row.class_id),
                Probability: Number(row.probabilityNumber.toFixed(8))
            });
        }
    }
    const directory = path.join(exportRoot, taskId);
    const filePath = path.join(directory, "submission.csv");
    await mkdir(directory, { recursive: true });
    const csv = [
        headers.join(","),
        ...outputRows.map((row) => [row.Subject_id, row.Study_id, row.Predict_class, row.Probability.toFixed(8)].map(csvCell).join(","))
    ].join("\r\n") + "\r\n";
    await writeFile(filePath, csv, "utf8");
    await database.execute("UPDATE batch_tasks SET threshold_value = ?, csv_path = ? WHERE id = ?", [threshold, filePath, task.id]);
    return validateSubmission(taskId, fallbackStudyCount);
}
export async function validateSubmission(taskId: string, knownFallbackCount?: number): Promise<SubmissionValidation> {
    const task = await getTask(taskId);
    if (!task.csv_path)
        throw new Error("该任务尚未生成submission.csv");
    const content = await readFile(task.csv_path, "utf8");
    const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
    const actualHeaders = parseCsvLine(lines[0] ?? "");
    const headersValid = headers.every((header, index) => actualHeaders[index] === header) && actualHeaders.length === headers.length;
    const parsedRows: SubmissionPreviewRow[] = [];
    const seen = new Set<string>();
    let duplicateCount = 0;
    let invalidRowCount = 0;
    for (const line of lines.slice(1)) {
        const cells = parseCsvLine(line);
        const classId = Number(cells[2]);
        const probability = Number(cells[3]);
        const rowValid = cells.length === 4 && cells.every((cell) => cell !== "") &&
            Number.isInteger(classId) && classId >= 1 && classId <= 14 &&
            Number.isFinite(probability) && probability >= 0 && probability <= 1;
        if (!rowValid) {
            invalidRowCount += 1;
            continue;
        }
        const key = `${cells[1]}::${classId}`;
        if (seen.has(key))
            duplicateCount += 1;
        seen.add(key);
        parsedRows.push({ Subject_id: cells[0]!, Study_id: cells[1]!, Predict_class: classId, Probability: probability });
    }
    const [itemRows] = await database.execute<RowDataPacket[]>("SELECT study_id, status FROM batch_task_items WHERE task_pk = ? ORDER BY study_id", [task.id]);
    const completedStudyIds = itemRows.filter((row) => row.status === "completed").map((row) => String(row.study_id));
    const covered = new Set(parsedRows.map((row) => row.Study_id));
    const missingStudyIds = completedStudyIds.filter((studyId) => !covered.has(studyId));
    const failedStudyCount = itemRows.filter((row) => row.status === "failed").length;
    let fallbackStudyCount = knownFallbackCount;
    if (fallbackStudyCount === undefined) {
        const predictionRows = await getTaskPredictions(task.id);
        const maximumByStudy = new Map<string, number>();
        for (const row of predictionRows) {
            if (row.item_status !== "completed" || row.probability === null)
                continue;
            maximumByStudy.set(row.study_id, Math.max(maximumByStudy.get(row.study_id) ?? -1, Number(row.probability)));
        }
        fallbackStudyCount = [...maximumByStudy.values()].filter((maximum) => maximum < Number(task.threshold_value)).length;
    }
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!headersValid)
        errors.push("CSV表头或字段顺序不正确");
    if (invalidRowCount)
        errors.push(`存在 ${invalidRowCount} 行空值、类别或概率不合法`);
    if (duplicateCount)
        errors.push(`存在 ${duplicateCount} 行重复的Study+类别组合`);
    if (missingStudyIds.length)
        errors.push(`有 ${missingStudyIds.length} 个已完成Study没有输出结果`);
    if (failedStudyCount)
        errors.push(`批量任务中有 ${failedStudyCount} 个Study推理失败`);
    if (fallbackStudyCount)
        warnings.push(`${fallbackStudyCount} 个Study没有类别达到阈值，已补入其最高概率类别`);
    return {
        valid: errors.length === 0,
        headersValid,
        rowCount: parsedRows.length,
        expectedStudyCount: completedStudyIds.length,
        coveredStudyCount: completedStudyIds.length - missingStudyIds.length,
        missingStudyIds,
        duplicateCount,
        invalidRowCount,
        fallbackStudyCount,
        failedStudyCount,
        threshold: Number(task.threshold_value),
        errors,
        warnings,
        preview: parsedRows.slice(0, 50)
    };
}
export async function getSubmissionFile(taskId: string) {
    const task = await getTask(taskId);
    if (!task.csv_path)
        throw new Error("该任务尚未生成submission.csv");
    const expectedDirectory = path.join(exportRoot, taskId);
    const resolved = path.resolve(task.csv_path);
    const relative = path.relative(expectedDirectory, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("提交文件路径不合法");
    return resolved;
}
