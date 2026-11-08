from collections import OrderedDict
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from threading import Lock

from PIL import Image, ImageOps

from .settings import INFERENCE_ROOT


class ImageGateUnavailable(RuntimeError):
    pass


class SemanticImageGate:
    positives = (
        'a frontal chest X-ray radiograph showing both lungs, ribs and heart',
        'a medical X-ray image of the human chest',
        'a chest radiograph',
    )
    negatives = (
        'a photograph of a person, a portrait or a selfie',
        'a photograph of people outdoors',
        'a photograph of a landscape, mountains or trees',
        'a photograph of a building or a street',
        'a photograph of food, objects or animals',
        'a computer screenshot or software interface',
        'a printed document, a form, a table or handwritten text',
        'a drawing, illustration or cartoon',
        'a CT or MRI scan',
        'an X-ray image of a hand, arm, leg or foot',
        'an X-ray image of a skull, spine or teeth',
        'a mammogram of a breast',
    )

    def __init__(self):
        self.ready = False
        self.lock = Lock()
        self.cache = OrderedDict()

    def load(self, directory: Path | None = None):
        self.ready = False
        self.cache.clear()
        import torch
        from transformers import CLIPModel, CLIPImageProcessor, CLIPTokenizerFast

        directory = directory or INFERENCE_ROOT / 'weights' / 'image_gate'
        if not (directory / 'pytorch_model.bin').is_file():
            raise ImageGateUnavailable('影像类型校验未就绪，请先运行图像校验模型准备脚本。')
        try:
            self.model = CLIPModel.from_pretrained(str(directory), local_files_only=True, use_safetensors=False, weights_only=True).eval()
            self.processor = CLIPImageProcessor.from_pretrained(str(directory), local_files_only=True)
            tokenizer = CLIPTokenizerFast.from_pretrained(str(directory), local_files_only=True)
            tokens = tokenizer(list(self.positives + self.negatives), padding=True, return_tensors='pt')
            with torch.inference_mode():
                features = self.model.get_text_features(**tokens).float()
                self.text_features = features / features.norm(dim=-1, keepdim=True)
            self.ready = True
        except Exception as error:
            raise ImageGateUnavailable('影像类型校验模型加载失败，请检查本地依赖和权重。') from error

    def scores(self, content: bytes):
        import torch

        if not self.ready:
            raise ImageGateUnavailable('影像类型校验未就绪，暂不能开始分析。')
        with Image.open(BytesIO(content)) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
            inputs = self.processor(images=image, return_tensors='pt')
        with torch.inference_mode():
            features = self.model.get_image_features(**inputs).float()
            features = features / features.norm(dim=-1, keepdim=True)
            similarities = (features @ self.text_features.T)[0]
        positive = float(similarities[:len(self.positives)].max())
        negative = float(similarities[len(self.positives):].max())
        return positive, negative

    def validate(self, content: bytes):
        fingerprint = sha256(content).hexdigest()
        with self.lock:
            if not self.ready:
                raise ImageGateUnavailable('影像类型校验未就绪，暂不能开始分析。')
            accepted = self.cache.get(fingerprint)
            if accepted is None:
                positive, negative = self.scores(content)
                accepted = positive >= .25 and positive - negative >= .04
                self.cache[fingerprint] = accepted
                if len(self.cache) > 256:
                    self.cache.popitem(last=False)
            else:
                self.cache.move_to_end(fingerprint)
        if not accepted:
            raise ValueError('未能确认该图片为胸部X线影像，请上传清晰的胸片原图。')


image_gate = SemanticImageGate()


def validate_semantic_chest(content: bytes):
    image_gate.validate(content)
