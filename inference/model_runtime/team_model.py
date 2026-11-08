from __future__ import annotations

from collections.abc import Sequence
from io import BytesIO
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps

from .model_definition import StudyClassifier, load_model_checkpoint


def _select_device(requested: str) -> torch.device:
    if requested == "auto":
        return torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    device = torch.device(requested)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available")
    return device


def _decode_image(content: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(content)) as image:
            return ImageOps.exif_transpose(image).convert("L").convert("RGB")
    except Exception as error:
        raise ValueError("Unable to decode chest X-ray image") from error


class TeamModelAdapter:
    pass                                                                           

    model_version = "team-model-v1"
    device = "not-loaded"

    def load(self, weights_path: Path, requested_device: str, input_size: int) -> None:
        from training.data import build_transform

        selected_device = _select_device(requested_device)
        model, metadata, checkpoint = load_model_checkpoint(weights_path, selected_device)
        if input_size != metadata.input_size:
            raise RuntimeError(
                f"MODEL_INPUT_SIZE={input_size} does not match checkpoint input_size={metadata.input_size}; update inference/.env"
            )
        from .classes import CHEST_XRAY_CLASSES
        if checkpoint.get("class_names") != [item.class_name_en for item in CHEST_XRAY_CLASSES]:
            raise RuntimeError("Checkpoint class names/order do not match the service contract")
        self.model: StudyClassifier = model
        self.torch_device = selected_device
        self.device = str(selected_device)
        self.model_version = metadata.model_version
        self.input_size = metadata.input_size
        self.transform = build_transform(metadata.input_size, False, metadata.mean, metadata.std)

    def predict(self, images: Sequence[bytes]) -> Sequence[float]:
        if not images:
            raise ValueError("At least one image is required")
        tensors = torch.stack([self.transform(_decode_image(content)) for content in images])
        with torch.inference_mode():
            per_view_logits = []
            for chunk in tensors.split(4):
                per_view_logits.append(self.model.backbone(chunk.to(self.torch_device, non_blocking=True)))
            logits = torch.cat(per_view_logits, dim=0)
            study_logits = logits.max(dim=0).values if self.model.aggregation == "max" else logits.mean(dim=0)
            probabilities = torch.sigmoid(study_logits).float().cpu().tolist()
        return probabilities

    def gradcam(self, image: bytes, class_id: int) -> tuple[str, bytes]:
        if class_id < 1 or class_id > self.model.num_classes:
            raise ValueError(f"class_id must be in 1..{self.model.num_classes}")
        source = _decode_image(image)
        tensor = self.transform(source).unsqueeze(0).to(self.torch_device)
        captured: dict[str, torch.Tensor] = {}

        def capture_activation(_module, _inputs, output):
            captured["activation"] = output
            output.retain_grad()

        handle = self.model.gradcam_target_layer.register_forward_hook(capture_activation)
        try:
            self.model.zero_grad(set_to_none=True)
            with torch.enable_grad():
                logits = self.model(tensor)
                logits[0, class_id - 1].backward()
            activation = captured.get("activation")
            if activation is None or activation.grad is None:
                raise RuntimeError("Grad-CAM target layer did not produce gradients")
            weights = activation.grad.mean(dim=(2, 3), keepdim=True)
            cam = torch.relu((weights * activation).sum(dim=1, keepdim=True))
            cam = torch.nn.functional.interpolate(cam, size=(self.input_size, self.input_size), mode="bilinear", align_corners=False)
            cam = cam[0, 0]
            cam = (cam - cam.min()) / (cam.max() - cam.min()).clamp_min(1e-8)
            cam_array = cam.detach().float().cpu().numpy()
        finally:
            handle.remove()

        width, height = source.size
        scale = min(self.input_size / width, self.input_size / height)
        resized_width = max(1, round(width * scale))
        resized_height = max(1, round(height * scale))
        left = (self.input_size - resized_width) // 2
        top = (self.input_size - resized_height) // 2
        cam_array = cam_array[top:top + resized_height, left:left + resized_width]
        heat = Image.fromarray(np.uint8(np.clip(cam_array, 0, 1) * 255), mode="L").resize(source.size, Image.Resampling.BILINEAR)
        heat_array = np.asarray(heat, dtype=np.float32) / 255.0
        color = np.zeros((height, width, 3), dtype=np.uint8)
        color[..., 0] = np.uint8(255 * heat_array)
        color[..., 1] = np.uint8(190 * np.clip(heat_array * 1.5 - 0.25, 0, 1))
        base = np.asarray(source, dtype=np.float32)
        overlay = np.uint8(np.clip(base * 0.62 + color.astype(np.float32) * 0.38, 0, 255))
        result = Image.fromarray(overlay, mode="RGB")
        buffer = BytesIO()
        result.save(buffer, format="PNG", optimize=True)
        return "image/png", buffer.getvalue()
