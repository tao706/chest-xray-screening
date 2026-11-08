from .mock_backend import MockBackend
from .pytorch_backend import PytorchBackend
from .settings import ModelSettings
from .types import ModelBackend


def create_backend(settings: ModelSettings) -> ModelBackend:
    if settings.backend == "mock":
        return MockBackend()
    if settings.backend == "pytorch":
        return PytorchBackend(settings)
    raise RuntimeError(f"不支持的模型后端：{settings.backend}")
