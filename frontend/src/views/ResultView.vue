<script setup lang="ts">import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { getGradcam, getImagePredictions, getStudy, getStudyImageUrl } from "@/api/studies";
import { useImageViewport } from "@/composables/useImageViewport";
import { useCurrentStudyStore } from "@/state/currentStudy";
import type { Prediction, PredictionResult } from "@/types/prediction";
const route = useRoute();
const currentStudyStore = useCurrentStudyStore();
const { images: currentImages, prediction: currentPrediction } = storeToRefs(currentStudyStore);
const result = ref<PredictionResult>();
const loading = ref(true);
const errorMessage = ref("");
const threshold = ref(0.5);
const sortByProbability = ref(false);
const selectedImageIndex = ref(0);
const imagePredictions = ref<Prediction[]>([]);
const predictionsLoading = ref(false);
const predictionsError = ref("");
const imageScores = new Map<number, Prediction[]>();
let predictionRequest = 0;
const brightness = ref(100);
const contrast = ref(100);
const { stage, zoom, panX, panY, isDragging, zoomIn, zoomOut, resetViewport, onWheel, onPointerDown, onPointerMove, onPointerUp, } = useImageViewport();
const selectedClassId = ref(1);
const heatmapOpacity = ref(55);
const heatmapVisible = ref(true);
const heatmapLoading = ref(false);
const heatmapError = ref("");
const heatmapDataUrl = ref("");
const heatmapIsMock = ref(false);
const heatmapCache = new Map<string, { dataUrl: string; isMock: boolean }>();
let heatmapRequest = 0;
const predictions = computed(() => {
    const rows = [...imagePredictions.value];
    return sortByProbability.value
        ? rows.sort((a, b) => b.probability - a.probability)
        : rows.sort((a, b) => a.class_id - b.class_id);
});
const positiveCount = computed(() => predictions.value.filter((item) => item.probability >= threshold.value).length);
const noFindingConflict = computed(() => {
    const noFinding = predictions.value.find((item) => item.class_name_en === "No Finding");
    return Boolean(noFinding && noFinding.probability >= threshold.value && positiveCount.value > 1);
});
const sessionImages = computed(() => currentPrediction.value?.study_id === result.value?.study_id ? currentImages.value : []);
const selectedStoredImage = computed(() => result.value?.images?.[selectedImageIndex.value]);
const selectedImageSrc = computed(() => sessionImages.value[selectedImageIndex.value]?.previewUrl ??
    (selectedStoredImage.value
        ? getStudyImageUrl(result.value!.study_id, selectedStoredImage.value.id)
        : ""));
const selectedImageName = computed(() => sessionImages.value[selectedImageIndex.value]?.file.name ??
    selectedStoredImage.value?.original_name ??
    "胸片");
const displayImageCount = computed(() => Math.max(sessionImages.value.length, result.value?.images?.length ?? 0));
function formatProbability(value: number) {
    return `${(value * 100).toFixed(1)}%`;
}
async function loadResult() {
    loading.value = true;
    errorMessage.value = "";
    try {
        const studyId = String(route.params.studyId);
        result.value = await getStudy(studyId);
        selectedImageIndex.value = 0;
        imageScores.clear();
        heatmapCache.clear();
        void loadImagePredictions();
        resetViewport();
        selectedClassId.value =
            [...result.value.predictions].sort((a, b) => b.probability - a.probability)[0]?.class_id ?? 1;
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "结果加载失败";
    }
    finally {
        loading.value = false;
    }
}
async function loadImagePredictions() {
    const requestId = ++predictionRequest;
    const image = selectedStoredImage.value;
    imagePredictions.value = [];
    predictionsError.value = "";
    if (!result.value || !image) return;
    const cached = imageScores.get(image.id);
    if (cached) {
        imagePredictions.value = cached;
        predictionsLoading.value = false;
        return;
    }
    predictionsLoading.value = true;
    try {
        const scores = await getImagePredictions(result.value.study_id, image.id);
        if (requestId !== predictionRequest) return;
        imageScores.set(image.id, scores);
        imagePredictions.value = scores;
    } catch (error) {
        if (requestId === predictionRequest) predictionsError.value = error instanceof Error ? error.message : "当前图片评分加载失败";
    } finally {
        if (requestId === predictionRequest) predictionsLoading.value = false;
    }
}
async function loadHeatmap() {
    const image = selectedStoredImage.value;
    if (!result.value || !image)
        return void (heatmapError.value = "当前图片没有持久化记录，无法生成解释图");
    const cacheKey = `${image.id}:${selectedClassId.value}`;
    const cached = heatmapCache.get(cacheKey);
    if (cached) {
        heatmapDataUrl.value = cached.dataUrl;
        heatmapIsMock.value = cached.isMock;
        heatmapVisible.value = true;
        heatmapError.value = "";
        return;
    }
    const requestId = ++heatmapRequest;
    heatmapLoading.value = true;
    heatmapError.value = "";
    try {
        const data = await getGradcam(result.value.study_id, image.id, selectedClassId.value);
        if (requestId !== heatmapRequest) return;
        heatmapDataUrl.value = `data:${data.heatmap_mime_type};base64,${data.heatmap_base64}`;
        heatmapIsMock.value = data.is_mock;
        heatmapCache.set(cacheKey, { dataUrl: heatmapDataUrl.value, isMock: data.is_mock });
        heatmapVisible.value = true;
    }
    catch (error) {
        if (requestId !== heatmapRequest) return;
        heatmapError.value = error instanceof Error && error.name === "TimeoutError"
            ? "关注区域生成超时，请稍后重试。"
            : error instanceof Error ? error.message : "关注区域生成失败，请稍后重试。";
    }
    finally {
        if (requestId === heatmapRequest) heatmapLoading.value = false;
    }
}
watch([selectedImageIndex, selectedClassId], () => {
    heatmapRequest++;
    heatmapLoading.value = false;
    heatmapDataUrl.value = "";
    heatmapError.value = "";
    heatmapIsMock.value = false;
});
watch(selectedImageIndex, resetViewport);
watch(selectedImageIndex, loadImagePredictions);
onMounted(loadResult);
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">INFERENCE RESULT</p>
        <h1>推理结果</h1>
        <p>展示模型返回的14个类别原始概率，页面阈值只影响显示。</p>
      </div>
      <div class="heading-actions">
        <RouterLink class="button" to="/studies">返回检查列表</RouterLink>
        <RouterLink class="button button--primary" to="/studies/new">新建检查</RouterLink>
      </div>
    </header>

    <article v-if="loading" class="panel result-state">正在加载检查结果……</article>
    <article v-else-if="errorMessage" class="panel result-state result-state--error">
      <strong>结果加载失败</strong>
      <p>{{ errorMessage }}</p>
      <button class="button" type="button" @click="loadResult">重新加载</button>
    </article>

    <template v-else-if="result">
      <article class="panel result-overview">
        <div>
          <small>患者编号</small>
          <strong>{{ result.subject_id }}</strong>
        </div>
        <div>
          <small>检查编号</small>
          <strong>{{ result.study_id }}</strong>
        </div>
        <div>
          <small>检查状态</small>
          <strong class="success-text">已完成</strong>
        </div>
        <div>
          <small>图片数量</small>
          <strong>{{ result.image_count }}张</strong>
        </div>
        <div>
          <small>达到显示阈值</small>
          <strong>{{ positiveCount }}类</strong>
        </div>
      </article>

      <div class="result-layout">
        <div class="content-stack result-image-column">
          <article class="panel result-image-panel">
            <div class="panel-heading">
              <div>
                <h2>检查图片与关注区域</h2>
                <p>按类别查看 Grad-CAM 关注区域，颜色不代表已确认的病灶</p>
              </div>
              <span v-if="heatmapIsMock" class="record-status record-status--processing">
                模拟解释图
              </span>
            </div>
            <div
              v-if="selectedImageSrc"
              ref="stage"
              class="image-stage result-image-stage zoomable-stage"
              :class="{
                'zoomable-stage--pannable': zoom > 1,
                'zoomable-stage--dragging': isDragging,
              }"
              @wheel="onWheel"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
            >
              <div
                class="zoom-image-layer"
                :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }"
              >
                <img
                  class="result-base-image"
                  :src="selectedImageSrc"
                  :alt="selectedImageName"
                  :style="{
                    filter: `brightness(${brightness}%) contrast(${contrast}%) grayscale(1)`,
                  }"
                  draggable="false"
                />
                <img
                  v-if="heatmapDataUrl && heatmapVisible"
                  class="gradcam-overlay"
                  :src="heatmapDataUrl"
                  alt="类别关注区域解释图"
                  :style="{ opacity: heatmapOpacity / 100 }"
                  draggable="false"
                />
              </div>
              <span>{{ selectedImageIndex + 1 }} / {{ displayImageCount }}</span>
            </div>
            <div v-else class="image-stage image-stage--empty result-image-stage">
              当前检查没有可读取的持久化图片
            </div>
            <div class="viewer-actions">
              <button
                class="button"
                type="button"
                :disabled="selectedImageIndex <= 0"
                @click="selectedImageIndex--"
              >
                上一张
              </button>
              <button
                class="button"
                type="button"
                :disabled="selectedImageIndex >= displayImageCount - 1"
                @click="selectedImageIndex++"
              >
                下一张
              </button>
              <span class="viewer-actions__spacer"></span>
              <button
                class="button"
                type="button"
                :disabled="zoom <= 1"
                aria-label="缩小图片"
                @click="zoomOut"
              >
                −
              </button>
              <span class="viewer-zoom-value">{{ Math.round(zoom * 100) }}%</span>
              <button
                class="button"
                type="button"
                :disabled="zoom >= 4"
                aria-label="放大图片"
                @click="zoomIn"
              >
                ＋
              </button>
              <button class="button" type="button" @click="resetViewport">适应窗口</button>
            </div>
            <label class="range-field">
              亮度
              <strong>{{ brightness }}%</strong>
              <input v-model.number="brightness" type="range" min="50" max="150" />
            </label>
            <label class="range-field">
              对比度
              <strong>{{ contrast }}%</strong>
              <input v-model.number="contrast" type="range" min="50" max="150" />
            </label>
            <div class="gradcam-controls">
              <label class="form-field">
                <span>解释类别</span>
                <select v-model.number="selectedClassId">
                  <option v-for="item in predictions" :key="item.class_id" :value="item.class_id">
                    {{ item.class_id }} · {{ item.class_name }}（{{
                      formatProbability(item.probability)
                    }}）
                  </option>
                </select>
              </label>
              <button
                class="button button--primary"
                type="button"
                :disabled="heatmapLoading || !selectedStoredImage"
                @click="loadHeatmap"
              >
                {{ heatmapLoading ? "正在生成……" : "生成解释图" }}
              </button>
            </div>
            <template v-if="heatmapDataUrl">
              <label class="range-field">
                叠加透明度
                <strong>{{ heatmapOpacity }}%</strong>
                <input v-model.number="heatmapOpacity" type="range" min="0" max="100" />
              </label>
              <label class="gradcam-toggle">
                <input v-model="heatmapVisible" type="checkbox" />
                显示关注区域叠加
              </label>
            </template>
            <div v-if="heatmapDataUrl && !heatmapIsMock" class="result-interpretation">
              <strong>关注区域参考</strong>
              <p>颜色显示网络对所选类别的关注程度，不是病灶检测框，也不能确认病灶的位置、范围或严重程度。</p>
            </div>
            <div v-if="heatmapError" class="feedback-message feedback-message--error">
              {{ heatmapError }}
            </div>
            <div v-if="heatmapIsMock" class="feedback-message submission-warning">
              当前显示的是模拟关注区域，不代表模型真实解释结果，不能用于医学判断。
            </div>
          </article>
        </div>

        <article class="panel result-predictions-panel">
          <div class="panel-heading">
            <div>
              <h2>第{{ selectedImageIndex + 1 }}张图片 · 14类评分</h2>
              <p>蓝色项目达到显示阈值，评分不等同于患病概率</p>
            </div>
            <button
              class="result-sort-button"
              :class="{ 'result-sort-button--active': sortByProbability }"
              type="button"
              :title="sortByProbability ? '切换为类别顺序' : '切换为概率排序'"
              @click="sortByProbability = !sortByProbability"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14m0-14L5 8m3-3 3 3M16 19V5m0 14-3-3m3 3 3-3" />
              </svg>
              <span>{{ sortByProbability ? "类别顺序" : "概率排序" }}</span>
            </button>
          </div>
          <label class="result-threshold">
            显示阈值
            <strong>{{ threshold.toFixed(2) }}</strong>
            <input v-model.number="threshold" type="range" min="0" max="1" step="0.01" />
          </label>
          <div v-if="predictionsLoading" class="result-interpretation" role="status">正在加载当前图片评分…</div>
          <div v-else-if="predictionsError" class="result-interpretation" role="alert">{{ predictionsError }}</div>
          <div v-else-if="predictions.length" class="result-interpretation" role="status" aria-live="polite">
            <strong>{{ positiveCount ? `${positiveCount} 项达到当前显示阈值` : "暂无项目达到当前显示阈值" }}</strong>
            <p>{{ positiveCount ? "突出显示用于辅助复核，不代表已经确诊。调整阈值不会改变原始评分。" : "低于阈值不代表正常，仍需结合原始影像和正式报告复核。" }}</p>
          </div>
          <div class="prediction-list">
            <article
              v-for="prediction in predictions"
              :key="prediction.class_id"
              class="prediction-row"
              :class="{ 'prediction-row--positive': prediction.probability >= threshold }"
            >
              <span class="prediction-row__id">{{ prediction.class_id }}</span>
              <div class="prediction-row__name">
                <strong>{{ prediction.class_name }}</strong>
                <small>{{ prediction.class_name_en }}</small>
              </div>
              <div class="probability-track">
                <span :style="{ width: `${prediction.probability * 100}%` }"></span>
              </div>
              <strong class="prediction-row__value">
                {{ formatProbability(prediction.probability) }}
              </strong>
              <span
                class="prediction-row__status"
                :class="{ 'prediction-row__status--positive': prediction.probability >= threshold }"
              >
                {{ prediction.probability >= threshold ? "达到" : "低于" }}
              </span>
            </article>
          </div>
          <div v-if="noFindingConflict" class="feedback-message feedback-message--error">
            “无异常发现”与其他疾病类别同时超过阈值，请人工复核；系统不会自动修改模型概率。
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
