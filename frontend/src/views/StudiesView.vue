<script setup lang="ts">import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { deleteStudy, getStudies } from "@/api/studies";
import type { StudySummary } from "@/types/prediction";
import { statusLabel } from "./statusLabel";
const filters = reactive({ subjectId: "", studyId: "", status: "" });
const rows = ref<StudySummary[]>([]);
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const loading = ref(false);
const errorMessage = ref("");
const deletingId = ref("");
const pendingDelete = ref<StudySummary | null>(null);
const toast = ref<{
    type: "success" | "error";
    message: string;
} | null>(null);
let toastTimer: number | undefined;
async function loadStudies(resetPage = false) {
    if (resetPage)
        page.value = 1;
    loading.value = true;
    errorMessage.value = "";
    try {
        const result = await getStudies({
            page: page.value,
            pageSize,
            subjectId: filters.subjectId.trim(),
            studyId: filters.studyId.trim(),
            status: filters.status,
        });
        rows.value = result.items;
        total.value = result.total;
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "检查记录加载失败";
    }
    finally {
        loading.value = false;
    }
}
function resetFilters() {
    filters.subjectId = "";
    filters.studyId = "";
    filters.status = "";
    void loadStudies(true);
}
function showToast(type: "success" | "error", message: string) {
    toast.value = { type, message };
    if (toastTimer)
        window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.value = null;
    }, 3600);
}
function requestDelete(row: StudySummary) {
    pendingDelete.value = row;
}
function closeDeleteDialog() {
    if (!deletingId.value)
        pendingDelete.value = null;
}
async function deleteSelectedStudy() {
    const studyId = pendingDelete.value?.study_id;
    if (!studyId || deletingId.value)
        return;
    deletingId.value = studyId;
    try {
        await deleteStudy(studyId);
        pendingDelete.value = null;
        await loadStudies();
        showToast("success", `检查 ${studyId} 已成功删除`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "删除失败，请稍后重试";
        showToast("error", message);
    }
    finally {
        deletingId.value = "";
    }
}
function changePage(nextPage: number) {
    if (nextPage < 1 || nextPage > Math.max(1, Math.ceil(total.value / pageSize)))
        return;
    page.value = nextPage;
    void loadStudies();
}
function formatDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
onMounted(() => loadStudies());
onBeforeUnmount(() => {
    if (toastTimer)
        window.clearTimeout(toastTimer);
});
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">STUDY RECORDS</p>
        <h1>检查记录</h1>
        <p>查询、筛选并查看已经保存的检查结果。</p>
      </div>
      <RouterLink class="button button--primary" to="/studies/new">新建检查</RouterLink>
    </header>

    <article class="panel filters-panel">
      <div class="panel-heading">
        <div>
          <h2>查询与筛选</h2>
          <p>编号按字符串查询并保留前导零</p>
        </div>
      </div>
      <form class="records-filter" @submit.prevent="loadStudies(true)">
        <label class="form-field">
          <span>患者编号</span>
          <input v-model="filters.subjectId" placeholder="输入患者编号" />
        </label>
        <label class="form-field">
          <span>检查编号</span>
          <input v-model="filters.studyId" placeholder="输入检查编号" />
        </label>
        <label class="form-field">
          <span>检查状态</span>
          <select v-model="filters.status">
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="processing">处理中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
        </label>
        <div class="records-filter__actions">
          <button class="button" type="button" @click="resetFilters">重置</button>
          <button class="button button--primary" type="submit">查询</button>
        </div>
      </form>
    </article>

    <div v-if="errorMessage" class="feedback-message feedback-message--error records-feedback">
      {{ errorMessage }}
    </div>
    <article class="panel records-panel">
      <div class="panel-heading">
        <div>
          <h2>记录列表</h2>
          <p>共{{ total }}条记录，当前第{{ page }}页</p>
        </div>
        <button
          class="button refresh-button"
          type="button"
          :disabled="loading"
          @click="loadStudies()"
        >
          <span class="refresh-button__icon" :class="{ 'is-spinning': loading }" aria-hidden="true">
            ↻
          </span>
          {{ loading ? "刷新中" : "刷新" }}
        </button>
      </div>
      <div v-if="loading" class="table-state">正在加载检查记录……</div>
      <div v-else-if="!rows.length" class="table-state">暂无符合条件的检查记录</div>
      <div v-else class="table-wrapper">
        <table class="records-table studies-records-table">
          <thead>
            <tr>
              <th>患者编号</th>
              <th>检查编号</th>
              <th>图片</th>
              <th>状态</th>
              <th>最高概率类别</th>
              <th>最高概率</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>
                <strong>{{ row.subject_id }}</strong>
              </td>
              <td>{{ row.study_id }}</td>
              <td>{{ row.image_count }}</td>
              <td>
                <span class="record-status" :class="`record-status--${row.status}`">
                  {{ statusLabel(row.status) }}
                </span>
              </td>
              <td>{{ row.top_class_name ?? row.error_message ?? "—" }}</td>
              <td>
                {{
                  row.top_probability === null ? "—" : `${(row.top_probability * 100).toFixed(1)}%`
                }}
              </td>
              <td>{{ formatDate(row.created_at) }}</td>
              <td>
                <div class="record-actions">
                  <RouterLink :to="`/studies/${encodeURIComponent(row.study_id)}`">详情</RouterLink>
                  <RouterLink
                    v-if="row.status === 'completed'"
                    :to="`/studies/${encodeURIComponent(row.study_id)}/result`"
                  >
                    结果
                  </RouterLink>
                  <button type="button" :disabled="Boolean(deletingId)" @click="requestDelete(row)">
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination-bar">
        <span>每页{{ pageSize }}条</span>
        <div>
          <button
            class="button"
            type="button"
            :disabled="page <= 1 || loading"
            @click="changePage(page - 1)"
          >
            上一页
          </button>
          <span>第{{ page }} / {{ Math.max(1, Math.ceil(total / pageSize)) }}页</span>
          <button
            class="button"
            type="button"
            :disabled="page >= Math.ceil(total / pageSize) || loading"
            @click="changePage(page + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </article>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="pendingDelete"
          class="delete-modal-backdrop"
          role="presentation"
          @click.self="closeDeleteDialog"
          @keydown.esc="closeDeleteDialog"
        >
          <section
            class="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            tabindex="-1"
          >
            <header class="delete-modal__header">
              <div class="delete-modal__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                </svg>
              </div>
              <div class="delete-modal__content">
                <span>检查记录</span>
                <h2 id="delete-modal-title">删除这次检查？</h2>
              </div>
            </header>
            <p class="delete-modal__description">
              请核对以下信息。删除后，该检查及其关联分析结果将无法恢复。
            </p>
            <div class="delete-modal__record">
              <div>
                <small>患者编号</small>
                <strong>{{ pendingDelete.subject_id }}</strong>
              </div>
              <div>
                <small>检查编号</small>
                <strong>{{ pendingDelete.study_id }}</strong>
              </div>
            </div>
            <div class="delete-modal__actions">
              <button
                class="button"
                type="button"
                :disabled="Boolean(deletingId)"
                @click="closeDeleteDialog"
              >
                取消
              </button>
              <button
                class="delete-modal__confirm"
                type="button"
                :disabled="Boolean(deletingId)"
                @click="deleteSelectedStudy"
              >
                <span v-if="deletingId" class="delete-modal__spinner" aria-hidden="true"></span>
                {{ deletingId ? "正在删除" : "确认删除" }}
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
