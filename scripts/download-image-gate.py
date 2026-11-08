from pathlib import Path
import json
import os

os.environ.setdefault('HF_HUB_DISABLE_XET', '1')

from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parent.parent
REPOSITORY = 'openai/clip-vit-base-patch32'
REVISION = '3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268'

if __name__ == '__main__':
    target = ROOT / 'inference/weights/image_gate'
    origin = target / 'ORIGIN.json'
    required = ['config.json', 'preprocessor_config.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.json', 'merges.txt']
    metadata = {}
    if origin.is_file():
        try:
            metadata = json.loads(origin.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            pass
    checkpoint = target / 'pytorch_model.bin'
    if metadata.get('revision') == REVISION and (metadata.get('repository') or metadata.get('repo')) == REPOSITORY and all((target / name).is_file() for name in required) and checkpoint.is_file() and checkpoint.stat().st_size == 605247071:
        print('Pinned image admission model already present. Reusing local files; full loading is checked at startup.')
        raise SystemExit(0)
    snapshot_download(repo_id=REPOSITORY, revision=REVISION, local_dir=target,
                      allow_patterns=['config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
                                      'special_tokens_map.json', 'vocab.json', 'merges.txt', 'pytorch_model.bin'], max_workers=2)
    (target / 'ORIGIN.json').write_text(json.dumps({'repository': REPOSITORY, 'revision': REVISION}, indent=2) + '\n', encoding='utf-8')
    print('Local image type validation model prepared. No user images were uploaded.')
