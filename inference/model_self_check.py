from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

from model_runtime.classes import CHEST_XRAY_CLASSES
from model_runtime.factory import create_backend
from model_runtime.settings import INFERENCE_ROOT, settings
from model_runtime.types import ImageInput
from model_runtime.image_input import validate_chest_input
from model_runtime.semantic_gate import image_gate, validate_semantic_chest


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(len(ordered) * fraction) - 1)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the Chest AI model adapter contract.")
    parser.add_argument("--image", type=Path, default=INFERENCE_ROOT.parent / "examples" / "chest-xrays" / "chest-pa-01.jpg")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--max-latency-ms", type=float, default=10000.0)
    arguments = parser.parse_args()

    if len(CHEST_XRAY_CLASSES) != 14 or [item.class_id for item in CHEST_XRAY_CLASSES] != list(range(1, 15)):
        raise RuntimeError("类别契约必须是按1到14排序的固定十四类")
    image_path = arguments.image.resolve()
    if not image_path.is_file():
        raise RuntimeError(f"自检图片不存在：{image_path}")
    content = image_path.read_bytes()
    mime_type = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
    image = ImageInput(image_path.name, mime_type, content)

    backend = create_backend(settings)
    backend.load()
    image_gate.load()
    gate_started = time.perf_counter()
    validate_chest_input(content, mime_type)
    validate_semantic_chest(content)
    gate_ms = (time.perf_counter() - gate_started) * 1000
    if backend.health().get("is_mock") is not False:
        raise RuntimeError("真实推理验收不允许模拟后端")
    backend.predict("SELF_CHECK", "WARMUP", [image])
    latencies = []
    prediction = None
    for index in range(max(1, arguments.runs)):
        started_at = time.perf_counter()
        prediction = backend.predict("SELF_CHECK", f"RUN_{index}", [image])
        latencies.append((time.perf_counter() - started_at) * 1000)
    assert prediction is not None
    if len(prediction.predictions) != 14:
        raise RuntimeError("模型输出不是十四类")
    heatmap = backend.gradcam(image, 14)
    if not heatmap.content:
        raise RuntimeError("Grad-CAM输出为空")

    weight_files = [settings.weights_path] if settings.weights_path.is_file() else []
    weight_bytes = sum(item.stat().st_size for item in weight_files)
    p95_ms = percentile(latencies, 0.95)
    latency_passed = p95_ms <= arguments.max_latency_ms
    report = {
        "success": latency_passed,
        "backend": settings.backend,
        "model_version": prediction.model_version,
        "device": prediction.device,
        "class_count": len(prediction.predictions),
        "input_gate": {"ready": image_gate.ready, "validation_ms": round(gate_ms, 3)},
        "probabilities_valid": all(0 <= item.probability <= 1 for item in prediction.predictions),
        "gradcam": {"method": heatmap.method, "mime_type": heatmap.mime_type, "bytes": len(heatmap.content), "is_mock": heatmap.is_mock},
        "latency": {"runs": len(latencies), "average_ms": round(sum(latencies) / len(latencies), 3), "p95_ms": round(p95_ms, 3), "limit_ms": arguments.max_latency_ms, "passed": latency_passed},
        "weights": {"files": len(weight_files), "total_mb": round(weight_bytes / 1024 / 1024, 3), "scope": "disease-checkpoint-only"},
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if latency_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
