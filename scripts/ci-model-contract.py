from pathlib import Path
import sys
import re
import unittest
import math

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'inference'))

from model_runtime.classes import CHEST_XRAY_CLASSES
from model_runtime.validation import build_prediction_result


class ModelContractChecks(unittest.TestCase):
    def test_backend_labels_match_business_labels(self):
        source = (ROOT / 'server/src/constants/classes.ts').read_text(encoding='utf-8-sig')
        pattern = r'["\']?id["\']?\s*:\s*(\d+)\s*,\s*["\']?name["\']?\s*:\s*"([^"]+)"\s*,\s*["\']?nameEn["\']?\s*:\s*"([^"]+)"'
        business = [(int(i), name, english) for i, name, english in re.findall(pattern, source)]
        backend = [(c.class_id, c.class_name, c.class_name_en) for c in CHEST_XRAY_CLASSES]
        self.assertEqual(len(backend), 14)
        self.assertEqual(business, backend)
        self.assertNotIn('No Finding', [c.class_name_en for c in CHEST_XRAY_CLASSES])

    def test_invalid_results_are_rejected(self):
        for size in (0, 10, 13, 15):
            with self.subTest(size=size), self.assertRaises(ValueError):
                build_prediction_result([0.5] * size, 'ci-contract', 'cpu')
        for value in (-0.01, 1.01, math.nan, math.inf, -math.inf):
            with self.subTest(value=value), self.assertRaises(ValueError):
                build_prediction_result([value] + [0.5] * 13, 'ci-contract', 'cpu')

    def test_boundary_scores_remain_valid(self):
        values = [0.0, 1.0] + [0.5] * 12
        result = build_prediction_result(values, 'ci-contract', 'cpu')
        self.assertEqual([p.probability for p in result.predictions], values)

    def test_imports_do_not_need_weights(self):
        import fastapi
        import torch
        import torchvision
        import PIL
        import numpy
        import main
        self.assertTrue(main.app)

    def test_missing_weights_fail_explicitly(self):
        from dataclasses import replace
        from tempfile import TemporaryDirectory
        from model_runtime.settings import settings
        from model_runtime.factory import create_backend
        with TemporaryDirectory() as directory:
            config = replace(settings, backend='pytorch', weights_path=Path(directory) / 'missing.pt')
            backend = create_backend(config)
            with self.assertRaises(RuntimeError):
                backend.load()
            self.assertFalse(backend.ready)


if __name__ == '__main__':
    unittest.main(verbosity=2)
