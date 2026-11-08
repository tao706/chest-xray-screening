<script setup lang="ts">import { computed, onMounted, ref, watch } from "vue";
import { generateSubmission, getBatchTasks, getSubmissionDownloadUrl, validateSubmission, } from "@/api/tasks";
import type { BatchTask } from "@/types/batch";
import type { SubmissionValidation } from "@/types/submission";
const tasks = ref<BatchTask[]>([]);
const selectedTaskId = ref("");
const threshold = ref(0.5);
const result = ref<SubmissionValidation>();
const loading = ref(true);
const generating = ref(false);
const validating = ref(false);
const errorMessage = ref("");
const completedTasks = computed(() => tasks.value.filter((task) => task.status === "completed"));
const selectedTask = computed(() => tasks.value.find((task) => task.task_id === selectedTaskId.value));
const canDownload = computed(() => Boolean(result.value?.valid && selectedTaskId.value));
watch(selectedTaskId, () => {
    const task = selectedTask.value;
    if (task)
        threshold.value = task.threshold_value;
    result.value = undefined;
    errorMessage.value = "";
});
async function loadPage() {
    loading.value = true;
    errorMessage.value = "";
    try {
        tasks.value = await getBatchTasks();
        if (!selectedTaskId.value && completedTasks.value[0])
            selectedTaskId.value = completedTasks.value[0].task_id;
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "批量任务加载失败";
    }
    finally {
        loading.value = false;
    }
}
async function createFile() {
    if (!selectedTaskId.value)
        return void (errorMessage.value = "请选择一个已完成的批量任务");
    if (!Number.isFinite(threshold.value) || threshold.value < 0 || threshold.value > 1)
        return void (errorMessage.value = "阈值必须在0到1之间");
    generating.value = true;
    errorMessage.value = "";
    try {
        result.value = await generateSubmission(selectedTaskId.value, threshold.value);
        tasks.value = await getBatchTasks();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "提交文件生成失败";
    }
    finally {
        generating.value = false;
    }
}
async function checkFile() {
    if (!selectedTaskId.value)
        return;
    validating.value = true;
    errorMessage.value = "";
    try {
        result.value = await validateSubmission(selectedTaskId.value);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "提交文件校验失败";
    }
    finally {
        validating.value = false;
    }
}
onMounted(loadPage);
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">SUBMISSION CENTER</p>
        <h1>提交文件</h1>
        <p>按检查汇总预测结果，生成、校验、预览并下载数据文件。</p>
      </div>
      <button class="button refresh-button" type="button" :disabled="loading" @click="loadPage">
        <span class="refresh-button__icon" :class="{ 'is-spinning': loading }" aria-hidden="true">
          ↻
        </span>
        {{ loading ? "刷新中" : "刷新任务" }}
      </button>
    </header>
    <div v-if="errorMessage" class="feedback-message feedback-message--error records-feedback">
      {{ errorMessage }}
    </div>

    <div class="submission-layout">
      <div class="content-stack">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>1. 选择推理任务</h2>
              <p>只有已完成的批量任务可以生成提交文件</p>
            </div>
          </div>
          <div v-if="loading" class="table-state">正在加载任务……</div>
          <template v-else>
            <label class="form-field">
              <span>已完成任务 *</span>
              <select v-model="selectedTaskId">
                <option value="">请选择任务</option>
                <option v-for="task in completedTasks" :key="task.task_id" :value="task.task_id">
                  {{ task.task_name }}（{{ task.completed_count }}/{{ task.total_count }}）
                </option>
              </select>
            </label>
            <div v-if="!completedTasks.length" class="feedback-message feedback-message--error">
              暂无已完成任务，请先前往“批量推理”创建并完成任务。
            </div>
            <div v-if="selectedTask" class="submission-task-meta">
              <div>
                <small>数据集</small>
                <strong>{{ selectedTask.dataset_name }}</strong>
              </div>
              <div>
                <small>已完成检查</small>
                <strong>{{ selectedTask.completed_count }}/{{ selectedTask.total_count }}</strong>
              </div>
              <div>
                <small>失败检查</small>
                <strong>{{ selectedTask.failed_count }}</strong>
              </div>
              <div>
                <small>已有文件</small>
                <strong>{{ selectedTask.csv_path ? "是" : "否" }}</strong>
              </div>
            </div>
          </template>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>2. 生成规则</h2>
              <p>文件字段依次为患者编号、检查编号、预测类别、预测概率</p>
            </div>
          </div>
          <label class="form-field">
            <span>多标签判断阈值</span>
            <input v-model.number="threshold" type="number" min="0" max="1" step="0.01" />
          </label>
          <div class="submission-rule">
            <strong>检查覆盖保护</strong>
            <p>
              若一次检查没有任何类别达到阈值，系统会补入概率最高的一类，并在校验报告中统计补位数量。
            </p>
          </div>
          <div class="form-actions submission-actions">
            <button
              class="button"
              type="button"
              :disabled="!selectedTaskId || validating"
              @click="checkFile"
            >
              {{ validating ? "校验中……" : "校验已有文件" }}
            </button>
            <button
              class="button button--primary"
              type="button"
              :disabled="!selectedTaskId || generating"
              @click="createFile"
            >
              {{ generating ? "正在生成……" : "生成并校验" }}
            </button>
          </div>
        </article>

        <article v-if="result" class="panel">
          <div class="panel-heading">
            <div>
              <h2>3. 数据预览</h2>
              <p>最多展示前50行，下载文件包含全部结果</p>
            </div>
            <span
              class="record-status"
              :class="result.valid ? 'record-status--completed' : 'record-status--failed'"
            >
              {{ result.valid ? "校验通过" : "校验未通过" }}
            </span>
          </div>
          <div class="table-wrapper">
            <table class="records-table submission-table">
              <thead>
                <tr>
                  <th>患者编号</th>
                  <th>检查编号</th>
                  <th>预测类别</th>
                  <th>预测概率</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, index) in result.preview"
                  :key="`${row.Study_id}-${row.Predict_class}-${index}`"
                >
                  <td>{{ row.Subject_id }}</td>
                  <td>{{ row.Study_id }}</td>
                  <td>{{ row.Predict_class }}</td>
                  <td>{{ row.Probability.toFixed(8) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="!result.preview.length" class="table-state">文件中没有有效数据行</div>
        </article>
      </div>

      <aside class="content-stack">
        <article class="panel submission-report">
          <div class="panel-heading">
            <div>
              <h2>校验报告</h2>
              <p>下载前必须通过全部硬性检查</p>
            </div>
          </div>
          <div v-if="!result" class="submission-report-empty">
            <div class="submission-report-empty__content">
              <span class="submission-report-empty__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M7 3.75h8.5L19 7.2v13.05H7z" />
                  <path d="M15.5 3.75V7.2H19M9.5 13l1.7 1.7 3.5-3.7" />
                </svg>
              </span>
              <span class="submission-report-empty__badge">校验准备区</span>
              <h3>等待生成或校验文件</h3>
              <p>完成左侧操作后，这里将汇总文件格式、数据范围和检查覆盖情况。</p>
              <div class="submission-report-empty__steps" aria-label="文件校验流程">
                <div>
                  <b>01</b>
                  <span>生成文件</span>
                </div>
                <i>→</i>
                <div>
                  <b>02</b>
                  <span>完整校验</span>
                </div>
                <i>→</i>
                <div>
                  <b>03</b>
                  <span>确认下载</span>
                </div>
              </div>
              <small>
                <i></i>
                校验通过后即可下载结果文件
              </small>
            </div>
          </div>
          <template v-else>
            <div
              class="submission-verdict"
              :class="result.valid ? 'submission-verdict--valid' : 'submission-verdict--invalid'"
            >
              <strong>{{ result.valid ? "✓ 可以提交" : "× 暂不可提交" }}</strong>
              <span>
                {{ result.valid ? "格式与检查覆盖校验均通过" : "请处理下方错误后重新生成" }}
              </span>
            </div>
            <div class="submission-metrics">
              <div>
                <small>数据行</small>
                <strong>{{ result.rowCount }}</strong>
              </div>
              <div>
                <small>检查覆盖</small>
                <strong>{{ result.coveredStudyCount }}/{{ result.expectedStudyCount }}</strong>
              </div>
              <div>
                <small>阈值</small>
                <strong>{{ result.threshold.toFixed(2) }}</strong>
              </div>
              <div>
                <small>最高类补位</small>
                <strong>{{ result.fallbackStudyCount }}</strong>
              </div>
            </div>
            <ul class="validation-list submission-checks">
              <li :class="result.headersValid ? 'valid' : 'warning'">
                {{ result.headersValid ? "✓" : "×" }} 表头与字段顺序
              </li>
              <li :class="result.invalidRowCount === 0 ? 'valid' : 'warning'">
                {{ result.invalidRowCount === 0 ? "✓" : "×" }} 空值、类别编号与概率范围
              </li>
              <li :class="result.duplicateCount === 0 ? 'valid' : 'warning'">
                {{ result.duplicateCount === 0 ? "✓" : "×" }} 检查与类别无重复
              </li>
              <li
                :class="
                  result.coveredStudyCount === result.expectedStudyCount ? 'valid' : 'warning'
                "
              >
                {{
                  result.coveredStudyCount === result.expectedStudyCount ? "✓" : "×"
                }}
                已完成检查全部覆盖
              </li>
              <li :class="result.failedStudyCount === 0 ? 'valid' : 'warning'">
                {{ result.failedStudyCount === 0 ? "✓" : "×" }} 批量任务无失败检查
              </li>
            </ul>
            <div
              v-for="message in result.errors"
              :key="message"
              class="feedback-message feedback-message--error"
            >
              {{ message }}
            </div>
            <div
              v-for="message in result.warnings"
              :key="message"
              class="feedback-message submission-warning"
            >
              {{ message }}
            </div>
            <a
              v-if="canDownload"
              class="button button--primary button--wide submission-download-button"
              :href="getSubmissionDownloadUrl(selectedTaskId)"
              download="submission.csv"
            >
              下载 submission.csv
            </a>
            <button
              v-else
              class="button button--wide submission-download-button"
              type="button"
              disabled
            >
              校验通过后可下载
            </button>
            <div
              class="submission-report-summary"
              :class="
                result.valid
                  ? 'submission-report-summary--valid'
                  : 'submission-report-summary--invalid'
              "
            >
              <span aria-hidden="true">{{ result.valid ? "✓" : "!" }}</span>
              <small>文件状态</small>
              <strong>{{ result.valid ? "结果文件已准备就绪" : "请先处理校验问题" }}</strong>
              <p>
                {{
                  result.valid
                    ? `已覆盖 ${result.coveredStudyCount} 项检查，共生成 ${result.rowCount} 行有效数据。`
                    : `当前发现 ${result.errors.length} 项错误和 ${result.warnings.length} 项提示。`
                }}
              </p>
              <div>
                <b>字段规范</b>
                <b>数据范围</b>
                <b>检查覆盖</b>
              </div>
            </div>
          </template>
        </article>
      </aside>
    </div>
  </section>
</template>
