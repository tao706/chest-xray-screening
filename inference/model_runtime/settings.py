from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

INFERENCE_ROOT = Path(__file__).resolve().parent.parent


def load_local_env(file_path: Path) -> None:
    if not file_path.is_file():
        return
    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_local_env(INFERENCE_ROOT / ".env")


@dataclass(frozen=True)
class ModelSettings:
    backend: str
    weights_path: Path
    model_version: str
    device: str
    input_size: int
    max_images: int
    max_file_mb: int
    allowed_mime_types: frozenset[str] = frozenset({"image/jpeg", "image/png"})

    @property
    def max_file_bytes(self) -> int:
        return self.max_file_mb * 1024 * 1024


def load_settings() -> ModelSettings:
    weights_value = os.getenv("MODEL_WEIGHTS", "weights/chest_model.pt")
    weights_path = Path(weights_value)
    if not weights_path.is_absolute():
        weights_path = (INFERENCE_ROOT / weights_path).resolve()
    backend = os.getenv("MODEL_BACKEND", "pytorch").strip().lower()
    if backend not in {"mock", "pytorch"}:
        raise RuntimeError("MODEL_BACKEND must be mock or pytorch")
    return ModelSettings(
        backend=backend,
        weights_path=weights_path,
        model_version=os.getenv("MODEL_VERSION", "team-model-v1").strip() or "team-model-v1",
        device=os.getenv("MODEL_DEVICE", "auto").strip().lower(),
        input_size=int(os.getenv("MODEL_INPUT_SIZE", "512")),
        max_images=int(os.getenv("MODEL_MAX_IMAGES", "20")),
        max_file_mb=int(os.getenv("MODEL_MAX_FILE_MB", "10")),
    )


settings = load_settings()
