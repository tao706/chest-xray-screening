from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from model_runtime.classes import CHEST_XRAY_CLASSES
from training.data import class_counts, load_labeled_studies


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit a labeled NIH ChestX-ray14 split before training.")
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--compare-csv", type=Path)
    parser.add_argument("--compare-images", type=Path)
    parser.add_argument("--uncertain-policy", choices=("zero", "one", "ignore"), default="zero")
    parser.add_argument("--verify-images", action="store_true", help="Decode every image and report corrupt files/dimensions.")
    args = parser.parse_args()
    records = load_labeled_studies(args.csv.resolve(), args.images.resolve(), args.uncertain_policy)
    positives, observed = class_counts(records)
    result = {
        "studies": len(records),
        "subjects": len({item.subject_id for item in records}),
        "images": sum(len(item.image_paths) for item in records),
        "multi_image_studies": sum(len(item.image_paths) > 1 for item in records),
        "classes": [
            {
                "id": item.class_id,
                "name": item.class_name_en,
                "positive": int(positives[index]),
                "observed": int(observed[index]),
                "prevalence": round(float(positives[index] / observed[index].clamp_min(1)), 6),
            }
            for index, item in enumerate(CHEST_XRAY_CLASSES)
        ],
    }
    if args.verify_images:
        corrupt: list[str] = []
        widths: list[int] = []
        heights: list[int] = []
        for record in records:
            for path in record.image_paths:
                try:
                    with Image.open(path) as image:
                        image.verify()
                    with Image.open(path) as image:
                        widths.append(image.width)
                        heights.append(image.height)
                except Exception:
                    corrupt.append(str(path))
        result["image_integrity"] = {
            "corrupt_count": len(corrupt),
            "corrupt_examples": corrupt[:20],
            "min_width": min(widths) if widths else None,
            "max_width": max(widths) if widths else None,
            "min_height": min(heights) if heights else None,
            "max_height": max(heights) if heights else None,
        }
        if corrupt:
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 3
    if args.compare_csv:
        if not args.compare_images:
            parser.error("--compare-images is required with --compare-csv")
        other = load_labeled_studies(args.compare_csv.resolve(), args.compare_images.resolve(), args.uncertain_policy)
        subject_overlap = {item.subject_id for item in records}.intersection(item.subject_id for item in other)
        study_overlap = {item.study_id for item in records}.intersection(item.study_id for item in other)
        result["split_overlap"] = {
            "subject_count": len(subject_overlap), "study_count": len(study_overlap),
            "subject_examples": sorted(subject_overlap)[:10], "study_examples": sorted(study_overlap)[:10],
        }
        if subject_overlap or study_overlap:
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
