import { ref } from "vue";
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
export function useImageViewport() {
    const stage = ref<HTMLElement | null>(null);
    const zoom = ref(MIN_ZOOM);
    const panX = ref(0);
    const panY = ref(0);
    const isDragging = ref(false);
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;
    function clampPan() {
        const width = stage.value?.clientWidth ?? 0;
        const height = stage.value?.clientHeight ?? 0;
        const limitX = width * (zoom.value - 1) / 2;
        const limitY = height * (zoom.value - 1) / 2;
        panX.value = Math.max(-limitX, Math.min(limitX, panX.value));
        panY.value = Math.max(-limitY, Math.min(limitY, panY.value));
    }
    function setZoom(value: number) {
        zoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) / 100));
        clampPan();
    }
    function zoomIn() { setZoom(zoom.value + ZOOM_STEP); }
    function zoomOut() { setZoom(zoom.value - ZOOM_STEP); }
    function resetViewport() {
        zoom.value = MIN_ZOOM;
        panX.value = 0;
        panY.value = 0;
        isDragging.value = false;
        pointerId = null;
    }
    function onWheel(event: WheelEvent) {
        if ((event.deltaY < 0 && zoom.value >= MAX_ZOOM) || (event.deltaY > 0 && zoom.value <= MIN_ZOOM))
            return;
        event.preventDefault();
        if (event.deltaY < 0)
            zoomIn();
        else if (event.deltaY > 0)
            zoomOut();
    }
    function onPointerDown(event: PointerEvent) {
        if (zoom.value <= MIN_ZOOM || event.button !== 0)
            return;
        const element = event.currentTarget as HTMLElement;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startPanX = panX.value;
        startPanY = panY.value;
        isDragging.value = true;
        element.setPointerCapture(event.pointerId);
        event.preventDefault();
    }
    function onPointerMove(event: PointerEvent) {
        if (pointerId !== event.pointerId)
            return;
        panX.value = startPanX + event.clientX - startX;
        panY.value = startPanY + event.clientY - startY;
        clampPan();
    }
    function onPointerUp(event: PointerEvent) {
        if (pointerId !== event.pointerId)
            return;
        const element = event.currentTarget as HTMLElement;
        if (element.hasPointerCapture(event.pointerId))
            element.releasePointerCapture(event.pointerId);
        pointerId = null;
        isDragging.value = false;
    }
    return { stage, zoom, panX, panY, isDragging, zoomIn, zoomOut, resetViewport, onWheel, onPointerDown, onPointerMove, onPointerUp };
}
