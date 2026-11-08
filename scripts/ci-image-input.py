from pathlib import Path
from io import BytesIO
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'inference'))

from PIL import Image, ImageDraw
from starlette.datastructures import Headers, UploadFile
from fastapi import HTTPException
from model_runtime.image_input import validate_chest_input
import main


def encoded(image):
    stream = BytesIO()
    image.save(stream, format='PNG')
    return stream.getvalue()


def document(angle=0):
    image = Image.new('RGB', (640, 900), (170, 170, 170))
    draw = ImageDraw.Draw(image)
    for y in range(40, 860, 60):
        draw.line((30, y, 610, y), fill=(25, 25, 25), width=3)
    for x in range(30, 611, 100):
        draw.line((x, 40, x, 850), fill=(25, 25, 25), width=3)
    for y in range(50, 850, 60):
        draw.text((40, y), 'SYNTHETIC TEST FORM', fill=(20, 20, 20))
    return encoded(image.rotate(angle, fillcolor=(190, 190, 190)))


def upload(data):
    return UploadFile(file=BytesIO(data), filename='test.png', headers=Headers({'content-type': 'image/png'}))


class InputChecks(unittest.TestCase):
    def test_document_photos_are_rejected(self):
        for angle in (0, 4, 8, -6):
            with self.subTest(angle=angle), self.assertRaises(ValueError):
                validate_chest_input(document(angle), 'image/png')

    def test_invalid_uniform_and_colored_inputs_are_rejected(self):
        for data in (b'not an image', encoded(Image.new('RGB', (512, 512), 'white')), encoded(Image.new('RGB', (512, 512), 'red'))):
            with self.subTest(size=len(data)), self.assertRaises(ValueError):
                validate_chest_input(data, 'image/png')

    def test_public_samples_are_accepted(self):
        for name, mime in [('chest-pa-01.jpg', 'image/jpeg'), ('chest-pa-02.png', 'image/png')]:
            with self.subTest(name=name):
                validate_chest_input((ROOT / 'examples/chest-xrays' / name).read_bytes(), mime)


class EndpointChecks(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_member_prevents_entire_study_inference(self):
        good = (ROOT / 'examples/chest-xrays/chest-pa-01.jpg').read_bytes()
        valid = UploadFile(file=BytesIO(good), filename='sample.jpg', headers=Headers({'content-type': 'image/jpeg'}))
        backend = Mock()
        with patch.object(main, 'backend', backend), patch.object(main, 'validate_semantic_chest'):
            with self.assertRaises(HTTPException) as failure:
                await main.predict('TEST', 'TEST', [valid, upload(document())])
            self.assertEqual(failure.exception.status_code, 422)
            self.assertEqual(failure.exception.detail['code'], 'INVALID_CHEST_IMAGE')
            backend.predict.assert_not_called()

    async def test_gradcam_also_rejects_invalid_input(self):
        backend = Mock()
        with patch.object(main, 'backend', backend), patch.object(main, 'validate_semantic_chest'):
            with self.assertRaises(HTTPException) as failure:
                await main.gradcam(1, upload(document(4)))
            self.assertEqual(failure.exception.status_code, 422)
            backend.gradcam.assert_not_called()


class SemanticGateChecks(unittest.TestCase):
    def test_missing_gate_never_accepts_input(self):
        from model_runtime.semantic_gate import SemanticImageGate, ImageGateUnavailable
        with self.assertRaises(ImageGateUnavailable):
            SemanticImageGate().validate(b'test')

    def test_uncertain_and_non_chest_scores_are_rejected(self):
        from model_runtime.semantic_gate import SemanticImageGate
        for scores in ((.20, .10), (.31, .30), (.20, .35)):
            gate = SemanticImageGate()
            gate.ready = True
            gate.scores = Mock(return_value=scores)
            with self.subTest(scores=scores), self.assertRaises(ValueError):
                gate.validate(b'test')

    def test_previously_accepted_cache_cannot_bypass_unavailable_gate(self):
        from model_runtime.semantic_gate import SemanticImageGate, ImageGateUnavailable
        gate = SemanticImageGate()
        gate.ready = True
        gate.scores = Mock(return_value=(.35, .20))
        gate.validate(b'test')
        gate.ready = False
        with self.assertRaises(ImageGateUnavailable):
            gate.validate(b'test')


if __name__ == '__main__':
    unittest.main(verbosity=2)
