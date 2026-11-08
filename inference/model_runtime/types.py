from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ImageInput:
    filename: str
    content_type: str
    content: bytes


@dataclass(frozen=True)
class Prediction:
    class_id: int
    class_name: str
    class_name_en: str
    probability: float

    def as_dict(self) -> dict:
        return {
            "class_id": self.class_id,
            "class_name": self.class_name,
            "class_name_en": self.class_name_en,
            "probability": self.probability,
        }


@dataclass(frozen=True)
class PredictionResult:
    model_version: str
    device: str
    predictions: tuple[Prediction, ...]


@dataclass(frozen=True)
class HeatmapResult:
    method: str
    is_mock: bool
    mime_type: str
    content: bytes


class ModelBackend(Protocol):
    def load(self) -> None: ...
    def health(self) -> dict: ...
    def predict(self, subject_id: str, study_id: str, images: list[ImageInput]) -> PredictionResult: ...
    def gradcam(self, image: ImageInput, class_id: int) -> HeatmapResult: ...
