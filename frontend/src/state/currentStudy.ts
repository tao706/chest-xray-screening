import { computed, shallowRef } from "vue";
import { defineStore } from "pinia";
import type { SelectedImage } from "@/types/study";
import type { PredictionResult } from "@/types/prediction";
export const useCurrentStudyStore = defineStore("current-study", () => {
    const prediction = shallowRef<PredictionResult | null>(null);
    const images = shallowRef<SelectedImage[]>([]);
    const hasCurrentStudy = computed(() => prediction.value !== null);
    function setStudy(result: PredictionResult, selectedImages: SelectedImage[]) {
        prediction.value = result;
        images.value = [...selectedImages];
    }
    function clearStudy() {
        prediction.value = null;
        images.value = [];
    }
    return { prediction, images, hasCurrentStudy, setStudy, clearStudy };
});
