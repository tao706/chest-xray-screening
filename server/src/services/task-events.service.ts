import { EventEmitter } from "node:events";
import type { BatchProgressEvent } from "../types/batch.js";
const emitter = new EventEmitter();
emitter.setMaxListeners(100);
export function publishTaskEvent(event: BatchProgressEvent) {
    emitter.emit(event.taskId, event);
}
export function subscribeTaskEvent(taskId: string, listener: (event: BatchProgressEvent) => void) {
    emitter.on(taskId, listener);
    return () => emitter.off(taskId, listener);
}
