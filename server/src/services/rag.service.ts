import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Document } from "@langchain/core/documents";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
const knowledgeRoot = path.resolve(process.cwd(), "knowledge");
const unsafeMedicalPatterns = [/诊断/u, /确诊/u, /治疗/u, /用药/u, /处方/u, /怎么办/u, /严重吗/u, /会死/u];
export type AssistantIntent = "clinical" | "knowledge" | "hybrid" | "safety";
export interface RagSource {
    title: string;
    section: string;
    file: string;
    excerpt: string;
    score: number;
    updated_at: string;
    retrieval: "hybrid";
}
interface KnowledgeChunk extends RagSource {
    terms: string[];
    frequencies: Map<string, number>;
}
let cachedChunks: KnowledgeChunk[] | undefined;
const markdownSplitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
    chunkSize: 720,
    chunkOverlap: 120,
    keepSeparator: true
});
function tokenize(text: string) {
    const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
    const words = normalized.split(/\s+/).filter(Boolean);
    const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
    const terms = [...words];
    for (const character of chinese)
        terms.push(character);
    for (let index = 0; index < chinese.length - 1; index += 1)
        terms.push(chinese[index]! + chinese[index + 1]!);
    return terms.filter((term) => term.length > 1 || /\p{Script=Han}/u.test(term));
}
function frequencies(terms: string[]) {
    const result = new Map<string, number>();
    for (const term of terms)
        result.set(term, (result.get(term) ?? 0) + 1);
    return result;
}
async function loadChunks() {
    if (cachedChunks)
        return cachedChunks;
    const files = (await readdir(knowledgeRoot)).filter((file) => file.endsWith(".md")).sort();
    const chunks: KnowledgeChunk[] = [];
    for (const file of files) {
        const absolutePath = path.join(knowledgeRoot, file);
        const [content, fileStat] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
        const lines = content.split(/\r?\n/u);
        const title = lines.find((line) => /^#\s+/u.test(line))?.replace(/^#\s+/u, "").trim() ?? file;
        let section = "概述";
        let sectionLines: string[] = [];
        const sectionDocuments: Document[] = [];
        const flushSection = () => {
            const pageContent = sectionLines.join("\n").trim();
            if (pageContent) {
                sectionDocuments.push(new Document({
                    pageContent,
                    metadata: { title, section, file, updated_at: fileStat.mtime.toISOString() }
                }));
            }
            sectionLines = [];
        };
        for (const line of lines) {
            const heading = line.match(/^#{2,3}\s+(.+)$/u);
            if (heading) {
                flushSection();
                section = heading[1]!.trim();
            }
            else if (!/^#\s+/u.test(line)) {
                sectionLines.push(line);
            }
        }
        flushSection();
        const documents = await markdownSplitter.splitDocuments(sectionDocuments);
        for (const document of documents) {
            const excerpt = document.pageContent.trim();
            if (!excerpt)
                continue;
            const documentTitle = String(document.metadata.title ?? title);
            const documentSection = String(document.metadata.section ?? "概述");
            const terms = tokenize(`${documentTitle} ${documentSection} ${excerpt}`);
            chunks.push({
                title: documentTitle,
                section: documentSection,
                file,
                excerpt,
                score: 0,
                updated_at: String(document.metadata.updated_at ?? fileStat.mtime.toISOString()),
                retrieval: "hybrid",
                terms,
                frequencies: frequencies(terms)
            });
        }
    }
    cachedChunks = chunks;
    return chunks;
}
function documentFrequencies(chunks: KnowledgeChunk[]) {
    const result = new Map<string, number>();
    for (const chunk of chunks) {
        for (const term of new Set(chunk.terms))
            result.set(term, (result.get(term) ?? 0) + 1);
    }
    return result;
}
function cosineSimilarity(query: Map<string, number>, chunk: KnowledgeChunk, documentFrequency: Map<string, number>, documentCount: number) {
    let dot = 0;
    let queryNorm = 0;
    let chunkNorm = 0;
    for (const [term, queryFrequency] of query) {
        const idf = Math.log(1 + documentCount / (1 + (documentFrequency.get(term) ?? 0)));
        const queryWeight = queryFrequency * idf;
        const chunkWeight = (chunk.frequencies.get(term) ?? 0) * idf;
        dot += queryWeight * chunkWeight;
        queryNorm += queryWeight ** 2;
    }
    for (const [term, chunkFrequency] of chunk.frequencies) {
        const idf = Math.log(1 + documentCount / (1 + (documentFrequency.get(term) ?? 0)));
        chunkNorm += (chunkFrequency * idf) ** 2;
    }
    return queryNorm && chunkNorm ? dot / Math.sqrt(queryNorm * chunkNorm) : 0;
}
function bm25Score(query: Map<string, number>, chunk: KnowledgeChunk, documentFrequency: Map<string, number>, documentCount: number, averageLength: number) {
    const k1 = 1.35;
    const b = 0.72;
    let score = 0;
    for (const term of query.keys()) {
        const termFrequency = chunk.frequencies.get(term) ?? 0;
        if (!termFrequency)
            continue;
        const frequency = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (documentCount - frequency + 0.5) / (frequency + 0.5));
        const denominator = termFrequency + k1 * (1 - b + b * chunk.terms.length / Math.max(averageLength, 1));
        score += idf * termFrequency * (k1 + 1) / denominator;
    }
    return score;
}
export function classifyAssistantIntent(question: string, hasClinicalContext: boolean): AssistantIntent {
    if (isUnsafeMedicalQuestion(question))
        return "safety";
    const clinical = /本次|当前|这次|检查|概率|分数|提示|历史|既往|变化|症状|病史|生命体征|复核|摘要|报告/u.test(question);
    const knowledge = /系统|功能|如何|怎么用|步骤|上传|批量|导出|文件|类别|标签|阈值|含义|意思|解释|原理|部署|故障|失败|知识库/u.test(question);
    if (!hasClinicalContext)
        return "knowledge";
    if (clinical && knowledge)
        return "hybrid";
    if (knowledge)
        return "knowledge";
    return "clinical";
}
interface RetrievalRequest {
    question: string;
    limit: number;
}
interface PreparedRetrieval extends RetrievalRequest {
    queryTerms: string[];
    query: Map<string, number>;
    normalizedQuestion: string;
}
const prepareRetrieval = RunnableLambda.from<RetrievalRequest, PreparedRetrieval>((input) => {
    const question = input.question.trim();
    const queryTerms = tokenize(question);
    return {
        question,
        limit: Math.max(1, Math.min(input.limit, 10)),
        queryTerms,
        query: frequencies(queryTerms),
        normalizedQuestion: question.toLowerCase().replace(/\s+/gu, "")
    };
});
const hybridRetriever = RunnableLambda.from<PreparedRetrieval, RagSource[]>(async ({ queryTerms, query, normalizedQuestion, limit }) => {
    const chunks = await loadChunks();
    if (!queryTerms.length || !chunks.length)
        return [];
    const documentFrequency = documentFrequencies(chunks);
    const averageLength = chunks.reduce((sum, chunk) => sum + chunk.terms.length, 0) / chunks.length;
    return chunks
        .map((chunk) => {
        const bm25 = bm25Score(query, chunk, documentFrequency, chunks.length, averageLength);
        const cosine = cosineSimilarity(query, chunk, documentFrequency, chunks.length);
        const normalizedChunk = `${chunk.title}${chunk.section}${chunk.excerpt}`.toLowerCase().replace(/\s+/gu, "");
        const phraseBoost = normalizedQuestion.length >= 4 && normalizedChunk.includes(normalizedQuestion) ? 2.5 : 0;
        const titleBoost = queryTerms.some((term) => chunk.title.toLowerCase().includes(term)) ? 0.8 : 0;
        const rawScore = bm25 * 0.62 + cosine * 4.2 + phraseBoost + titleBoost;
        const score = Math.min(99, Math.round((1 - Math.exp(-rawScore / 3.2)) * 100));
        return { ...chunk, score };
    })
        .filter((chunk) => chunk.score >= 22)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ terms: _terms, frequencies: _frequencies, ...source }) => source);
});
const langChainRetrievalChain = RunnableSequence.from<RetrievalRequest, RagSource[]>([
    prepareRetrieval,
    hybridRetriever
], "chest-ai-hybrid-rag");
export async function retrieveKnowledge(question: string, limit = 4): Promise<RagSource[]> {
    return langChainRetrievalChain.invoke({ question, limit });
}
export function isUnsafeMedicalQuestion(question: string) {
    const refersToPatient = /我|患者|病人|家人|孩子|老人|胸片|症状/u.test(question);
    return refersToPatient && unsafeMedicalPatterns.some((pattern) => pattern.test(question));
}
export function composeGroundedAnswer(question: string, sources: RagSource[]) {
    if (/你能(做|干)什么|能回答什么|有什么功能|怎么使用(你|助手)|帮助我什么/u.test(question)) {
        return [
            "我可以协助你完成以下工作：",
            "",
            "1. 解释系统功能、分析类别和多标签结果。",
            "2. 指导新建检查、多图上传、检查记录和批量分析操作。",
            "3. 说明结果文件的生成、字段、阈值和校验规则。",
            "4. 排查数据库、推理服务和实时任务的常见故障。",
            "5. 根据本地知识库回答连续追问，并展示可核对的资料来源。",
            "",
            "我不直接读取原始胸片，也不替代医生作出诊断、用药或治疗决定。"
        ].join("\n");
    }
    if (isUnsafeMedicalQuestion(question)) {
        return "这个问题涉及患者个体的诊断或治疗，当前信息不足以作出可靠判断。请由医生结合原始影像、正式报告和完整临床资料进行评估。";
    }
    if (!sources.length || sources[0]!.score < 22) {
        return "当前知识库中没有找到足够可靠的依据。你可以补充具体功能名称、页面位置或报错信息，我会缩小范围后继续查找。";
    }
    const uniqueParagraphs = [...new Set(sources.map((source) => source.excerpt.replace(/^#+\s*/gm, "").trim()))];
    const points = uniqueParagraphs.map((paragraph, index) => `${index + 1}. ${paragraph}`).join("\n\n");
    return `根据已核对的系统资料：\n\n${points}`;
}
