from pathlib import Path
from io import BytesIO
from hashlib import sha256
import importlib.util
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('model_download', Path(__file__).with_name('download-model.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DownloadChecks(unittest.TestCase):
    def test_valid_existing_file_skips_network(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'model.pt'
            target.write_bytes(b'valid')
            with patch.object(module, 'urlopen') as network:
                self.assertFalse(module.download_verified('https://example.test', target, sha256(b'valid').hexdigest(), 5))
                network.assert_not_called()

    def test_valid_download_is_installed(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'model.pt'
            with patch.object(module, 'urlopen', return_value=BytesIO(b'valid')):
                self.assertTrue(module.download_verified('https://example.test', target, sha256(b'valid').hexdigest(), 5))
            self.assertEqual(target.read_bytes(), b'valid')

    def test_wrong_or_truncated_download_preserves_existing_file(self):
        for data in (b'wrong', b'x', b'toolarge'):
            with self.subTest(data=data), tempfile.TemporaryDirectory() as folder:
                target = Path(folder) / 'model.pt'
                target.write_bytes(b'original')
                with patch.object(module, 'urlopen', return_value=BytesIO(data)), self.assertRaises(ValueError):
                    module.download_verified('https://example.test', target, sha256(b'valid').hexdigest(), 5)
                self.assertEqual(target.read_bytes(), b'original')
                self.assertEqual(list(Path(folder).glob('*.part')), [])

    def test_network_failure_preserves_existing_file(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'model.pt'
            target.write_bytes(b'original')
            with patch.object(module, 'urlopen', side_effect=OSError('offline')), self.assertRaises(OSError):
                module.download_verified('https://example.test', target, 'invalid', 5)
            self.assertEqual(target.read_bytes(), b'original')


if __name__ == '__main__':
    unittest.main(verbosity=2)
