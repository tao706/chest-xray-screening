<script setup lang="ts">import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getStudy, getStudyImageUrl } from "@/api/studies";
import { useImageViewport } from "@/composables/useImageViewport";
import type { PredictionResult } from "@/types/prediction";
import { statusLabel } from "./statusLabel";
const route = useRoute();
const study = ref<PredictionResult>();
const loading = ref(true);
const errorMessage = ref("");
const selectedImageIndex = ref(0);
const imagePreviewFailed = ref(false);
const { stage, zoom, panX, panY, isDragging, zoomIn, zoomOut, resetViewport, onWheel, onPointerDown, onPointerMove, onPointerUp, } = useImageViewport();
const sortedPredictions = computed(() => [...(study.value?.predictions ?? [])].sort((a, b) => a.class_id - b.class_id));
const selectedImage = computed(() => study.value?.images?.[selectedImageIndex.value]);
async function loadStudy() {
    loading.value = true;
    errorMessage.value = "";
    try {
        study.value = await getStudy(String(route.params.studyId));
        selectedImageIndex.value = 0;
        imagePreviewFailed.value = false;
        resetViewport();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "检查详情加载失败";
    }
    finally {
        loading.value = false;
    }
}
function formatBytes(value: number) {
    return value < 1024 * 1024
        ? `${(value / 1024).toFixed(1)}KB`
        : `${(value / 1024 / 1024).toFixed(2)}MB`;
}
function selectImage(index: number) {
    selectedImageIndex.value = index;
    imagePreviewFailed.value = false;
    resetViewport();
}
onMounted(loadStudy);
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">STUDY DETAIL</p>
        <h1>检查详情</h1>
        <p>查看检查元数据、图片文件信息和完整预测结果。</p>
      </div>
      <div class="heading-actions">
        <RouterLink class="button" to="/studies">返回记录</RouterLink>
        <RouterLink
          v-if="study?.status === 'completed'"
          class="button button--primary"
          :to="`/studies/${encodeURIComponent(study.study_id)}/result`"
        >
          打开结果页
        </RouterLink>
      </div>
    </header>

    <article v-if="loading" class="panel result-state">正在加载检查详情……</article>
    <article v-else-if="errorMessage" class="panel result-state result-state--error">
      <strong>加载失败</strong>
      <p>{{ errorMessage }}</p>
      <button class="button" type="button" @click="loadStudy">重新加载</button>
    </article>

    <template v-else-if="study">
      <article class="panel detail-meta">
        <div>
          <small>患者编号</small>
          <strong>{{ study.subject_id }}</strong>
        </div>
        <div>
          <small>检查编号</small>
          <strong>{{ study.study_id }}</strong>
        </div>
        <div>
          <small>状态</small>
          <strong>{{ statusLabel(study.status) }}</strong>
        </div>
        <div>
          <small>图片数量</small>
          <strong>{{ study.image_count }}张</strong>
        </div>
        <div>
          <small>创建时间</small>
          <strong>
            {{ study.created_at ? new Date(study.created_at).toLocaleString("zh-CN") : "—" }}
          </strong>
        </div>
      </article>

      <div
        v-if="study.status === 'failed'"
        class="feedback-message feedback-message--error detail-alert"
      >
        <strong>检查处理失败：</strong>
        {{ study.error_message ?? "未记录错误原因" }}
      </div>

      <div class="detail-layout">
        <article class="panel detail-image-panel">
          <div class="panel-heading">
            <div>
              <h2>图片文件</h2>
              <p>查看本次检查的原始影像与文件信息</p>
            </div>
          </div>
          <div v-if="!study.images?.length" class="table-state">本次检查暂无可查看的影像</div>
          <template v-else>
            <div
              ref="stage"
              class="detail-image-preview zoomable-stage"
              :class="{
                'zoomable-stage--pannable': zoom > 1 && !imagePreviewFailed,
                'zoomable-stage--dragging': isDragging,
              }"
              @wheel="selectedImage && !imagePreviewFailed && onWheel($event)"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
            >
              <div
                v-if="selectedImage && !imagePreviewFailed"
                class="zoom-image-layer"
                :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }"
              >
                <img
                  :key="selectedImage.id"
                  :src="getStudyImageUrl(study.study_id, selectedImage.id)"
                  :alt="`第${selectedImageIndex + 1}张胸片`"
                  draggable="false"
                  @error="imagePreviewFailed = true"
                />
              </div>
              <div v-else class="detail-image-preview__unavailable">
                影像暂无法预览，请核对原始文件
              </div>
            </div>
            <div class="viewer-actions">
              <button
                class="button"
                type="button"
                :disabled="imagePreviewFailed || zoom <= 1"
                aria-label="缩小图片"
                @click="zoomOut"
              >
                −
              </button>
              <span class="viewer-zoom-value">{{ Math.round(zoom * 100) }}%</span>
              <button
                class="button"
                type="button"
                :disabled="imagePreviewFailed || zoom >= 4"
                aria-label="放大图片"
                @click="zoomIn"
              >
                ＋
              </button>
              <button
                class="button"
                type="button"
                :disabled="imagePreviewFailed"
                @click="resetViewport"
              >
                适应窗口
              </button>
            </div>
            <div class="detail-image-list">
              <button
                v-for="(image, index) in study.images"
                :key="image.id"
                type="button"
                :class="{ active: selectedImageIndex === index }"
                @click="selectImage(index)"
              >
                <span class="detail-file-icon">{{ String(index + 1).padStart(2, "0") }}</span>
                <span>
                  <strong>第{{ index + 1 }}张胸片</strong>
                  <small>
                    {{ image.mime_type }} · {{ formatBytes(Number(image.file_size)) }}
                    <template v-if="image.width && image.height">
                      · {{ image.width }} × {{ image.height }}
                    </template>
                  </small>
                </span>
              </button>
            </div>
          </template>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>十四类预测概率</h2>
              <p>模型对各影像表现的原始评分，仅供专业复核</p>
            </div>
          </div>
          <div v-if="!sortedPredictions.length" class="table-state">当前检查没有预测结果</div>
          <div v-else class="detail-predictions">
            <article v-for="item in sortedPredictions" :key="item.class_id">
              <span>{{ item.class_id }}</span>
              <div>
                <strong>{{ item.class_name }}</strong>
                <small>{{ item.class_name_en }}</small>
              </div>
              <div class="probability-track">
                <span :style="{ width: `${item.probability * 100}%` }"></span>
              </div>
              <b>{{ (item.probability * 100).toFixed(1) }}%</b>
            </article>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
