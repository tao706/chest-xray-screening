<script setup lang="ts">import { statusLabel } from "./statusLabel";
import { computed, onMounted, ref } from "vue";
import { getDashboard } from "@/api/dashboard";
import { getSystemHealth } from "@/api/health";
import type { DashboardData } from "@/types/dashboard";
import type { HealthResult } from "@/types/health";
const dashboard = ref<DashboardData>();
const health = ref<HealthResult>();
const loading = ref(true);
const errorMessage = ref("");
const maximumClassCount = computed(() => Math.max(1, ...(dashboard.value?.class_counts.map((item) => item.count) ?? [1])));
const analysisAvailable = computed(() => Boolean(health.value?.success &&
    health.value.data.express.status === "healthy" &&
    health.value.data.database.status === "healthy" &&
    health.value.data.inference.status === "healthy" &&
    health.value.data.inference.data?.model_ready));
async function loadDashboard() {
    loading.value = true;
    errorMessage.value = "";
    try {
        const [data, healthResult] = await Promise.all([
            getDashboard(),
            getSystemHealth().catch(() => undefined),
        ]);
        dashboard.value = data;
        health.value = healthResult;
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "首页数据加载失败";
    }
    finally {
        loading.value = false;
    }
}
function formatProbability(value: number | null) {
    return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}
function formatDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
onMounted(loadDashboard);
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">DASHBOARD</p>
        <h1>运行总览</h1>
        <p>查看近期检查与影像分析概况。</p>
      </div>
      <div class="dashboard-refresh">
        <span v-if="dashboard">更新于 {{ formatDate(dashboard.generated_at) }}</span>
        <button
          class="button refresh-button"
          type="button"
          :disabled="loading"
          @click="loadDashboard"
        >
          <span class="refresh-button__icon" :class="{ 'is-spinning': loading }" aria-hidden="true">
            ↻
          </span>
          {{ loading ? "刷新中" : "刷新数据" }}
        </button>
        <RouterLink class="button button--primary" to="/studies/new">新建检查</RouterLink>
      </div>
    </header>
    <div v-if="errorMessage" class="feedback-message feedback-message--error">
      {{ errorMessage }}
    </div>
    <article v-if="loading && !dashboard" class="panel table-state">正在汇总运行数据……</article>
                                                 
    <template v-else-if="dashboard">
                     
      <div class="dashboard-kpis">
        <article class="dashboard-kpi dashboard-kpi--total">
          <small>累计检查</small>
          <strong>{{ dashboard.overview.total_count }}</strong>
          <p class="dashboard-kpi__breakdown">
            <span>
              已完成
              <b>{{ dashboard.overview.completed_count }}</b>
            </span>
            <span>
              处理中
              <b>{{ dashboard.overview.active_count }}</b>
            </span>
          </p>
        </article>
        <article class="dashboard-kpi dashboard-kpi--today">
          <small>今日检查</small>
          <strong>{{ dashboard.overview.today_count }}</strong>
          <p>按服务器自然日统计</p>
        </article>
        <article class="dashboard-kpi dashboard-kpi--success">
          <small>推理成功率</small>
          <strong>{{ (dashboard.overview.success_rate * 100).toFixed(1) }}%</strong>
          <p>失败 {{ dashboard.overview.failed_count }} 次</p>
        </article>
      </div>
                       
      <div class="content-stack dashboard-data-stack">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>最近检查</h2>
              <p>按创建时间显示最近5条</p>
            </div>
            <RouterLink class="button" to="/studies">查看全部记录</RouterLink>
          </div>
          <div v-if="!dashboard.recent_studies.length" class="table-state">暂无检查记录</div>
          <div v-else class="table-wrapper">
            <table class="records-table dashboard-table">
              <thead>
                <tr>
                  <th>患者编号</th>
                  <th>检查编号</th>
                  <th>状态</th>
                  <th>最高概率类别</th>
                  <th>概率</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="study in dashboard.recent_studies" :key="study.study_id">
                  <td>
                    <strong>{{ study.subject_id }}</strong>
                  </td>
                  <td>{{ study.study_id }}</td>
                  <td>
                    <span class="record-status" :class="`record-status--${study.status}`">
                      {{ statusLabel(study.status) }}
                    </span>
                  </td>
                  <td>{{ study.top_class_name ?? "尚无结果" }}</td>
                  <td>{{ formatProbability(study.top_probability) }}</td>
                  <td>{{ formatDate(study.created_at) }}</td>
                  <td>
                    <RouterLink :to="`/studies/${encodeURIComponent(study.study_id)}`">
                      查看
                    </RouterLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
                       
        <article class="panel dashboard-distribution">
          <div class="panel-heading">
            <div>
              <h2>各类别预测次数</h2>
              <p>近30天 · 概率达到0.5</p>
            </div>
          </div>
          <div class="category-chart">
            <div v-for="item in dashboard.class_counts" :key="item.class_id">
              <span>{{ item.class_id }} · {{ item.class_name }}</span>
              <div><i :style="{ width: `${(item.count / maximumClassCount) * 100}%` }"></i></div>
              <strong>{{ item.count }}</strong>
            </div>
          </div>
        </article>
      </div>
      <div
        class="dashboard-status-strip"
        :class="{ 'dashboard-status-strip--unavailable': !analysisAvailable }"
      >
        <div class="dashboard-status-strip__state">
          <span class="dashboard-status-strip__dot" aria-hidden="true"></span>
          <strong>影像分析服务</strong>
          <span>{{ analysisAvailable ? "可使用" : "暂不可用" }}</span>
        </div>
        <p>
          {{
            !analysisAvailable
              ? "服务暂不可用，请稍后刷新状态。"
              : health?.data.inference.data?.is_mock === true
                ? "当前为演示分析，结果仅用于功能体验。"
                : "分析结果请结合原始影像进行专业复核。"
          }}
        </p>
      </div>
    </template>
  </section>
</template>
