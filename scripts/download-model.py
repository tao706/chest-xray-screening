from hashlib import sha256
from pathlib import Path
import argparse
import json
import os
import tempfile
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
MODEL_SHA256 = '91fe5a2657f4dbddd7a8a1d162c25f4d873524d6594a5f0c176ae51245004a24'
MODEL_BYTES = 16385831
RELEASE_API = 'https://api.github.com/repos/tao706/chest-xray-screening/releases/tags/model-v1.0.0'
DOWNLOAD_URL = 'https://github.com/tao706/chest-xray-screening/releases/download/model-v1.0.0/chest_model.pt'


def matches(path, expected_hash=MODEL_SHA256, expected_bytes=MODEL_BYTES):
    if not path.is_file() or path.stat().st_size != expected_bytes:
        return False
    digest = sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest() == expected_hash


def download_verified(url, target, expected_hash=MODEL_SHA256, expected_bytes=MODEL_BYTES):
    if matches(target, expected_hash, expected_bytes):
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        digest, count = sha256(), 0
        request = Request(url, headers={'User-Agent': 'chest-xray-model-setup', 'Accept': 'application/octet-stream'})
        with urlopen(request, timeout=45) as response, tempfile.NamedTemporaryFile(dir=target.parent, prefix='.model-download-', suffix='.part', delete=False) as output:
            temporary = Path(output.name)
            while block := response.read(1024 * 1024):
                count += len(block)
                if count > expected_bytes:
                    raise ValueError('Downloaded model exceeds expected size')
                digest.update(block)
                output.write(block)
        if count != expected_bytes or digest.hexdigest() != expected_hash:
            raise ValueError('Model size or SHA-256 mismatch')
        os.replace(temporary, target)
        return True
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def prepare():
    target = ROOT / 'inference/weights/chest_model.pt'
    if matches(target):
        print('Disease model already present; SHA-256 verified. Download skipped.')
        return
    for attempt in range(3):
        try:
            if attempt == 0:
                url = DOWNLOAD_URL
            else:
                with urlopen(Request(RELEASE_API, headers={'User-Agent': 'chest-xray-model-setup'}), timeout=30) as response:
                    release = json.load(response)
                asset = next(item for item in release['assets'] if item['name'] == 'chest_model.pt')
                if not asset['url'].startswith('https://api.github.com/repos/tao706/chest-xray-screening/releases/assets/'):
                    raise ValueError('Unexpected release asset URL')
                url = asset['url']
            print(f'Downloading disease model (16.4 MB), attempt {attempt + 1}/3...')
            download_verified(url, target)
            print('Disease model ready; SHA-256 verified.')
            return
        except (OSError, ValueError, KeyError, StopIteration):
            if attempt == 2:
                raise RuntimeError('Model download failed. Retry npm run models:prepare or use docs/MODEL_DOWNLOAD.md. Existing files were preserved.') from None
            time.sleep(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        if not matches(ROOT / 'inference/weights/chest_model.pt'):
            raise SystemExit('Disease model missing or checksum mismatch. Run npm run models:prepare.')
        print('Disease model SHA-256 verified.')
    else:
        prepare()
