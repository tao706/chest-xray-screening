import hashlib
import time

from .types import HeatmapResult, ImageInput, PredictionResult
from .validation import build_prediction_result


class MockBackend:
    def load(self) -> None:
        return None

    def health(self) -> dict:
        return {"model_ready": True, "backend": "mock", "model_version": "mock-v2-adapter", "device": "CPU mock", "is_mock": True}

    def predict(self, subject_id: str, study_id: str, images: list[ImageInput]) -> PredictionResult:
        digest = hashlib.sha256(f"{subject_id}:{study_id}".encode("utf-8"))
        for image in images:
            digest.update(image.content[:4096])
        seed = digest.digest()
        probabilities = [0.03 + (int.from_bytes(seed[index:index + 2], "big") / 65535) * 0.94 for index in range(10)]
        time.sleep(0.05)
        return build_prediction_result(probabilities, "mock-v2-adapter", "CPU mock")

    def gradcam(self, image: ImageInput, class_id: int) -> HeatmapResult:
        digest = hashlib.sha256(image.content[:8192] + bytes([class_id])).digest()
        hotspots = []
        for index in range(3):
            x = 110 + digest[index * 3] / 255 * 292
            y = 105 + digest[index * 3 + 1] / 255 * 302
            radius = 55 + digest[index * 3 + 2] / 255 * 65
            hotspots.append((round(x, 1), round(y, 1), round(radius, 1)))
        definitions = "".join(
            f'<radialGradient id="h{index}"><stop offset="0%" stop-color="#ff2400" stop-opacity="0.95"/><stop offset="35%" stop-color="#ff8c00" stop-opacity="0.82"/><stop offset="68%" stop-color="#ffe600" stop-opacity="0.48"/><stop offset="100%" stop-color="#ffe600" stop-opacity="0"/></radialGradient>'
            for index in range(len(hotspots))
        )
        circles = "".join(
            f'<ellipse cx="{x}" cy="{y}" rx="{radius}" ry="{round(radius * 1.18, 1)}" fill="url(#h{index})"/>'
            for index, (x, y, radius) in enumerate(hotspots)
        )
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs>{definitions}</defs>{circles}</svg>'
        return HeatmapResult("mock-attention-overlay", True, "image/svg+xml", svg.encode("utf-8"))
