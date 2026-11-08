from __future__ import annotations
"""
整理 NIH 数据和训练/验证/测试划分。
"""
import argparse
import csv
import random
from pathlib import Path

from model_runtime.classes import CHEST_XRAY_CLASSES


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def previous_splits(output_dir: Path) -> dict[str, str]:
    assignments: dict[str, str] = {}
    for split in ("train", "val", "test"):
        path = output_dir / f"{split}.csv"
        if not path.is_file():
            continue
        for row in read_rows(path):
            raw = row.get("Image_path") or row.get("image_path") or ""
            if raw:
                assignments[Path(raw).name] = split
    return assignments


def create_splits(
    filenames: list[str],
    patient_by_image: dict[str, str],
    official_test: set[str],
    seed: int,
) -> dict[str, str]:
    assignments = {name: "test" for name in filenames if name in official_test}
    development_patients = sorted({patient_by_image[name] for name in filenames if name not in official_test})
    random.Random(seed).shuffle(development_patients)
    val_count = max(1, round(len(development_patients) * 0.19))
    val_patients = set(development_patients[:val_count])
    for name in filenames:
        if name not in assignments:
            assignments[name] = "val" if patient_by_image[name] in val_patients else "train"
    return assignments


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare the local NIH ChestX-ray14 subset for 14-label training.")
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--reset-split", action="store_true", help="Ignore existing processed split assignments.")
    args = parser.parse_args()

    root = args.dataset_root.resolve()
    metadata_path = root / "Data_Entry_2017_v2020.csv"
    image_root = root / "images"
    output_dir = root / "processed"
    if not metadata_path.is_file() or not image_root.is_dir():
        raise FileNotFoundError("dataset root must contain Data_Entry_2017_v2020.csv and images/")

    metadata = read_rows(metadata_path)
    available = {path.name for path in image_root.glob("*.png") if path.is_file()}
    selected = [row for row in metadata if row["Image Index"] in available]
    if not selected:
        raise RuntimeError("No metadata rows match the extracted PNG images")
    if len(selected) != len(available):
        missing = sorted(available.difference(row["Image Index"] for row in selected))
        raise RuntimeError(f"{len(missing)} images have no metadata; examples: {missing[:5]}")

    patient_by_image = {row["Image Index"]: row["Patient ID"] for row in selected}
    assignments = {} if args.reset_split else previous_splits(output_dir)
    if not all(row["Image Index"] in assignments for row in selected):
        official_test_path = root / "test_list.txt"
        official_test = set(official_test_path.read_text(encoding="utf-8").splitlines()) if official_test_path.is_file() else set()
        assignments = create_splits(
            [row["Image Index"] for row in selected], patient_by_image, official_test, args.seed
        )

    class_names = [item.class_name_en for item in CHEST_XRAY_CLASSES]
    headers = [
        "Subject_id", "Study_id", "Image_path", "ViewPosition", "Split",
        *[f"class_{item.class_id}" for item in CHEST_XRAY_CLASSES], "Original_labels",
    ]
    prepared: list[dict[str, str | int]] = []
    for row in selected:
        filename = row["Image Index"]
        labels = set(row["Finding Labels"].split("|"))
        output: dict[str, str | int] = {
            "Subject_id": row["Patient ID"],
            "Study_id": Path(filename).stem,
            "Image_path": f"images/{filename}",
            "ViewPosition": row["View Position"],
            "Split": assignments[filename],
            "Original_labels": row["Finding Labels"],
        }
        for item in CHEST_XRAY_CLASSES:
            output[f"class_{item.class_id}"] = int(item.class_name_en in labels)
        prepared.append(output)

    output_dir.mkdir(parents=True, exist_ok=True)
    for split in ("all", "train", "val", "test"):
        rows = prepared if split == "all" else [row for row in prepared if row["Split"] == split]
        with (output_dir / f"{split}.csv").open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)

    with (output_dir / "label_mapping.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["class_id", "class_name", "class_name_en"])
        writer.writerows((item.class_id, item.class_name, item.class_name_en) for item in CHEST_XRAY_CLASSES)

    counts = {split: sum(row["Split"] == split for row in prepared) for split in ("train", "val", "test")}
    patient_sets = {
        split: {str(row["Subject_id"]) for row in prepared if row["Split"] == split}
        for split in ("train", "val", "test")
    }
    overlap = sum(
        len(patient_sets[left].intersection(patient_sets[right]))
        for left, right in (("train", "val"), ("train", "test"), ("val", "test"))
    )
    print(f"Prepared {len(prepared)} images: {counts}; patient_overlap={overlap}; classes={len(class_names)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
