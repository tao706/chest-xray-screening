<script setup lang="ts">import { computed, ref } from "vue";
import { validateStudyImage } from "@/api/studies";
import type { SelectedImage } from "@/types/study";
const props = withDefaults(defineProps<{
    modelValue: SelectedImage[];
    maxFiles?: number;
    maxFileSizeMb?: number;
}>(), { maxFiles: 20, maxFileSizeMb: 10 });
const emit = defineEmits<{
    "update:modelValue": [
        files: SelectedImage[]
    ];
    error: [
        message: string
    ];
    select: [
        id: string
    ];
    preview: [
        id: string
    ];
}>();
const fileInput = ref<HTMLInputElement>();
const isDragging = ref(false);
const totalSize = computed(() => props.modelValue.reduce((sum, item) => sum + item.file.size, 0));
function formatBytes(bytes: number) {
    return bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function looksUnlikeRadiograph(image: HTMLImageElement) {
    const canvas = document.createElement("canvas");
    const ratio = Math.min(128 / image.naturalWidth, 128 / image.naturalHeight);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
        return false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let colored = 0;
    let flat = 0;
    let compared = 0;
    const left = Math.floor(canvas.width * .1);
    const right = Math.ceil(canvas.width * .9);
    const top = Math.floor(canvas.height * .1);
    const bottom = Math.ceil(canvas.height * .9);
    for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
            const i = (y * canvas.width + x) * 4;
            const red = data[i] ?? 0;
            const green = data[i + 1] ?? 0;
            const blue = data[i + 2] ?? 0;
            if (Math.max(red, green, blue) - Math.min(red, green, blue) > 28 && Math.max(red, green, blue) > 60)
                colored += 1;
            if (x > left && x < right && y > top && y < bottom) {
                const previous = i - 4;
                const difference = (Math.abs(red - (data[previous] ?? 0)) + Math.abs(green - (data[previous + 1] ?? 0)) + Math.abs(blue - (data[previous + 2] ?? 0))) / 3;
                if (difference < 3)
                    flat += 1;
                compared += 1;
            }
        }
    }
    return colored / (canvas.width * canvas.height) > .16 || (compared > 0 && flat / compared > .75);
}
function inspectImage(item: SelectedImage) {
    const image = new Image();
    image.onload = async () => {
        if (!props.modelValue.some((entry) => entry.id === item.id))
            return;
        item.width = image.naturalWidth;
        item.height = image.naturalHeight;
        try {
            if (looksUnlikeRadiograph(image))
                item.warning = "影像类型存疑，请核对是否为胸部 X 线影像";
            else if (Math.min(image.naturalWidth, image.naturalHeight) < 512)
                item.warning = "图片分辨率偏低";
        }
        catch {
            item.warning = "无法自动检查影像内容，请人工核对";
        }
        try {
            const response = await validateStudyImage(item.file);
            if (response.data.accepted !== true) throw new Error("影像初检未完成，请重新选择图片。");
            item.validationError = undefined;
        } catch (error) {
            item.validationError = error instanceof Error ? error.message : "影像初检未完成，请稍后重新选择图片。";
            item.warning = item.validationError;
        }
        if (!props.modelValue.some((entry) => entry.id === item.id)) return;
        item.checking = false;
        emit("update:modelValue", [...props.modelValue]);
    };
    image.onerror = () => {
        if (!props.modelValue.some((entry) => entry.id === item.id))
            return;
        item.warning = "图片无法正常解码";
        item.checking = false;
        emit("update:modelValue", [...props.modelValue]);
    };
    image.src = item.previewUrl;
}
function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    const remaining = props.maxFiles - props.modelValue.length;
    if (remaining <= 0)
        return emit("error", `单次最多上传 ${props.maxFiles} 张图片`);
    const accepted: SelectedImage[] = [];
    const keys = new Set(props.modelValue.map(({ file }) => `${file.name}:${file.size}:${file.lastModified}`));
    for (const file of incoming.slice(0, remaining)) {
        if (!["image/jpeg", "image/png"].includes(file.type)) {
            emit("error", `${file.name} 不是JPG、JPEG或PNG图片`);
            continue;
        }
        if (!file.size) {
            emit("error", `${file.name} 是空文件`);
            continue;
        }
        if (file.size > props.maxFileSizeMb * 1024 * 1024) {
            emit("error", `${file.name} 超过 ${props.maxFileSizeMb}MB`);
            continue;
        }
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (keys.has(key)) {
            emit("error", `${file.name} 已经添加，请勿重复上传`);
            continue;
        }
        keys.add(key);
        const item: SelectedImage = { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), checking: true };
        accepted.push(item);
        inspectImage(item);
    }
    if (incoming.length > remaining)
        emit("error", `仅添加前 ${remaining} 张，单次最多 ${props.maxFiles} 张`);
    emit("update:modelValue", [...props.modelValue, ...accepted]);
    if (accepted[0])
        emit("select", accepted[0].id);
}
function removeFile(id: string) {
    const target = props.modelValue.find((item) => item.id === id);
    if (target)
        URL.revokeObjectURL(target.previewUrl);
    emit("update:modelValue", props.modelValue.filter((item) => item.id !== id));
}
function clearFiles() {
    props.modelValue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    emit("update:modelValue", []);
}
function onDrop(event: DragEvent) {
    isDragging.value = false;
    if (event.dataTransfer?.files.length)
        addFiles(event.dataTransfer.files);
}
</script>

<template>
  <div>
               
                                                  
                                                                
                                                             
                                                             
                                          
                              
    <div class="upload-dropzone" :class="{ 'upload-dropzone--active': isDragging }"
      @click="fileInput?.click()" @dragenter.prevent="isDragging = true"
      @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false" @drop.prevent="onDrop">
      <div class="upload-dropzone__visual" aria-hidden="true">
                   
        <svg class="upload-dropzone__icon" viewBox="0 0 24 24" fill="none">
          <path d="M12 16V5m0 0L8 9m4-4 4 4" />
          <path d="M5 14v4.25A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V14" />
        </svg>
      </div>
      <div class="upload-dropzone__copy">
        <strong>导入胸部 X 线影像</strong>
        <span>将多张图片拖放至此，或从本地设备选择</span>
      </div>
      <div class="upload-dropzone__rules" aria-label="上传要求">
        <span>JPG / JPEG / PNG</span>
        <span>单张 ≤ {{ maxFileSizeMb }}MB</span>
        <span>最多 {{ maxFiles }} 张</span>
      </div>
                                                      
      <button class="button button--primary upload-dropzone__button" type="button" @click.stop="fileInput?.click()">选择影像</button>
                                        
      <input ref="fileInput" class="visually-hidden" type="file" accept="image/jpeg,image/png" multiple
        @change="($event) => addFiles(($event.target as HTMLInputElement).files ?? [])" />
    </div>
    <div v-if="modelValue.length" class="upload-summary">
      <strong>已选择 {{ modelValue.length }} 张</strong><span>总大小 {{ formatBytes(totalSize) }}</span>
      <button class="text-button text-button--danger" type="button" @click="clearFiles">清空全部</button>
    </div>
                 
    <div class="upload-list">
      <article v-for="item in modelValue" :key="item.id" class="upload-item">
        <button class="upload-item__preview" type="button" :aria-label="`查看 ${item.file.name}`" @click="emit('preview', item.id)">
          <img :src="item.previewUrl" :alt="item.file.name" />
        </button>
        <div class="upload-item__info"><strong>{{ item.file.name }}</strong>
          <small>{{ item.width && item.height ? `${item.width} × ${item.height} · ` : "" }}{{ formatBytes(item.file.size) }}</small>
          <span v-if="item.warning" class="warning-text">{{ item.warning }}</span>
        </div>
        <button class="text-button" type="button" @click="emit('preview', item.id)">查看</button>
        <button class="text-button text-button--danger" type="button" @click="removeFile(item.id)">删除</button>
      </article>
    </div>
  </div>
</template>

