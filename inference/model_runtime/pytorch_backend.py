from .settings import ModelSettings
from .team_model import TeamModelAdapter
from .types import HeatmapResult, ImageInput, PredictionResult
from .validation import build_prediction_result


class PytorchBackend:
    def __init__(self, settings: ModelSettings):
        self.settings = settings
        self.adapter = TeamModelAdapter()
        self.ready = False

    def load(self) -> None:
        if not self.settings.weights_path.is_file():
            raise RuntimeError(f"正式模型权重不存在：{self.settings.weights_path}")
        self.adapter.load(self.settings.weights_path, self.settings.device, self.settings.input_size)
        self.adapter.model_version = self.settings.model_version
        self.ready = True

    def health(self) -> dict:
        return {
            "model_ready": self.ready,
            "backend": "pytorch",
            "model_version": self.adapter.model_version,
            "device": self.adapter.device,
            "is_mock": False,
            "weights": self.settings.weights_path.name,
        }

    def predict(self, subject_id: str, study_id: str, images: list[ImageInput]) -> PredictionResult:
        if not self.ready:
            raise RuntimeError("正式模型尚未加载")
        probabilities = self.adapter.predict([image.content for image in images])
        return build_prediction_result(probabilities, self.adapter.model_version, self.adapter.device)

    def gradcam(self, image: ImageInput, class_id: int) -> HeatmapResult:
        if not self.ready:
            raise RuntimeError("正式模型尚未加载")
        mime_type, content = self.adapter.gradcam(image.content, class_id)
        if mime_type not in {"image/png", "image/jpeg"} or not content:
            raise ValueError("正式Grad-CAM必须返回非空PNG或JPEG字节")
        return HeatmapResult("grad-cam", False, mime_type, content)
