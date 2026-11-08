from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import torch
from torch import Tensor, nn
from torchvision import models


SUPPORTED_ARCHITECTURES = ("densenet121", "efficientnet_b0", "resnet50")


class StudyClassifier(nn.Module):
    pass                                                                        

    def __init__(
        self,
        architecture: str = "efficientnet_b0",
        num_classes: int = 14,
        aggregation: str = "max",
        pretrained: bool = False,
    ):
        super().__init__()
        if architecture not in SUPPORTED_ARCHITECTURES:
            raise ValueError(f"Unsupported architecture: {architecture}")
        if aggregation not in {"max", "mean"}:
            raise ValueError("aggregation must be max or mean")
        self.architecture = architecture
        self.num_classes = num_classes
        self.aggregation = aggregation

        if architecture == "densenet121":
            weights = models.DenseNet121_Weights.DEFAULT if pretrained else None
            backbone = models.densenet121(weights=weights)
            backbone.classifier = nn.Linear(backbone.classifier.in_features, num_classes)
        elif architecture == "efficientnet_b0":
            weights = models.EfficientNet_B0_Weights.DEFAULT if pretrained else None
            backbone = models.efficientnet_b0(weights=weights)
            backbone.classifier[-1] = nn.Linear(backbone.classifier[-1].in_features, num_classes)
        else:
            weights = models.ResNet50_Weights.DEFAULT if pretrained else None
            backbone = models.resnet50(weights=weights)
            backbone.fc = nn.Linear(backbone.fc.in_features, num_classes)
        self.backbone = backbone

    @property
    def gradcam_target_layer(self) -> nn.Module:
        if self.architecture == "densenet121":
            return self.backbone.features.norm5
        if self.architecture == "efficientnet_b0":
            return self.backbone.features[-1]
        return self.backbone.layer4[-1]

    def forward(self, images: Tensor, view_mask: Tensor | None = None) -> Tensor:
        if images.ndim == 4:
            return self.backbone(images)
        if images.ndim != 5:
            raise ValueError("images must have shape [B,C,H,W] or [B,V,C,H,W]")
        batch_size, view_count, channels, height, width = images.shape
        logits = self.backbone(images.reshape(batch_size * view_count, channels, height, width))
        logits = logits.reshape(batch_size, view_count, self.num_classes)
        if view_mask is None:
            view_mask = torch.ones((batch_size, view_count), dtype=torch.bool, device=images.device)
        if self.aggregation == "max":
            masked = logits.masked_fill(~view_mask.unsqueeze(-1), torch.finfo(logits.dtype).min)
            return masked.max(dim=1).values
        weights = view_mask.unsqueeze(-1).to(logits.dtype)
        return (logits * weights).sum(dim=1) / weights.sum(dim=1).clamp_min(1.0)


@dataclass(frozen=True)
class CheckpointMetadata:
    architecture: str
    input_size: int
    mean: tuple[float, float, float]
    std: tuple[float, float, float]
    aggregation: str
    thresholds: tuple[float, ...]
    model_version: str


def load_model_checkpoint(path: str | Any, device: torch.device) -> tuple[StudyClassifier, CheckpointMetadata, dict[str, Any]]:
    try:
        checkpoint = torch.load(path, map_location=device, weights_only=False)
    except TypeError:                               
        checkpoint = torch.load(path, map_location=device)
    required = {"state_dict", "architecture", "input_size", "mean", "std", "aggregation", "class_ids"}
    missing = required.difference(checkpoint)
    if missing:
        raise RuntimeError(f"Checkpoint is missing fields: {sorted(missing)}")
    class_ids = list(checkpoint["class_ids"])
    if class_ids != list(range(1, len(class_ids) + 1)):
        raise RuntimeError("Checkpoint class_ids must be contiguous and start at 1")
    model = StudyClassifier(checkpoint["architecture"], len(class_ids), checkpoint["aggregation"], pretrained=False)
    model.load_state_dict(checkpoint["state_dict"], strict=True)
    model.to(device).eval()
    metadata = CheckpointMetadata(
        architecture=str(checkpoint["architecture"]),
        input_size=int(checkpoint["input_size"]),
        mean=tuple(float(value) for value in checkpoint["mean"]),
        std=tuple(float(value) for value in checkpoint["std"]),
        aggregation=str(checkpoint["aggregation"]),
        thresholds=tuple(float(value) for value in checkpoint.get("thresholds", [0.5] * len(class_ids))),
        model_version=str(checkpoint.get("model_version", "team-model-v1")),
    )
    return model, metadata, checkpoint
