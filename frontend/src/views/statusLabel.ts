const statusLabels: Record<string, string> = {
    pending: "待处理",
    processing: "处理中",
    scanning: "扫描中",
    running: "运行中",
    completed: "已完成",
    failed: "失败"
};
export function statusLabel(status: string | undefined | null): string {
    return (status && statusLabels[status]) || "状态未知";
}
