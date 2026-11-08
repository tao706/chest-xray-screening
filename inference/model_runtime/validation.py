import math
from collections.abc import Sequence

from .classes import CHEST_XRAY_CLASSES
from .types import Prediction, PredictionResult


def build_prediction_result(probabilities: Sequence[float], model_version: str, device: str) -> PredictionResult:
    if len(probabilities) != len(CHEST_XRAY_CLASSES):
        raise ValueError(f"模型必须返回14个概率，当前返回{len(probabilities)}个")
    predictions = []
    for class_info, raw_probability in zip(CHEST_XRAY_CLASSES, probabilities, strict=True):
        probability = float(raw_probability)
        if not math.isfinite(probability) or probability < 0 or probability > 1:
            raise ValueError(f"类别{class_info.class_id}概率不在[0,1]范围内")
        predictions.append(Prediction(class_info.class_id, class_info.class_name, class_info.class_name_en, round(probability, 8)))
    if not model_version.strip():
        raise ValueError("model_version不能为空")
    return PredictionResult(model_version=model_version, device=device, predictions=tuple(predictions))
