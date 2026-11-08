<script setup lang="ts">import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { createBatchTask, deleteBatchTask, deleteBatchTasks, getBatchTask, getBatchTasks, getDatasets, scanDataset, } from "@/api/tasks";
import type { BatchProgressEvent, BatchTask, DatasetSummary } from "@/types/batch";
import { statusLabel } from "./statusLabel";
const datasets = ref<DatasetSummary[]>([]);
const tasks = ref<BatchTask[]>([]);
const selectedDataset = ref("");
const scannedDataset = ref<DatasetSummary>();
const taskName = ref("");
const threshold = ref(0.5);
const activeTask = ref<BatchTask>();
const logs = ref<string[]>([]);
const loading = ref(true);
const creating = ref(false);
const errorMessage = ref("");
const selectedTaskIds = ref<string[]>([]);
const selectingTasks = ref(false);
const pendingDelete = ref<BatchTask[]>([]);
const deleting = ref(false);
const toast = ref<{
    type: "success" | "error";
    message: string;
} | null>(null);
let toastTimer: number | undefined;
let eventSource: EventSource | undefined;
const progressTaskId = ref("");
const progressError = ref("");
const updatedAt = ref("");
const readingProgress = ref(false);
let progressVersion = 0;
let disposed = false;
function selectProgress(taskId: string, snapshot?: BatchTask) {
    progressVersion++;
    eventSource?.close();
    eventSource = undefined;
    progressTaskId.value = taskId;
    activeTask.value = snapshot;
    readingProgress.value = false;
    progressError.value = "";
    updatedAt.value = "";
    logs.value = [];
}
async function refreshTaskList() {
    try {
        const list = await getBatchTasks();
        if (!disposed)
            updateTasks(list);
    }
    catch {
        errorMessage.value = "最近任务列表更新失败，请点击页面顶部的刷新按钮。";
    }
}
async function refreshProgress(created = false) {
    const id = progressTaskId.value;
    if (!id || disposed)
        return;
    const version = ++progressVersion;
    readingProgress.value = true;
    try {
        const task = await getBatchTask(id);
        if (version !== progressVersion)
            return;
        activeTask.value = task;
        updatedAt.value = new Date().toLocaleTimeString("zh-CN", { hour12: false });
        progressError.value = "";
        if (canDeleteTask(task)) {
            const wasStreaming = Boolean(eventSource);
            eventSource?.close();
            eventSource = undefined;
            if (wasStreaming)
                await refreshTaskList();
        }
        else if (!eventSource) {
            connectEvents(id);
        }
    }
    catch {
        if (version === progressVersion) {
            progressError.value = created
                ? "任务已创建，进度暂未加载。"
                : "任务进度更新失败，请重新加载。";
        }
    }
    finally {
        if (version === progressVersion)
            readingProgress.value = false;
    }
}
const deletableTasks = computed(() => tasks.value.filter((task) => canDeleteTask(task)));
const allDeletableSelected = computed(() => deletableTasks.value.length > 0 &&
    deletableTasks.value.every((task) => selectedTaskIds.value.includes(task.task_id)));
const someDeletableSelected = computed(() => deletableTasks.value.some((task) => selectedTaskIds.value.includes(task.task_id)));
function canDeleteTask(task: BatchTask) {
    return task.status === "completed" || task.status === "failed";
}
function updateTasks(nextTasks: BatchTask[]) {
    tasks.value = nextTasks;
    const available = new Set(nextTasks.filter(canDeleteTask).map((task) => task.task_id));
    selectedTaskIds.value = selectedTaskIds.value.filter((id) => available.has(id));
    if (!selectedTaskIds.value.length)
        selectingTasks.value = false;
}
function toggleAll(checked: boolean) {
    selectingTasks.value = checked;
    selectedTaskIds.value = checked ? deletableTasks.value.map((task) => task.task_id) : [];
}
function toggleTask(taskId: string, checked: boolean) {
    selectedTaskIds.value = checked
        ? [...selectedTaskIds.value, taskId]
        : selectedTaskIds.value.filter((id) => id !== taskId);
}
function requestDelete(task?: BatchTask) {
    pendingDelete.value = task
        ? [task]
        : tasks.value.filter((item) => selectedTaskIds.value.includes(item.task_id) && canDeleteTask(item));
}
function closeDeleteDialog() {
    if (!deleting.value)
        pendingDelete.value = [];
}
function showToast(type: "success" | "error", message: string) {
    toast.value = { type, message };
    if (toastTimer)
        window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.value = null;
    }, 3600);
}
async function confirmDelete() {
    const ids = pendingDelete.value.map((task) => task.task_id);
    if (!ids.length || deleting.value)
        return;
    deleting.value = true;
    try {
        if (ids.length === 1)
            await deleteBatchTask(ids[0]!);
        else
            await deleteBatchTasks(ids);
        const removed = new Set(ids);
        updateTasks(tasks.value.filter((task) => !removed.has(task.task_id)));
        if (removed.has(progressTaskId.value))
            selectProgress("");
        pendingDelete.value = [];
        showToast("success", ids.length === 1 ? "任务已删除" : `已删除 ${ids.length} 个任务`);
    }
    catch (error) {
        showToast("error", error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
    finally {
        deleting.value = false;
    }
}
const progress = computed(() => {
    if (!activeTask.value?.total_count)
        return 0;
    return Math.min(100, ((activeTask.value.completed_count + activeTask.value.failed_count) /
        activeTask.value.total_count) *
        100);
});
const taskProgressLabel = computed(() => {
    const task = activeTask.value;
    if (!task)
        return "";
    if (task.status === "completed")
        return "全部处理完成";
    if (task.status === "failed")
        return "任务已结束";
    if (!task.total_count)
        return "等待任务开始";
    return `已处理 ${task.completed_count + task.failed_count} / ${task.total_count} 项`;
});
const taskProgressDescription = computed(() => {
    const task = activeTask.value;
    if (!task)
        return "";
    if (task.status === "completed")
        return `本次批量分析已完成，共处理 ${task.total_count} 项检查。`;
    if (task.status === "failed")
        return `任务已经结束，完成 ${task.completed_count} 项，失败 ${task.failed_count} 项。`;
    if (task.status === "scanning")
        return "正在读取数据集并准备检查队列，请稍候。";
    if (task.status === "running")
        return `任务正在运行，已完成 ${task.completed_count} 项检查。`;
    return "任务已创建，正在等待进入处理队列。";
});
async function loadPage() {
    loading.value = true;
    errorMessage.value = "";
    try {
        const [nextDatasets, nextTasks] = await Promise.all([getDatasets(), getBatchTasks()]);
        datasets.value = nextDatasets;
        updateTasks(nextTasks);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "批量任务页面加载失败";
    }
    finally {
        loading.value = false;
    }
}
async function inspectDataset() {
    if (!selectedDataset.value)
        return;
    errorMessage.value = "";
    try {
        scannedDataset.value = await scanDataset(selectedDataset.value);
        if (!taskName.value)
            taskName.value = `${selectedDataset.value}-批量推理`;
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "数据集扫描失败";
    }
}
async function startTask() {
    if (!taskName.value.trim())
        return void (errorMessage.value = "请输入任务名称");
    if (!selectedDataset.value)
        return void (errorMessage.value = "请选择数据集");
    if (!scannedDataset.value?.studyCount)
        return void (errorMessage.value = "请先扫描数据集并确认包含有效检查");
    creating.value = true;
    errorMessage.value = "";
    try {
        const created = await createBatchTask({
            taskName: taskName.value.trim(),
            datasetName: selectedDataset.value,
            threshold: threshold.value,
        });
        if (disposed)
            return;
        selectProgress(created.task_id);
        await Promise.all([refreshProgress(true), refreshTaskList()]);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "批量任务创建失败";
    }
    finally {
        creating.value = false;
    }
}
function connectEvents(taskId: string) {
    const source = new EventSource(`/api/tasks/${encodeURIComponent(taskId)}/events`);
    eventSource = source;
    const handle = (event: Event) => {
        if (eventSource !== source)
            return;
        try {
            const payload = JSON.parse((event as MessageEvent<string>).data) as BatchProgressEvent;
            logs.value.unshift(`${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${payload.message}`);
        }
        catch {
            progressError.value = "进度消息格式异常，请重新加载。";
            return;
        }
        void refreshProgress();
    };
    source.onopen = () => {
        if (eventSource === source)
            void refreshProgress();
    };
    ["scan", "progress", "warning", "completed", "failed"].forEach((name) => source.addEventListener(name, handle));
    source.onerror = () => {
        if (eventSource !== source)
            return;
        progressError.value = "实时连接中断，正在尝试重新连接。";
        if (source.readyState === EventSource.CLOSED) {
            eventSource = undefined;
            progressError.value = "实时连接已关闭，请重新加载进度。";
        }
    };
}
function openTask(task: BatchTask) {
    if (task.task_id !== progressTaskId.value)
        selectProgress(task.task_id, task);
    void refreshProgress();
}
onMounted(loadPage);
onBeforeUnmount(() => {
    disposed = true;
    selectProgress("");
    if (toastTimer)
        window.clearTimeout(toastTimer);
});
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">BATCH INFERENCE</p>
        <h1>批量推理</h1>
        <p>扫描数据集，对其中的检查逐一分析并显示实时进度。</p>
      </div>
      <button class="button refresh-button" type="button" :disabled="loading" @click="loadPage">
        <span class="refresh-button__icon" :class="{ 'is-spinning': loading }" aria-hidden="true">
          ↻
        </span>
        {{ loading ? "刷新中" : "刷新" }}
      </button>
    </header>
    <div v-if="errorMessage" class="feedback-message feedback-message--error records-feedback">
      {{ errorMessage }}
    </div>

    <div class="batch-layout">
      <div class="content-stack">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>创建批量任务</h2>
              <p>选择已配置的数据集并创建批量分析任务</p>
            </div>
          </div>
          <div v-if="loading" class="table-state">正在读取数据集……</div>
          <template v-else>
            <label class="form-field">
              <span>数据集 *</span>
              <select v-model="selectedDataset" @change="scannedDataset = undefined">
                <option value="">请选择数据集</option>
                <option v-for="dataset in datasets" :key="dataset.name" :value="dataset.name">
                  {{ dataset.name }}（{{ dataset.studyCount }}次检查）
                </option>
              </select>
            </label>
            <div v-if="!datasets.length" class="feedback-message feedback-message--error">
              当前暂无可用数据集，请联系系统管理员完成数据配置后刷新页面。
            </div>
            <div class="form-grid form-grid--two">
              <label class="form-field">
                <span>任务名称 *</span>
                <input v-model="taskName" maxlength="100" placeholder="例如：测试集第一轮推理" />
              </label>
              <label class="form-field">
                <span>提交阈值</span>
                <input v-model.number="threshold" type="number" min="0" max="1" step="0.01" />
              </label>
            </div>
            <div class="form-actions batch-create-actions">
              <button
                class="button"
                type="button"
                :disabled="!selectedDataset"
                @click="inspectDataset"
              >
                扫描数据集
              </button>
              <button
                class="button button--primary"
                type="button"
                :disabled="creating"
                @click="startTask"
              >
                {{ creating ? "正在创建……" : "创建并开始" }}
              </button>
            </div>
          </template>
        </article>

        <article v-if="scannedDataset" class="panel">
          <div class="panel-heading">
            <div>
              <h2>扫描结果</h2>
              <p>{{ scannedDataset.name }}</p>
            </div>
            <span class="record-status record-status--completed">可以创建任务</span>
          </div>
          <div class="dataset-metrics">
            <div>
              <small>检查数量</small>
              <strong>{{ scannedDataset.studyCount }}</strong>
            </div>
            <div>
              <small>图片数量</small>
              <strong>{{ scannedDataset.imageCount }}</strong>
            </div>
            <div>
              <small>非图片文件</small>
              <strong>{{ scannedDataset.invalidFileCount }}</strong>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading batch-task-heading">
            <div>
              <h2>最近任务</h2>
              <p>最多显示最近100条，进行中的任务暂不可删除</p>
            </div>
            <div class="batch-task-toolbar">
              <label>
                <input
                  type="checkbox"
                  :checked="allDeletableSelected"
                  :indeterminate="someDeletableSelected && !allDeletableSelected"
                  :disabled="!deletableTasks.length || deleting"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
                全选
              </label>
              <button
                class="button batch-task-toolbar__delete"
                type="button"
                :disabled="!selectedTaskIds.length || deleting"
                @click="requestDelete()"
              >
                删除所选{{ selectedTaskIds.length ? `（${selectedTaskIds.length}）` : "" }}
              </button>
            </div>
          </div>
          <div v-if="!tasks.length" class="table-state">暂无批量任务</div>
          <div v-else class="batch-task-list">
            <div
              v-for="task in tasks"
              :key="task.task_id"
              class="batch-task-row"
              :class="{
                'batch-task-row--selected': selectedTaskIds.includes(task.task_id),
                'batch-task-row--selecting': selectingTasks,
              }"
            >
              <label
                v-if="selectingTasks"
                class="batch-task-row__check"
                :title="canDeleteTask(task) ? '选择任务' : '进行中的任务暂不可删除'"
              >
                <input
                  type="checkbox"
                  :aria-label="`选择任务 ${task.task_name}`"
                  :checked="selectedTaskIds.includes(task.task_id)"
                  :disabled="!canDeleteTask(task) || deleting"
                  @change="toggleTask(task.task_id, ($event.target as HTMLInputElement).checked)"
                />
              </label>
              <button class="batch-task-row__open" type="button" @click="openTask(task)">
                <span
                  class="record-status"
                  :class="`record-status--${task.status === 'running' || task.status === 'scanning' ? 'processing' : task.status}`"
                >
                  {{ statusLabel(task.status) }}
                </span>
                <span class="batch-task-row__details">
                  <strong>{{ task.task_name }}</strong>
                  <small>
                    {{ task.dataset_name }} · {{ task.completed_count + task.failed_count }}/{{
                      task.total_count
                    }}
                  </small>
                </span>
                <b>
                  {{
                    task.total_count
                      ? `${Math.round(((task.completed_count + task.failed_count) / task.total_count) * 100)}%`
                      : "0%"
                  }}
                </b>
              </button>
              <button
                class="batch-task-row__delete"
                type="button"
                :disabled="!canDeleteTask(task) || deleting"
                :title="canDeleteTask(task) ? '删除任务' : '进行中的任务暂不可删除'"
                aria-label="删除任务"
                @click="requestDelete(task)"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" />
                </svg>
              </button>
            </div>
          </div>
        </article>
      </div>

      <aside class="content-stack">
        <article class="panel batch-progress-panel">
          <div class="panel-heading">
            <div>
              <h2>实时任务进度</h2>
              <p>任务处理情况实时更新</p>
            </div>
            <span
              v-if="activeTask"
              class="record-status"
              :class="`record-status--${activeTask.status === 'running' || activeTask.status === 'scanning' ? 'processing' : activeTask.status}`"
            >
              {{ statusLabel(activeTask.status) }}
            </span>
          </div>
          <div v-if="progressError" class="feedback-message feedback-message--error" role="status">
            {{ progressError }}
            <span v-if="updatedAt">上次更新 {{ updatedAt }}</span>
            <button
              class="button refresh-button"
              type="button"
              :disabled="readingProgress"
              @click="refreshProgress()"
            >
              重新加载进度
            </button>
          </div>
          <p v-if="progressTaskId && !activeTask && !progressError" role="status">
            任务已创建，正在加载进度……
          </p>
          <div v-if="!progressTaskId" class="batch-progress-empty">
            <div class="batch-progress-empty__content">
              <span class="batch-progress-empty__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M7 3.75h8.5L19 7.2v13.05H7z" />
                  <path d="M15.5 3.75V7.2H19M10 11h6m-6 3h6m-6 3h4" />
                </svg>
              </span>
              <span class="batch-progress-empty__badge">任务准备区</span>
              <h3>创建或选择批量任务</h3>
              <p>任务启动后，这里将实时展示整体进度、处理数量和当前检查。</p>
              <div class="batch-progress-empty__steps" aria-label="批量任务流程">
                <div>
                  <b>01</b>
                  <span>选择数据集</span>
                </div>
                <i>→</i>
                <div>
                  <b>02</b>
                  <span>创建任务</span>
                </div>
                <i>→</i>
                <div>
                  <b>03</b>
                  <span>查看进度</span>
                </div>
              </div>
              <small>
                <i></i>
                也可以从左侧“最近任务”中选择已有任务
              </small>
            </div>
          </div>
          <template v-else-if="activeTask">
            <strong class="batch-progress-value">{{ progress.toFixed(1) }}%</strong>
            <div class="batch-progress-track"><span :style="{ width: `${progress}%` }"></span></div>
            <div class="dataset-metrics">
              <div>
                <small>总数</small>
                <strong>{{ activeTask.total_count }}</strong>
              </div>
              <div>
                <small>完成</small>
                <strong>{{ activeTask.completed_count }}</strong>
              </div>
              <div>
                <small>失败</small>
                <strong>{{ activeTask.failed_count }}</strong>
              </div>
            </div>
            <dl class="summary-list batch-progress-details">
              <div>
                <dt>任务名称</dt>
                <dd>{{ activeTask.task_name }}</dd>
              </div>
              <div>
                <dt>数据集</dt>
                <dd>{{ activeTask.dataset_name }}</dd>
              </div>
              <div>
                <dt>处理进度</dt>
                <dd>{{ taskProgressLabel }}</dd>
              </div>
              <div>
                <dt>提交阈值</dt>
                <dd>{{ activeTask.threshold_value.toFixed(2) }}</dd>
              </div>
            </dl>
            <div
              class="batch-progress-insight"
              :class="`batch-progress-insight--${activeTask.status}`"
            >
              <span class="batch-progress-insight__icon" aria-hidden="true">
                {{
                  activeTask.status === "completed"
                    ? "✓"
                    : activeTask.status === "failed"
                      ? "!"
                      : "↻"
                }}
              </span>
              <div class="batch-progress-insight__copy">
                <small>当前状态</small>
                <strong>{{ statusLabel(activeTask.status) }}</strong>
                <p>{{ taskProgressDescription }}</p>
              </div>
              <div class="batch-progress-milestones" aria-label="任务处理阶段">
                <span class="is-active">
                  <i>✓</i>
                  <b>任务创建</b>
                </span>
                <em></em>
                <span :class="{ 'is-active': activeTask.status !== 'pending' }">
                  <i>{{ activeTask.status === "pending" ? "2" : "✓" }}</i>
                  <b>批量分析</b>
                </span>
                <em></em>
                <span
                  :class="{
                    'is-active': activeTask.status === 'completed',
                    'is-failed': activeTask.status === 'failed',
                  }"
                >
                  <i>
                    {{
                      activeTask.status === "completed"
                        ? "✓"
                        : activeTask.status === "failed"
                          ? "!"
                          : "3"
                    }}
                  </i>
                  <b>{{ activeTask.status === "failed" ? "任务结束" : "处理完成" }}</b>
                </span>
              </div>
            </div>
            <div class="batch-log">
              <p v-if="!logs.length">等待进度消息……</p>
              <p v-for="(log, index) in logs" :key="index">{{ log }}</p>
            </div>
          </template>
        </article>
      </aside>
    </div>
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="pendingDelete.length"
          class="delete-modal-backdrop"
          role="presentation"
          @click.self="closeDeleteDialog"
          @keydown.esc="closeDeleteDialog"
        >
          <section
            class="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-delete-title"
            tabindex="-1"
          >
            <header class="delete-modal__header">
              <div class="delete-modal__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                </svg>
              </div>
              <div class="delete-modal__content">
                <span>批量推理</span>
                <h2 id="batch-delete-title">
                  {{
                    pendingDelete.length === 1
                      ? "删除这个任务？"
                      : `删除所选 ${pendingDelete.length} 个任务？`
                  }}
                </h2>
              </div>
            </header>
            <p class="delete-modal__description">
              删除后，任务进度、任务明细及其导出文件将无法恢复；已生成的检查记录会保留。
            </p>
            <div class="delete-modal__record">
              <div>
                <small>{{ pendingDelete.length === 1 ? "任务名称" : "任务数量" }}</small>
                <strong>
                  {{
                    pendingDelete.length === 1
                      ? pendingDelete[0]?.task_name
                      : `${pendingDelete.length} 个任务`
                  }}
                </strong>
              </div>
              <div>
                <small>{{ pendingDelete.length === 1 ? "数据集" : "删除范围" }}</small>
                <strong>
                  {{
                    pendingDelete.length === 1 ? pendingDelete[0]?.dataset_name : "所选已结束任务"
                  }}
                </strong>
              </div>
            </div>
            <div class="delete-modal__actions">
              <button class="button" type="button" :disabled="deleting" @click="closeDeleteDialog">
                取消
              </button>
              <button
                class="delete-modal__confirm"
                type="button"
                :disabled="deleting"
                @click="confirmDelete"
              >
                <span v-if="deleting" class="delete-modal__spinner" aria-hidden="true"></span>
                {{ deleting ? "正在删除" : "确认删除" }}
              </button>
            </div>
          </section>
        </div>
      </Transition>
      <Transition name="toast-slide">
        <div
          v-if="toast"
          class="app-toast"
          :class="`app-toast--${toast.type}`"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">{{ toast.type === "success" ? "✓" : "!" }}</span>
          <div>
            <strong>{{ toast.type === "success" ? "删除成功" : "删除失败" }}</strong>
            <p>{{ toast.message }}</p>
          </div>
          <button type="button" aria-label="关闭提示" @click="toast = null">×</button>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>
