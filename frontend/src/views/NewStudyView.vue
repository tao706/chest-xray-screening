<script setup lang="ts">import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ImageUploader from "@/components/ImageUploader.vue";
import { useImageViewport } from "@/composables/useImageViewport";
import { predictStudy } from "@/api/studies";
import { useCurrentStudyStore } from "@/state/currentStudy";
import type { SelectedImage } from "@/types/study";
const router = useRouter();
const currentStudyStore = useCurrentStudyStore();
const subjectId = ref("");
const studyId = ref("");
const note = ref("");
const images = ref<SelectedImage[]>([]);
const selectedImageId = ref("");
const previewImageId = ref("");
const previewCloseButton = ref<HTMLButtonElement>();
let previewReturnFocus: HTMLElement | null = null;
const brightness = ref(100);
const contrast = ref(100);
const rotation = ref(0);
const { stage, zoom, panX, panY, isDragging, zoomIn, zoomOut, resetViewport, onWheel, onPointerDown, onPointerMove, onPointerUp, } = useImageViewport();
const message = ref("");
const messageType = ref<"error" | "success">("error");
const isSubmitting = ref(false);
const selectedImage = computed(() => images.value.find((item) => item.id === selectedImageId.value) ?? images.value[0]);
const previewImage = computed(() => images.value.find((item) => item.id === previewImageId.value));
const imageWarnings = computed(() => images.value.filter((item) => item.warning));
const canSubmit = computed(() => Boolean(subjectId.value.trim() &&
    studyId.value.trim() &&
    images.value.length &&
    !images.value.some((item) => item.checking || (Boolean(item.validationError) || item.warning === "图片无法正常解码"))));
watch(() => selectedImage.value?.id, resetViewport);
function generateIds() {
    const now = new Date();
    const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("");
    const suffix = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    subjectId.value = `SUB-${suffix}`;
    studyId.value = `ST-${date}-${suffix}`;
}
function resetViewer() {
    brightness.value = 100;
    contrast.value = 100;
    rotation.value = 0;
    resetViewport();
}
function clearForm() {
    subjectId.value = "";
    studyId.value = "";
    note.value = "";
    images.value = [];
    selectedImageId.value = "";
    previewImageId.value = "";
    message.value = "";
    resetViewer();
}
async function openPreview(id: string) {
    if (!images.value.some((item) => item.id === id))
        return;
    previewReturnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    selectedImageId.value = id;
    previewImageId.value = id;
    await nextTick();
    previewCloseButton.value?.focus();
}
async function closePreview() {
    previewImageId.value = "";
    await nextTick();
    previewReturnFocus?.focus();
    previewReturnFocus = null;
}
function showError(text: string) {
    messageType.value = "error";
    message.value = text;
}
function validateBeforeSubmit() {
    message.value = "";
    if (!subjectId.value.trim()) {
        showError("请输入患者编号");
        return false;
    }
    if (!studyId.value.trim()) {
        showError("请输入检查编号");
        return false;
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(subjectId.value.trim())) {
        showError("患者编号只能包含字母、数字、下划线和短横线");
        return false;
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(studyId.value.trim())) {
        showError("检查编号只能包含字母、数字、下划线和短横线");
        return false;
    }
    if (!images.value.length) {
        showError("请至少上传一张胸片");
        return false;
    }
    if (images.value.some((item) => item.checking)) {
        showError("图片正在校验，请稍候再提交");
        return false;
    }
    if (images.value.some((item) => (Boolean(item.validationError) || item.warning === "图片无法正常解码"))) {
        showError("请移除未通过影像初检的图片后再提交");
        return false;
    }
    return true;
}
async function submitStudy() {
    if (isSubmitting.value || !validateBeforeSubmit())
        return;
    isSubmitting.value = true;
    messageType.value = "success";
    message.value = "正在上传图片并调用模型，请勿重复提交……";
    try {
        const result = await predictStudy({
            subjectId: subjectId.value.trim(),
            studyId: studyId.value.trim(),
            note: note.value.trim(),
            images: images.value.map((item) => item.file),
        });
        currentStudyStore.setStudy(result, images.value);
        await router.push(`/studies/${encodeURIComponent(result.study_id)}/result`);
    }
    catch (error) {
        showError(error instanceof Error ? error.message : "提交失败，请检查服务状态后重试");
    }
    finally {
        isSubmitting.value = false;
    }
}
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">NEW STUDY</p>
        <h1>新建检查</h1>
        <p>上传同一次检查的多张胸片，系统将返回14个类别的完整原始概率。</p>
      </div>
      <span class="priority-badge">支持 JPG / JPEG / PNG</span>
    </header>

    <div class="study-layout">
      <div class="content-stack new-study-main">
        <article class="panel study-info-panel">
          <div class="panel-heading">
            <div>
              <h2>检查信息</h2>
              <p>编号按字符串处理并保留前导零</p>
            </div>
            <button class="button study-utility-button" type="button" @click="generateIds">
              自动生成编号
            </button>
          </div>
          <div class="form-grid form-grid--two">
            <label class="form-field">
              <span>患者编号 *</span>
              <input v-model.trim="subjectId" maxlength="64" placeholder="例如：SUB-00001" />
            </label>
            <label class="form-field">
              <span>检查编号 *</span>
              <input v-model.trim="studyId" maxlength="64" placeholder="例如：ST-20261015-00001" />
            </label>
          </div>
          <label class="form-field">
            <span>备注（可选）</span>
            <textarea
              v-model="note"
              maxlength="300"
              rows="3"
              placeholder="可填写检查说明，请勿录入患者敏感信息"
            ></textarea>
            <small>{{ note.length }}/300</small>
          </label>
          <div class="form-actions">
            <button class="button study-utility-button" type="button" @click="clearForm">
              清空表单
            </button>
          </div>
        </article>

                     
        <article class="panel study-upload-panel">
          <div class="panel-heading">
            <div>
              <h2>多图上传</h2>
              <p>同一次检查可以包含一张或多张胸片</p>
            </div>
          </div>
          <ImageUploader
            v-model="images"
            @error="showError"
            @select="selectedImageId = $event"
            @preview="openPreview"
          />
        </article>

        <article class="panel study-validation-panel">
          <div class="panel-heading">
            <div>
              <h2>文件校验</h2>
              <p>未通过校验的图片不会进入推理流程</p>
            </div>
          </div>
          <ul class="validation-list">
            <li :class="{ valid: images.length > 0 }">
              {{ images.length ? "✓" : "○" }} 至少上传1张图片
            </li>
            <li class="valid">✓ 仅接受JPG、JPEG、PNG</li>
            <li class="valid">✓ 单张不超过10MB且不为空文件</li>
            <li class="valid">✓ 单次上传不超过20张</li>
            <li :class="imageWarnings.length ? 'warning' : 'valid'">
              {{ imageWarnings.length ? "!" : "✓" }}
              {{
                imageWarnings.length
                  ? `${imageWarnings.length}张图片存在提示，请检查`
                  : "当前没有图片警告"
              }}
            </li>
          </ul>
        </article>
      </div>

      <aside class="content-stack new-study-sidebar">
        <article class="panel viewer-panel">
          <div class="panel-heading">
            <div>
              <h2>图片查看器</h2>
              <p>显示调节不会修改原图</p>
            </div>
          </div>
          <div
            v-if="selectedImage"
            ref="stage"
            class="image-stage zoomable-stage"
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
                :src="selectedImage.previewUrl"
                :alt="selectedImage.file.name"
                :style="{
                  filter: `brightness(${brightness}%) contrast(${contrast}%) grayscale(1)`,
                  transform: `rotate(${rotation}deg)`,
                }"
                draggable="false"
              />
            </div>
                                
            <span>{{ images.indexOf(selectedImage) + 1 }} / {{ images.length }}</span>
          </div>
          <div v-else class="image-stage image-stage--empty">上传图片后可在这里查看</div>
          <div class="viewer-actions">
            <button
              class="button"
              type="button"
              :disabled="!selectedImage || zoom <= 1"
              aria-label="缩小图片"
              @click="zoomOut"
            >
              −
            </button>
            <span class="viewer-zoom-value">{{ Math.round(zoom * 100) }}%</span>
            <button
              class="button"
              type="button"
              :disabled="!selectedImage || zoom >= 4"
              aria-label="放大图片"
              @click="zoomIn"
            >
              ＋
            </button>
            <button
              class="button"
              type="button"
              :disabled="!selectedImage"
              @click="rotation = (rotation + 90) % 360"
            >
              旋转
            </button>
            <button class="button" type="button" :disabled="!selectedImage" @click="resetViewer">
              适应窗口
            </button>
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

                          
          <div class="thumbnail-strip">
            <button
              v-for="item in images"
              :key="item.id"
              type="button"
              :class="{ active: item.id === selectedImage?.id }"
              @click="selectedImageId = item.id"
            >
              <img :src="item.previewUrl" :alt="item.file.name" />
            </button>
          </div>
        </article>

        <article class="panel submit-panel">
          <div class="panel-heading">
            <div>
              <h2>提交分析</h2>
              <p>图片将安全提交至模型服务进行分析</p>
            </div>
          </div>
          <dl class="summary-list">
            <div>
              <dt>患者编号</dt>
              <dd>{{ subjectId || "未填写" }}</dd>
            </div>
            <div>
              <dt>检查编号</dt>
              <dd>{{ studyId || "未填写" }}</dd>
            </div>
            <div>
              <dt>图片数量</dt>
              <dd>{{ images.length }}张</dd>
            </div>
            <div>
              <dt>提交状态</dt>
              <dd>{{ isSubmitting ? "正在分析" : canSubmit ? "可以提交" : "资料未完整" }}</dd>
            </div>
          </dl>
          <div
            v-if="imageWarnings.some((item) => item.warning?.includes('影像类型存疑'))"
            class="feedback-message submission-warning"
          >
            部分影像的类型需要核对，请确认所选文件为胸部 X 线影像后再提交。
          </div>
          <div v-if="message" class="feedback-message" :class="`feedback-message--${messageType}`">
            {{ message }}
          </div>
          <button
            class="button button--primary button--wide"
            type="button"
            :disabled="isSubmitting || !canSubmit"
            @click="submitStudy"
          >
            {{ isSubmitting ? "正在分析……" : "开始分析" }}
          </button>
          <p class="medical-notice">当前模型结果仅供功能测试与专业复核，不能替代医生诊断。</p>
        </article>
      </aside>
    </div>
                     
    <Teleport to="body">
                                                           
      <div
        v-if="previewImage"
        class="image-preview-backdrop"
        @click.self="closePreview"
        @keydown.esc="closePreview"
      >
        <div class="image-preview-dialog" role="dialog" aria-modal="true" aria-label="胸片大图预览">
          <div class="image-preview-header">
            <strong :title="previewImage.file.name">{{ previewImage.file.name }}</strong>
            <button
              ref="previewCloseButton"
              class="image-preview-close"
              type="button"
              aria-label="关闭预览"
              @click="closePreview"
            >
              关闭 ×
            </button>
          </div>
          <div class="image-preview-content">
            <img :src="previewImage.previewUrl" :alt="previewImage.file.name" />
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>
