from __future__ import annotations

import asyncio
import os
import base64
import time
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from model_runtime.classes import CHEST_XRAY_CLASSES
from model_runtime.concurrency import InferenceSlots, InferenceBusy
from model_runtime.image_input import validate_chest_input
from model_runtime.semantic_gate import image_gate, validate_semantic_chest, ImageGateUnavailable
from model_runtime.factory import create_backend
from model_runtime.settings import settings
from model_runtime.types import ImageInput

backend = create_backend(settings)
slots = InferenceSlots(int(os.getenv("MODEL_CONCURRENCY_LIMIT", "0")))


@asynccontextmanager
async def lifespan(_: FastAPI):
    await asyncio.to_thread(backend.load)
    await asyncio.to_thread(image_gate.load)
    yield


app = FastAPI(title="Chest AI Inference Service", version="1.0.0", docs_url="/docs", lifespan=lifespan)


@app.get("/internal/health")
def health() -> dict:
    return {"success": True, "status": "healthy", **backend.health(), "input_gate_ready": image_gate.ready}


@app.get("/internal/model-contract")
def model_contract() -> dict:
    return {
        "success": True,
        "backend": settings.backend,
        "classes": [item.as_dict() for item in CHEST_XRAY_CLASSES],
        "requirements": {
            "probability_count": len(CHEST_XRAY_CLASSES),
            "probability_range": [0, 1],
            "max_images_per_study": settings.max_images,
            "allowed_mime_types": sorted(settings.allowed_mime_types),
        },
    }


async def read_image(image: UploadFile) -> ImageInput:
    if image.content_type not in settings.allowed_mime_types:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型：{image.filename}")
    content = await image.read(settings.max_file_bytes + 1)
    if not content:
        raise HTTPException(status_code=400, detail=f"图片为空：{image.filename}")
    if len(content) > settings.max_file_bytes:
        raise HTTPException(status_code=400, detail=f"图片超过{settings.max_file_mb}MB：{image.filename}")
    try:
        await asyncio.to_thread(validate_chest_input, content, image.content_type)
        await asyncio.to_thread(validate_semantic_chest, content)
    except ImageGateUnavailable as error:
        raise HTTPException(status_code=503, detail={"code": "IMAGE_GATE_UNAVAILABLE", "message": str(error)}) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": "INVALID_CHEST_IMAGE", "message": str(error)}) from error
    return ImageInput(filename=image.filename or "image", content_type=image.content_type, content=content)


@app.post("/internal/validate-images")
async def validate_images(images: Annotated[list[UploadFile], File(min_length=1, max_length=20)]) -> dict:
    for image in images:
        await read_image(image)
    return {"success": True, "accepted": True}


@app.post("/internal/predict")
async def predict(
    subject_id: Annotated[str, Form(min_length=1, max_length=64)],
    study_id: Annotated[str, Form(min_length=1, max_length=64)],
    images: Annotated[list[UploadFile], File(min_length=1, max_length=20)],
) -> dict:
    if len(images) > settings.max_images:
        raise HTTPException(status_code=400, detail=f"单次最多上传{settings.max_images}张图片")
    inputs = [await read_image(image) for image in images]
    started_at = time.perf_counter()
    try:
        result = await asyncio.to_thread(slots.run, backend.predict, subject_id, study_id, inputs)
    except InferenceBusy as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    elapsed_ms = round((time.perf_counter() - started_at) * 1000, 3)
    return {
        "success": True,
        "subject_id": subject_id,
        "study_id": study_id,
        "model_version": result.model_version,
        "inference_time_ms": elapsed_ms,
        "image_count": len(inputs),
        "predictions": [prediction.as_dict() for prediction in result.predictions],
    }


@app.post("/internal/gradcam")
async def gradcam(
    class_id: Annotated[int, Form(ge=1, le=len(CHEST_XRAY_CLASSES))],
    image: Annotated[UploadFile, File()],
) -> dict:
    image_input = await read_image(image)
    try:
        result = await asyncio.to_thread(slots.run, backend.gradcam, image_input, class_id)
    except InferenceBusy as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {
        "success": True,
        "class_id": class_id,
        "method": result.method,
        "is_mock": result.is_mock,
        "heatmap_mime_type": result.mime_type,
        "heatmap_base64": base64.b64encode(result.content).decode("ascii"),
    }
