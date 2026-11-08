from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

from model_runtime.model_definition import load_model_checkpoint
from training.data import StudyDataset, build_transform, collate_studies, load_labeled_studies
from training.metrics import multilabel_metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate a trained checkpoint on a labeled split.")
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    device = torch.device(
        "cuda:0" if args.device == "auto" and torch.cuda.is_available()
        else ("cpu" if args.device == "auto" else args.device)
    )
    model, metadata, checkpoint = load_model_checkpoint(args.weights.resolve(), device)
    records = load_labeled_studies(args.csv.resolve(), args.images.resolve())
    dataset = StudyDataset(
        records,
        build_transform(metadata.input_size, False, metadata.mean, metadata.std),
        max_views=1,
        train=False,
    )
    loader = DataLoader(
        dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        collate_fn=collate_studies,
        persistent_workers=args.workers > 0,
    )
    targets: list[np.ndarray] = []
    masks: list[np.ndarray] = []
    probabilities: list[np.ndarray] = []
    with torch.inference_mode():
        for batch in tqdm(loader, desc="evaluate"):
            logits = model(batch["images"].to(device), batch["view_mask"].to(device))
            probabilities.append(torch.sigmoid(logits).cpu().numpy())
            targets.append(batch["targets"].numpy())
            masks.append(batch["target_mask"].numpy())

    metrics = multilabel_metrics(
        np.concatenate(targets),
        np.concatenate(probabilities),
        np.concatenate(masks),
        np.asarray(metadata.thresholds, dtype=np.float32),
    )
    report = {
        "dataset": str(args.csv.resolve()),
        "studies": len(records),
        "device": str(device),
        "model_version": metadata.model_version,
        "checkpoint_epoch": checkpoint.get("epoch"),
        "validation_metrics": checkpoint.get("metrics"),
        "evaluation_metrics": metrics,
    }
    content = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content, encoding="utf-8")
    print(content)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
