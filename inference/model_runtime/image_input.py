from io import BytesIO
import warnings

import numpy as np
from PIL import Image, ImageFilter, ImageOps


INVALID_MESSAGE = '未通过胸部X线影像初检，请上传清晰的胸片原图。'


def _groups(values):
    selected = np.flatnonzero(values)
    return int(selected.size > 0) + int(np.count_nonzero(np.diff(selected) > 2))


def validate_chest_input(content: bytes, mime_type: str) -> None:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                expected = {'image/png': 'PNG', 'image/jpeg': 'JPEG'}.get(mime_type)
                if source.format != expected or getattr(source, 'n_frames', 1) != 1:
                    raise ValueError(INVALID_MESSAGE)
                width, height = source.size
                if min(width, height) < 224 or width * height > 36_000_000:
                    raise ValueError('影像尺寸不符合要求，请上传清晰的胸片原图。')
                source.load()
                image = ImageOps.exif_transpose(source).convert('RGB')
                image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    except (ValueError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ValueError(INVALID_MESSAGE) from error

    rgb = np.asarray(image, dtype=np.float32)
    color = rgb.max(axis=2) - rgb.min(axis=2)
    if float(np.mean(color > 35)) > 0.12:
        raise ValueError(INVALID_MESSAGE)
    gray_image = image.convert('L')
    gray = np.asarray(gray_image, dtype=np.float32)
    if np.percentile(gray, 95) - np.percentile(gray, 5) < 30:
        raise ValueError(INVALID_MESSAGE)
    if float(np.mean(np.abs(np.diff(gray, axis=1)) > 50)) > 0.28:
        raise ValueError(INVALID_MESSAGE)

    for angle in range(-10, 11, 2):
        rotated = gray_image.rotate(angle, resample=Image.Resampling.BILINEAR, fillcolor=255)
        pixels = np.asarray(rotated, dtype=np.float32)
        local = np.asarray(rotated.filter(ImageFilter.GaussianBlur(4)), dtype=np.float32)
        dark = pixels < local - 12
        height, width = dark.shape
        core = dark[int(height * .12):int(height * .88), int(width * .12):int(width * .88)]
        horizontal = _groups(core.mean(axis=1) > .42)
        vertical = _groups(core.mean(axis=0) > .42)
        if horizontal >= 4 and vertical >= 2:
            raise ValueError(INVALID_MESSAGE)

    smooth = np.asarray(gray_image.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32)
    if float(np.mean(gray > 205)) > .60 and float(np.mean(gray < smooth - 18)) > .025:
        raise ValueError(INVALID_MESSAGE)
