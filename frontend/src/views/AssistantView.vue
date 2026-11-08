<script setup lang="ts">import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { confirmReview, createReview, getLatestReview, getPatientStudies, saveReview, streamAssistantMessage, } from "@/api/assistant";
import { useAuthStore } from "@/state/auth";
import type { AssistantEvent, AssistantHistoryItem, ChatMessage, ClinicalInfo, ClinicalReview, PatientStudySummary, ReviewSections, } from "@/types/assistant";
import { createStreamText } from "./streamText";
import { statusLabel } from "./statusLabel";
interface SavedConversation {
    subjectId: string;
    studyId: string;
    messages: ChatMessage[];
}
const authStore = useAuthStore();
const { user: authUser } = storeToRefs(authStore);
const storageKey = () => (authUser.value ? `chest-ai-assistant-v4-user-${authUser.value.id}` : "");
const quickQuestions = [
    { icon: "01", label: "总结本次检查的模型发现" },
    { icon: "02", label: "哪些项目需要医生重点复核？" },
    { icon: "03", label: "与历史检查相比有什么变化？" },
    { icon: "04", label: "生成一份医生审阅摘要" },
    { icon: "05", label: "下一步可考虑核对哪些临床信息？" },
];
const welcomeMessage = (): ChatMessage => ({
    id: crypto.randomUUID(),
    role: "assistant",
    content: "你好，我是影像检查助手。请先在左侧输入患者编号，选择一次检查后，我可以汇总模型发现、对比历史记录并生成医生审阅草稿。\n\n请勿输入患者姓名、身份证号、手机号等身份信息。所有内容仅供专业人员复核，不作为最终诊断或治疗依据。",
    createdAt: new Date().toISOString(),
});
const messages = ref<ChatMessage[]>([welcomeMessage()]);
const subjectId = ref("");
const patientStudies = ref<PatientStudySummary[]>([]);
const selectedStudyId = ref("");
const patientLoading = ref(false);
const patientError = ref("");
const selectedStudy = computed(() => patientStudies.value.find((study) => study.study_id === selectedStudyId.value));
const input = ref("");
const sending = ref(false);
const stage = ref<"idle" | "retrieving" | "generating" | "done" | "error">("idle");
const stageMessage = ref("等待提问");
const suggestions = ref<string[]>([]);
const copiedMessageId = ref("");
const chatScroll = ref<HTMLElement>();
const chatEnd = ref<HTMLElement>();
const symptomOptions = ["咳嗽", "发热", "胸痛", "呼吸困难", "咳痰", "无明显症状"];
const emptyClinicalInfo = (): ClinicalInfo => ({
    symptoms: [],
    duration: "未提供",
    heartLungHistory: "未提供",
    vitalsReview: "未提供",
});
const clinicalInfo = ref<ClinicalInfo>(emptyClinicalInfo());
const review = ref<ClinicalReview | null>(null);
const reviewStale = computed(() => {
    if (!review.value)
        return false;
    const saved = review.value.clinicalInfo;
    const current = clinicalInfo.value;
    return (saved.duration !== current.duration ||
        saved.heartLungHistory !== current.heartLungHistory ||
        saved.vitalsReview !== current.vitalsReview ||
        [...saved.symptoms].sort().join("|") !== [...current.symptoms].sort().join("|"));
});
const reviewSections = ref<ReviewSections>({
    modelFindings: "",
    reviewPoints: "",
    missingInformation: "",
    nextChecks: "",
});
const reviewBusy = ref(false);
const reviewError = ref("");
const reviewNotice = ref("");
const reviewAcknowledged = ref(false);
let controller: AbortController | undefined;
function toggleSymptom(symptom: string) {
    if (symptom === "无明显症状") {
        clinicalInfo.value.symptoms = clinicalInfo.value.symptoms.includes(symptom) ? [] : [symptom];
        return;
    }
    const current = clinicalInfo.value.symptoms.filter((item) => item !== "无明显症状");
    clinicalInfo.value.symptoms = current.includes(symptom)
        ? current.filter((item) => item !== symptom)
        : [...current, symptom];
}
async function loadReview(studyId: string) {
    reviewError.value = "";
    try {
        const latest = await getLatestReview(studyId);
        if (selectedStudyId.value !== studyId)
            return;
        review.value = latest;
        if (latest) {
            clinicalInfo.value = latest.clinicalInfo;
            reviewSections.value = { ...latest.sections };
        }
    }
    catch (error) {
        if (selectedStudyId.value === studyId)
            reviewError.value = error instanceof Error ? error.message : "草稿读取失败";
    }
}
async function generateReview() {
    if (!selectedStudy.value || reviewBusy.value)
        return;
    reviewBusy.value = true;
    reviewError.value = "";
    reviewNotice.value = "";
    try {
        const created = await createReview(selectedStudy.value.study_id, clinicalInfo.value);
        review.value = created;
        reviewSections.value = { ...created.sections };
        reviewAcknowledged.value = false;
        reviewNotice.value = "审阅草稿已生成并保存，可继续编辑。";
    }
    catch (error) {
        reviewError.value = error instanceof Error ? error.message : "草稿生成失败";
    }
    finally {
        reviewBusy.value = false;
    }
}
async function saveCurrentReview() {
    if (!review.value || reviewBusy.value || reviewStale.value)
        return;
    reviewBusy.value = true;
    reviewError.value = "";
    try {
        review.value = await saveReview(review.value.reviewId, reviewSections.value);
        reviewNotice.value = "草稿修改已保存。";
    }
    catch (error) {
        reviewError.value = error instanceof Error ? error.message : "草稿保存失败";
    }
    finally {
        reviewBusy.value = false;
    }
}
async function confirmCurrentReview() {
    if (!review.value || !reviewAcknowledged.value || reviewBusy.value || reviewStale.value)
        return;
    reviewBusy.value = true;
    reviewError.value = "";
    try {
        review.value = await confirmReview(review.value.reviewId, reviewSections.value);
        reviewNotice.value = "已标记为人工审阅；这不是正式医疗报告。";
    }
    catch (error) {
        reviewError.value = error instanceof Error ? error.message : "审阅标记失败";
    }
    finally {
        reviewBusy.value = false;
    }
}
function completedMessages() {
    const completed: ChatMessage[] = [];
    for (let index = 1; index + 1 < messages.value.length; index += 2) {
        const question = messages.value[index];
        const answer = messages.value[index + 1];
        if (question?.role === "user" &&
            answer?.role === "assistant" &&
            !answer.streaming &&
            !answer.error &&
            answer.content.trim() &&
            answer.content !== "已停止生成。") {
            completed.push(question, answer);
        }
    }
    return completed.slice(-40);
}
function saveConversation() {
    const key = storageKey();
    if (!key)
        return;
    const saved: SavedConversation = {
        subjectId: subjectId.value.trim(),
        studyId: selectedStudyId.value,
        messages: completedMessages(),
    };
    try {
        localStorage.setItem(key, JSON.stringify(saved));
    }
    catch {
    }
}
async function scrollToBottom() {
    await nextTick();
    const scroll = () => {
        const container = chatScroll.value;
        if (container)
            container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
    };
    scroll();
    window.requestAnimationFrame(() => window.requestAnimationFrame(scroll));
}
async function revealLatestConversation() {
    await scrollToBottom();
    const reveal = () => chatEnd.value?.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    reveal();
    window.requestAnimationFrame(() => window.requestAnimationFrame(reveal));
}
async function sendMessage(preset?: string) {
    const question = (preset ?? input.value).trim();
    if (!question || sending.value)
        return;
    const history: AssistantHistoryItem[] = messages.value
        .slice(-8)
        .map(({ role, content }) => ({ role, content }));
    input.value = "";
    errorReset();
    suggestions.value = [];
    const answer = reactive<ChatMessage>({
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        sources: [],
        streaming: true,
        createdAt: new Date().toISOString(),
    });
    messages.value.push({
        id: crypto.randomUUID(),
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
    }, answer);
    sending.value = true;
    stage.value = "retrieving";
    stageMessage.value = "正在检索知识库";
    controller = new AbortController();
    const requestController = controller;
    const output = createStreamText((text) => {
        const container = chatScroll.value;
        const following = !container || container.scrollHeight - container.scrollTop - container.clientHeight < 80;
        answer.content += text;
        if (following)
            void nextTick(() => {
                if (container)
                    container.scrollTop = container.scrollHeight;
            });
    }, requestController.signal);
    let completion: Extract<AssistantEvent, {
        type: "done";
    }> | undefined;
    const startedAt = performance.now();
    await scrollToBottom();
    try {
        await streamAssistantMessage(question, history, selectedStudyId.value || undefined, selectedStudy.value?.subject_id, selectedStudy.value ? clinicalInfo.value : undefined, requestController.signal, (event) => {
            if (event.type === "token")
                output.push(event.data.content);
            else if (event.type === "done")
                completion = event;
            else if (event.type === "error")
                throw new Error(event.data.message);
            else
                handleEvent(event, answer, startedAt);
        });
        await output.drain();
        if (requestController.signal.aborted)
            throw new DOMException("Stopped", "AbortError");
        if (completion)
            handleEvent(completion, answer, startedAt);
    }
    catch (error) {
        if ((error as Error).name === "AbortError") {
            if (!answer.content)
                answer.content = "已停止生成。";
            stageMessage.value = "已停止生成";
        }
        else {
            answer.error = true;
            answer.content ||= error instanceof Error ? error.message : "智能助手暂时不可用";
            stage.value = "error";
            stageMessage.value = "连接或生成失败";
        }
    }
    finally {
        output.dispose();
        answer.streaming = false;
        sending.value = false;
        controller = undefined;
        saveConversation();
    }
}
function handleEvent(event: AssistantEvent, answer: ChatMessage, startedAt: number) {
    if (event.type === "status") {
        stage.value = event.data.stage;
        stageMessage.value = event.data.message;
    }
    else if (event.type === "meta") {
        answer.sources = event.data.sources;
        answer.mode = event.data.mode;
        answer.model = event.data.model;
        answer.retrieval = event.data.retrieval;
        answer.validated = event.data.validated;
    }
    else if (event.type === "token") {
        answer.content += event.data.content;
        void scrollToBottom();
    }
    else if (event.type === "done") {
        answer.sourceCount = event.data.source_count;
        answer.responseTimeMs = Math.round(performance.now() - startedAt);
        stage.value = "done";
        stageMessage.value = event.data.source_count
            ? `回答完成 · 引用 ${event.data.source_count} 条资料`
            : "回答完成 · 已依据检查记录整理";
        suggestions.value = event.data.suggestions ?? [];
    }
    else {
        answer.error = true;
        answer.content ||= event.data.message;
        stage.value = "error";
        stageMessage.value = event.data.message;
    }
}
function stopGeneration() {
    controller?.abort();
}
async function searchPatient(preferredStudyId = "", restoring = false) {
    const value = subjectId.value.trim();
    if (!value || patientLoading.value)
        return;
    if (!restoring && selectedStudy.value?.subject_id && selectedStudy.value.subject_id !== value)
        resetMessages();
    patientLoading.value = true;
    patientError.value = "";
    try {
        patientStudies.value = await getPatientStudies(value);
        const targetStudyId = preferredStudyId || (selectedStudy.value?.subject_id === value ? selectedStudyId.value : "");
        const completed = patientStudies.value.find((study) => study.study_id === targetStudyId && study.status === "completed") ?? patientStudies.value.find((study) => study.status === "completed");
        if (completed)
            selectStudy(completed.study_id, Boolean(preferredStudyId));
        else
            selectedStudyId.value = "";
    }
    catch (error) {
        patientStudies.value = [];
        selectedStudyId.value = "";
        patientError.value = error instanceof Error ? error.message : "检查记录查询失败";
    }
    finally {
        patientLoading.value = false;
        if (!restoring || !patientError.value)
            saveConversation();
    }
}
function selectStudy(studyId: string, restoring = false) {
    if (selectedStudyId.value !== studyId) {
        if (!restoring && selectedStudyId.value)
            resetMessages();
        clinicalInfo.value = emptyClinicalInfo();
        review.value = null;
        reviewSections.value = {
            modelFindings: "",
            reviewPoints: "",
            missingInformation: "",
            nextChecks: "",
        };
        reviewNotice.value = "";
        reviewAcknowledged.value = false;
    }
    selectedStudyId.value = studyId;
    const study = patientStudies.value.find((item) => item.study_id === studyId);
    if (study)
        stageMessage.value = `已载入检查 ${study.study_id}`;
    saveConversation();
    void loadReview(studyId);
}
function formatStudyTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
function formatSourceDate(value?: string) {
    if (!value)
        return "版本已记录";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "版本已记录" : `更新于 ${date.toLocaleDateString("zh-CN")}`;
}
function formatResponseTime(milliseconds?: number) {
    if (!milliseconds)
        return "";
    return milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(1)}s`;
}
function resetMessages() {
    if (sending.value)
        controller?.abort();
    messages.value = [welcomeMessage()];
    suggestions.value = [];
    stage.value = "idle";
    stageMessage.value = "等待提问";
}
function clearConversation() {
    resetMessages();
    saveConversation();
}
function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
    }
}
async function copyAnswer(content: string) {
    await navigator.clipboard.writeText(content);
    copiedMessageId.value = messages.value.find((message) => message.content === content)?.id ?? "";
    stageMessage.value = "回答已复制";
    window.setTimeout(() => {
        copiedMessageId.value = "";
    }, 1600);
}
function retryAnswer(messageId: string) {
    const index = messages.value.findIndex((message) => message.id === messageId);
    const question = index > 0 && messages.value[index - 1]?.role === "user"
        ? messages.value[index - 1]!.content
        : "";
    if (question)
        void sendMessage(question);
}
function errorReset() {
    stage.value = "idle";
    stageMessage.value = "等待处理";
}
onMounted(async () => {
    if ("scrollRestoration" in window.history)
        window.history.scrollRestoration = "manual";
    const key = storageKey();
    try {
        const saved = key
            ? (JSON.parse(localStorage.getItem(key) ?? "null") as SavedConversation | null)
            : null;
        if (saved && Array.isArray(saved.messages)) {
            const restored: ChatMessage[] = [];
            for (let index = 0; index + 1 < saved.messages.length; index += 2) {
                const question = saved.messages[index];
                const answer = saved.messages[index + 1];
                if (question?.role === "user" &&
                    typeof question.content === "string" &&
                    answer?.role === "assistant" &&
                    typeof answer.content === "string" &&
                    answer.content.trim() &&
                    !answer.error) {
                    restored.push({ ...question, streaming: false }, { ...answer, streaming: false });
                }
            }
            messages.value = [welcomeMessage(), ...restored.slice(-40)];
            if (typeof saved.subjectId === "string" && saved.subjectId) {
                subjectId.value = saved.subjectId;
                await searchPatient(typeof saved.studyId === "string" ? saved.studyId : "", true);
            }
            if (restored.length)
                stageMessage.value = selectedStudy.value
                    ? "历史会话与检查已恢复"
                    : "历史会话已恢复，请重新选择检查";
        }
    }
    catch {
        if (key)
            localStorage.removeItem(key);
    }
    await revealLatestConversation();
    window.setTimeout(() => {
        void revealLatestConversation();
    }, 220);
    window.setTimeout(() => {
        void revealLatestConversation();
    }, 600);
});
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">IMAGING ASSISTANT</p>
        <h1>影像检查助手</h1>
        <p>关联患者检查记录，汇总模型发现、历史变化和医生复核要点。</p>
      </div>
      <button class="button" type="button" @click="clearConversation">新建会话</button>
    </header>
    <div class="assistant-layout">
      <div class="assistant-main-column">
        <article class="panel assistant-chat-panel">
          <div class="panel-heading">
            <div>
              <h2>检查辅助分析</h2>
              <p>结构化信息 · 审阅摘要 · 医生复核</p>
            </div>
            <span
              class="record-status"
              :class="selectedStudy ? 'record-status--completed' : 'record-status--processing'"
            >
              {{ selectedStudy ? "检查已关联" : "等待选择检查" }}
            </span>
          </div>
          <div v-if="selectedStudy" class="assistant-study-context">
            <div>
              <small>当前检查</small>
              <strong>{{ selectedStudy.study_id }}</strong>
            </div>
            <div>
              <small>检查时间</small>
              <strong>{{ formatStudyTime(selectedStudy.created_at) }}</strong>
            </div>
            <div>
              <small>图像</small>
              <strong>{{ selectedStudy.image_count }}张</strong>
            </div>
            <div>
              <small>最高提示</small>
              <strong>
                {{ selectedStudy.top_findings[0]?.class_name ?? "暂无" }}
                <template v-if="selectedStudy.top_findings[0]">
                  · {{ (selectedStudy.top_findings[0].probability * 100).toFixed(1) }}%
                </template>
              </strong>
            </div>
          </div>
          <div ref="chatScroll" class="assistant-chat-scroll">
            <div
              v-for="message in messages"
              :key="message.id"
              class="assistant-message"
              :class="`assistant-message--${message.role}`"
            >
              <span class="assistant-avatar">{{ message.role === "user" ? "我" : "✦" }}</span>
              <div class="assistant-bubble" :class="{ 'assistant-bubble--error': message.error }">
                <span
                  v-if="message.mode"
                  class="assistant-answer-mode"
                  :class="{ 'assistant-answer-mode--enhanced': message.mode !== 'local-rag' }"
                >
                  辅助分析
                </span>
                <p>
                  {{ message.content }}
                  <i v-if="message.streaming" class="stream-cursor"></i>
                </p>
                <div v-if="message.sources?.length" class="assistant-sources">
                  <strong>回答依据</strong>
                  <details
                    v-for="source in message.sources"
                    :key="`${message.id}-${source.file}-${source.excerpt}`"
                  >
                    <summary>
                      {{ source.title }}
                      <template v-if="source.section">· {{ source.section }}</template>
                      · 相关度 {{ source.score }}%
                    </summary>
                    <p>{{ source.excerpt }}</p>
                    <small>{{ formatSourceDate(source.updated_at) }} · 混合检索</small>
                  </details>
                </div>
                <div
                  v-if="
                    message.role === 'assistant' &&
                    message !== messages[0] &&
                    !message.streaming &&
                    !message.error
                  "
                  class="assistant-answer-meta"
                >
                  <span>✓ 已完成</span>
                  <span>
                    {{
                      message.sourceCount ? `引用 ${message.sourceCount} 条依据` : "基于检查记录"
                    }}
                  </span>
                  <span v-if="message.responseTimeMs">
                    用时 {{ formatResponseTime(message.responseTimeMs) }}
                  </span>
                </div>
                <div
                  v-if="message.role === 'assistant' && message.content && !message.streaming"
                  class="assistant-message-actions"
                >
                  <button type="button" @click="copyAnswer(message.content)">
                    {{ copiedMessageId === message.id ? "已复制" : "复制回答" }}
                  </button>
                  <button
                    v-if="message !== messages[0]"
                    type="button"
                    :disabled="sending"
                    @click="retryAnswer(message.id)"
                  >
                    重新生成
                  </button>
                </div>
              </div>
            </div>
            <div v-if="sending" class="assistant-live-status" role="status" aria-live="polite">
              <span class="assistant-live-status__pulse" aria-hidden="true"></span>
              <div>
                <strong>
                  {{ stage === "retrieving" ? "正在查找相关资料" : "正在组织辅助分析" }}
                </strong>
                <p>{{ stageMessage }}</p>
              </div>
              <div class="assistant-live-status__steps" aria-hidden="true">
                <i class="done">读取记录</i>
                <i :class="{ active: stage === 'retrieving', done: stage === 'generating' }">
                  检索依据
                </i>
                <i :class="{ active: stage === 'generating' }">生成回答</i>
              </div>
            </div>
            <div ref="chatEnd" class="assistant-chat-end" aria-hidden="true"></div>
          </div>
          <div v-if="suggestions.length && !sending" class="assistant-followups">
            <span>你还可以继续问</span>
            <button
              v-for="question in suggestions"
              :key="question"
              type="button"
              @click="sendMessage(question)"
            >
              {{ question }}
            </button>
          </div>
          <div class="assistant-compose">
            <textarea
              v-model="input"
              maxlength="500"
              :disabled="sending"
              placeholder="询问当前检查的模型发现、历史变化或复核要点……"
              @keydown="handleKeydown"
            ></textarea>
            <div>
              <span>Enter发送 · Shift+Enter换行 · {{ input.length }}/500</span>
              <button v-if="sending" class="button" type="button" @click="stopGeneration">
                停止生成
              </button>
              <button
                v-else
                class="button button--primary"
                type="button"
                :disabled="!input.trim()"
                @click="sendMessage()"
              >
                发送问题
              </button>
            </div>
          </div>
        </article>

        <article v-if="selectedStudy" class="panel assistant-review-panel">
          <div class="panel-heading">
            <div>
              <h2>医生审阅草稿</h2>
              <p>结构化模型提示与临床信息，人工编辑后保存</p>
            </div>
            <span class="record-status record-status--processing">
              {{ review?.status === "reviewed_demo" ? "已人工审阅" : "非正式报告" }}
            </span>
          </div>
          <p class="assistant-review-warning">
            {{
              selectedStudy.model_version?.toLowerCase().includes("mock")
                ? "当前是模拟胸片模型。草稿仅用于功能演示，不得用于患者诊断、检查或治疗决定。"
                : "模型提示不能替代原始影像和医生判断；本模块保存的是审阅草稿，不是正式医疗报告。"
            }}
          </p>
          <div v-if="!review" class="assistant-review-empty">
            填写右侧临床信息后点击“生成审阅草稿”。缺失资料会明确标注为“未提供”。
          </div>
          <div v-else class="assistant-review-fields">
            <label>
              <span>模型提示</span>
              <textarea
                v-model="reviewSections.modelFindings"
                :disabled="review.status !== 'draft'"
                maxlength="2000"
              ></textarea>
            </label>
            <label>
              <span>重点复核</span>
              <textarea
                v-model="reviewSections.reviewPoints"
                :disabled="review.status !== 'draft'"
                maxlength="2000"
              ></textarea>
            </label>
            <label>
              <span>信息缺口</span>
              <textarea
                v-model="reviewSections.missingInformation"
                :disabled="review.status !== 'draft'"
                maxlength="2000"
              ></textarea>
            </label>
            <label>
              <span>下一步核对</span>
              <textarea
                v-model="reviewSections.nextChecks"
                :disabled="review.status !== 'draft'"
                maxlength="2000"
              ></textarea>
            </label>
            <div v-if="review.status === 'draft'" class="assistant-review-actions">
              <button
                class="button"
                type="button"
                :disabled="reviewBusy || reviewStale"
                @click="saveCurrentReview"
              >
                保存修改
              </button>
              <label>
                <input v-model="reviewAcknowledged" type="checkbox" :disabled="reviewStale" />
                我已人工核对原始影像与草稿，理解这不是正式医疗报告
              </label>
              <button
                class="button button--primary"
                type="button"
                :disabled="reviewBusy || (!reviewStale && !reviewAcknowledged)"
                @click="reviewStale ? generateReview() : confirmCurrentReview()"
              >
                {{ reviewStale ? "按当前信息更新草稿" : "标记已审阅" }}
              </button>
            </div>
          </div>
          <div
            v-if="reviewStale && review?.status === 'draft'"
            class="feedback-message feedback-message--error"
          >
            临床信息已变化。点击“按当前信息更新草稿”会生成新草稿并替换当前编辑内容，更新后请重新核对，再标记已审阅。
          </div>
          <div v-if="reviewError" class="feedback-message feedback-message--error">
            {{ reviewError }}
          </div>
          <div v-if="reviewNotice" class="feedback-message feedback-message--success">
            {{ reviewNotice }}
          </div>
        </article>
      </div>

      <aside class="content-stack assistant-clinical-sidebar">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>患者检查记录</h2>
              <p>使用系统内患者编号查询</p>
            </div>
          </div>
          <form class="assistant-patient-search" @submit.prevent="searchPatient()">
            <input
              v-model="subjectId"
              maxlength="64"
              placeholder="输入患者编号"
              autocomplete="off"
            />
            <button
              class="button button--primary"
              type="submit"
              :disabled="!subjectId.trim() || patientLoading"
            >
              {{ patientLoading ? "查询中" : "查询" }}
            </button>
          </form>
          <div v-if="patientError" class="feedback-message feedback-message--error">
            {{ patientError }}
          </div>
          <div v-if="patientStudies.length" class="assistant-study-list">
            <button
              v-for="study in patientStudies"
              :key="study.study_id"
              type="button"
              :class="{ active: study.study_id === selectedStudyId }"
              :disabled="study.status !== 'completed'"
              @click="selectStudy(study.study_id)"
            >
              <div>
                <strong>{{ study.study_id }}</strong>
                <span>{{ formatStudyTime(study.created_at) }} · {{ study.image_count }}张</span>
              </div>
              <small>
                {{
                  study.status === "completed"
                    ? (study.top_findings[0]?.class_name ?? "已完成")
                    : statusLabel(study.status)
                }}
              </small>
            </button>
          </div>
        </article>
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>临床信息</h2>
              <p>仅供专业人员填写；不输入身份信息</p>
            </div>
          </div>
          <div class="assistant-clinical-form">
            <fieldset :disabled="!selectedStudy || reviewBusy">
              <legend>已知症状（可多选）</legend>
              <div class="assistant-symptom-grid">
                <button
                  v-for="symptom in symptomOptions"
                  :key="symptom"
                  type="button"
                  :class="{ active: clinicalInfo.symptoms.includes(symptom) }"
                  @click="toggleSymptom(symptom)"
                >
                  {{ symptom }}
                </button>
              </div>
            </fieldset>
            <label>
              症状持续时间
              <select v-model="clinicalInfo.duration" :disabled="!selectedStudy || reviewBusy">
                <option>未提供</option>
                <option>3天以内</option>
                <option>3至14天</option>
                <option>超过14天</option>
              </select>
            </label>
            <label>
              已知心肺病史
              <select
                v-model="clinicalInfo.heartLungHistory"
                :disabled="!selectedStudy || reviewBusy"
              >
                <option>未提供</option>
                <option>有</option>
                <option>无</option>
              </select>
            </label>
            <label>
              生命体征核对
              <select v-model="clinicalInfo.vitalsReview" :disabled="!selectedStudy || reviewBusy">
                <option>未提供</option>
                <option>已核对</option>
                <option>待核对</option>
              </select>
            </label>
            <p>提问时仅发送这些选项与脱敏模型数据；未填信息不会被推断为正常。</p>
            <button
              class="button button--primary"
              type="button"
              :disabled="!selectedStudy || reviewBusy || authUser?.role === 'viewer'"
              @click="generateReview"
            >
              {{ reviewBusy ? "处理中…" : "生成审阅草稿" }}
            </button>
          </div>
        </article>
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>辅助分析</h2>
              <p>选择检查后快速提问</p>
            </div>
          </div>
          <div class="assistant-prompts">
            <button
              v-for="question in quickQuestions"
              :key="question.label"
              type="button"
              :disabled="sending || !selectedStudy"
              @click="sendMessage(question.label)"
            >
              <b>{{ question.icon }}</b>
              <span>{{ question.label }}</span>
              <i>→</i>
            </button>
          </div>
        </article>
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>审阅状态</h2>
              <p>当前会话与数据边界</p>
            </div>
            <span class="assistant-memory">会话记录已保存</span>
          </div>
          <div
            class="feedback-message"
            :class="stage === 'error' ? 'feedback-message--error' : 'feedback-message--success'"
          >
            {{ stageMessage }}
          </div>
          <div class="assistant-privacy-note">
            <strong>隐私与责任边界</strong>
            <p>
              已完成的对话按账号保存在当前浏览器；审阅草稿保存在本系统数据库。真实模型接入后，提问时会向大模型发送结构化症状选项、脱敏模型分数、历史趋势及你输入的问题；请勿在问题中填写姓名、证件号等身份信息。系统不主动发送患者编号、检查编号或原始胸片。输出不替代医生诊断、处方或治疗决定。
            </p>
          </div>
        </article>
      </aside>
    </div>
  </section>
</template>
