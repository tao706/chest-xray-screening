from __future__ import annotations

import argparse
import csv
from pathlib import Path

import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

from model_runtime.model_definition import load_model_checkpoint
from training.data import StudyDataset, build_transform, collate_studies, load_unlabeled_studies


def main() -> int:
    parser = argparse.ArgumentParser(description="Run inference and export every configured class per Study_id.")
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--metadata-csv", type=Path)
    parser.add_argument("--output", type=Path, default=Path("submission.csv"))
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--max-views", type=int, default=20)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--with-gate", action="store_true", help="Append per-class validation thresholds as Gate.")
    parser.add_argument("--omit-subject-id", action="store_true")
    args = parser.parse_args()

    device = torch.device("cuda:0" if args.device == "auto" and torch.cuda.is_available() else ("cpu" if args.device == "auto" else args.device))
    model, metadata, _ = load_model_checkpoint(args.weights.resolve(), device)
    records = load_unlabeled_studies(args.images.resolve(), args.metadata_csv.resolve() if args.metadata_csv else None)
    dataset = StudyDataset(records, build_transform(metadata.input_size, False, metadata.mean, metadata.std), args.max_views, train=False)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=False, num_workers=args.workers,
                        pin_memory=device.type == "cuda", collate_fn=collate_studies,
                        persistent_workers=args.workers > 0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    headers = ([] if args.omit_subject_id else ["Subject_id"]) + ["Study_id", "Predict_class", "Probability"]
    if args.with_gate:
        headers.append("Gate")
    row_count = 0
    seen_studies: set[str] = set()
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        with torch.inference_mode():
            for batch in tqdm(loader, desc="test inference"):
                logits = model(batch["images"].to(device, non_blocking=True), batch["view_mask"].to(device, non_blocking=True))
                probabilities = torch.sigmoid(logits).float().cpu().tolist()
                for subject_id, study_id, scores in zip(batch["subject_id"], batch["study_id"], probabilities, strict=True):
                    if study_id in seen_studies:
                        raise RuntimeError(f"Duplicate Study_id in test data: {study_id}")
                    seen_studies.add(study_id)
                    for class_index, probability in enumerate(scores):
                        row = ([] if args.omit_subject_id else [subject_id]) + [study_id, class_index + 1, f"{probability:.8f}"]
                        if args.with_gate:
                            row.append(f"{metadata.thresholds[class_index]:.4f}")
                        writer.writerow(row)
                        row_count += 1
    expected_rows = len(records) * model.num_classes
    if row_count != expected_rows:
        raise RuntimeError(f"Export row count mismatch: got {row_count}, expected {expected_rows}")
    print(f"Wrote {row_count} rows for {len(records)} studies to {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
