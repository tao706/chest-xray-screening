from __future__ import annotations

import csv
import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import torch
from PIL import Image, ImageOps
from torch import Tensor
from torch.utils.data import Dataset
from torchvision.transforms import v2

from model_runtime.classes import CHEST_XRAY_CLASSES


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
CLASS_NAMES = tuple(item.class_name_en for item in CHEST_XRAY_CLASSES)


def normalize_column(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


SUBJECT_KEYS = {"subjectid", "patientid", "subject"}
STUDY_KEYS = {"studyid", "study", "examid"}
PATH_KEYS = {"imagepath", "filepath", "path", "filename", "image"}
LONG_LABEL_KEYS = {"predictclass", "classid", "labelid", "label"}


@dataclass(frozen=True)
class StudyRecord:
    subject_id: str
    study_id: str
    image_paths: tuple[Path, ...]
    targets: tuple[float, ...] | None = None
    target_mask: tuple[float, ...] | None = None


def read_csv_rows(csv_path: Path) -> tuple[list[dict[str, str]], dict[str, str]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError(f"CSV has no header: {csv_path}")
        column_map = {normalize_column(name): name for name in reader.fieldnames}
        rows = [{key: (value or "").strip() for key, value in row.items()} for row in reader]
    if not rows:
        raise ValueError(f"CSV has no data rows: {csv_path}")
    return rows, column_map


def find_column(column_map: dict[str, str], candidates: set[str], required: bool = True) -> str | None:
    for key in candidates:
        if key in column_map:
            return column_map[key]
    if required:
        raise ValueError(f"Missing required column; accepted normalized names: {sorted(candidates)}")
    return None


def class_column(column_map: dict[str, str], class_id: int, class_name: str) -> str | None:
    candidates = {
        str(class_id), f"class{class_id}", f"label{class_id}", f"target{class_id}",
        normalize_column(class_name),
    }
    for candidate in candidates:
        if candidate in column_map:
            return column_map[candidate]
    return None


def parse_label_value(raw: str, uncertain_policy: str) -> tuple[float, float]:
    text = raw.strip().lower()
    if text in {"", "none", "nan", "na", "null"}:
        return 0.0, 1.0
    value = float(text)
    if value == -1:
        if uncertain_policy == "ignore":
            return 0.0, 0.0
        return (1.0 if uncertain_policy == "one" else 0.0), 1.0
    return (1.0 if value > 0 else 0.0), 1.0


def scan_image_index(image_root: Path) -> tuple[dict[str, list[Path]], dict[tuple[str, str], list[Path]]]:
    if not image_root.is_dir():
        raise FileNotFoundError(f"Image directory does not exist: {image_root}")
    by_study: dict[str, list[Path]] = {}
    by_subject_study: dict[tuple[str, str], list[Path]] = {}
    for path in sorted(image_root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        relative = path.relative_to(image_root)
        parts = relative.parts
        if len(parts) >= 3:
            subject_id, study_id = parts[-3], parts[-2]
        elif len(parts) == 2:
            subject_id, study_id = "", parts[-2]
        else:
            subject_id, study_id = "", path.stem
        by_study.setdefault(study_id, []).append(path)
        by_subject_study.setdefault((subject_id, study_id), []).append(path)
    return by_study, by_subject_study


def resolve_row_image(raw_path: str, image_root: Path) -> Path:
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = image_root / candidate
    return candidate.resolve()


def load_labeled_studies(
    csv_path: Path,
    image_root: Path,
    uncertain_policy: str = "zero",
) -> list[StudyRecord]:
    if uncertain_policy not in {"zero", "one", "ignore"}:
        raise ValueError("uncertain_policy must be zero, one, or ignore")
    rows, columns = read_csv_rows(csv_path)
    subject_column = find_column(columns, SUBJECT_KEYS)
    study_column = find_column(columns, STUDY_KEYS)
    path_column = find_column(columns, PATH_KEYS, required=False)
    long_label_column = find_column(columns, LONG_LABEL_KEYS, required=False)
    wide_columns = [class_column(columns, item.class_id, item.class_name_en) for item in CHEST_XRAY_CLASSES]
    if long_label_column is None and any(column is None for column in wide_columns):
        raise ValueError(
            "Cannot find labels. Use long format with Predict_class, or one wide column per configured disease class."
        )

    image_index, subject_image_index = scan_image_index(image_root) if path_column is None else ({}, {})
    grouped: dict[tuple[str, str], list[dict[str, str]]] = {}
    for row in rows:
        key = (row[subject_column], row[study_column])
        grouped.setdefault(key, []).append(row)

    records: list[StudyRecord] = []
    missing_images: list[str] = []
    for (subject_id, study_id), study_rows in grouped.items():
        if path_column:
            images = sorted({resolve_row_image(row[path_column], image_root) for row in study_rows if row[path_column]})
        else:
            images = subject_image_index.get((subject_id, study_id)) or image_index.get(study_id, [])
        images = [path for path in images if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES]
        if not images:
            missing_images.append(study_id)
            continue

        class_count = len(CHEST_XRAY_CLASSES)
        targets = [0.0] * class_count
        mask = [1.0] * class_count
        if long_label_column:
            for row in study_rows:
                raw = row[long_label_column]
                for token in re.findall(r"\d+", raw):
                    class_id = int(token)
                    if 1 <= class_id <= class_count:
                        targets[class_id - 1] = 1.0
        else:
            for index, column in enumerate(wide_columns):
                assert column is not None
                targets[index], mask[index] = parse_label_value(study_rows[0][column], uncertain_policy)
        records.append(StudyRecord(subject_id, study_id, tuple(images), tuple(targets), tuple(mask)))

    if missing_images:
        preview = ", ".join(missing_images[:10])
        raise FileNotFoundError(f"{len(missing_images)} labeled studies have no matching image; examples: {preview}")
    if not records:
        raise ValueError("No usable studies were found")
    return sorted(records, key=lambda item: (item.subject_id, item.study_id))


def load_unlabeled_studies(image_root: Path, metadata_csv: Path | None = None) -> list[StudyRecord]:
    if metadata_csv is None:
        by_study, by_subject_study = scan_image_index(image_root)
        records = [StudyRecord(subject, study, tuple(sorted(paths))) for (subject, study), paths in by_subject_study.items()]
        if not records:
            records = [StudyRecord("", study, tuple(sorted(paths))) for study, paths in by_study.items()]
        return sorted(records, key=lambda item: (item.subject_id, item.study_id))

    rows, columns = read_csv_rows(metadata_csv)
    subject_column = find_column(columns, SUBJECT_KEYS)
    study_column = find_column(columns, STUDY_KEYS)
    path_column = find_column(columns, PATH_KEYS, required=False)
    image_index, subject_image_index = scan_image_index(image_root) if path_column is None else ({}, {})
    grouped: dict[tuple[str, str], list[Path]] = {}
    for row in rows:
        key = (row[subject_column], row[study_column])
        if path_column and row[path_column]:
            grouped.setdefault(key, []).append(resolve_row_image(row[path_column], image_root))
        else:
            grouped[key] = subject_image_index.get(key) or image_index.get(key[1], [])
    records = [StudyRecord(subject, study, tuple(sorted(set(paths)))) for (subject, study), paths in grouped.items() if paths]
    if len(records) != len(grouped):
        raise FileNotFoundError("Some test studies in metadata have no matching images")
    return sorted(records, key=lambda item: (item.subject_id, item.study_id))


class SquareResizePad:
    def __init__(self, size: int, fill: int = 0):
        self.size = size
        self.fill = fill

    def __call__(self, image: Image.Image) -> Image.Image:
        image = ImageOps.contain(image, (self.size, self.size), Image.Resampling.BILINEAR)
        width, height = image.size
        padding = ((self.size - width) // 2, (self.size - height) // 2,
                   self.size - width - (self.size - width) // 2,
                   self.size - height - (self.size - height) // 2)
        return ImageOps.expand(image, border=padding, fill=self.fill)


def build_transform(size: int, train: bool, mean: Sequence[float], std: Sequence[float]):
    operations: list = [SquareResizePad(size)]
    if train:
        operations.extend([
            v2.RandomAffine(degrees=5, translate=(0.03, 0.03), scale=(0.95, 1.05), fill=0),
            v2.RandomApply([v2.ColorJitter(brightness=0.10, contrast=0.15)], p=0.5),
        ])
    operations.extend([v2.ToImage(), v2.ToDtype(torch.float32, scale=True), v2.Normalize(mean=list(mean), std=list(std))])
    return v2.Compose(operations)


def open_chest_image(path: Path) -> Image.Image:
    with Image.open(path) as source:
        return ImageOps.exif_transpose(source).convert("L").convert("RGB")


class StudyDataset(Dataset):
    def __init__(self, records: Sequence[StudyRecord], transform, max_views: int = 2, train: bool = False):
        self.records = tuple(records)
        self.transform = transform
        self.max_views = max(1, max_views)
        self.train = train

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict:
        record = self.records[index]
        paths = list(record.image_paths)
        if len(paths) > self.max_views:
            paths = random.sample(paths, self.max_views) if self.train else paths[:self.max_views]
        images = torch.stack([self.transform(open_chest_image(path)) for path in paths])
        item = {"images": images, "subject_id": record.subject_id, "study_id": record.study_id}
        if record.targets is not None:
            item["targets"] = torch.tensor(record.targets, dtype=torch.float32)
            item["target_mask"] = torch.tensor(record.target_mask, dtype=torch.float32)
        return item


def collate_studies(items: Sequence[dict]) -> dict:
    max_views = max(item["images"].shape[0] for item in items)
    batch_size = len(items)
    _, channels, height, width = items[0]["images"].shape
    images = torch.zeros((batch_size, max_views, channels, height, width), dtype=items[0]["images"].dtype)
    view_mask = torch.zeros((batch_size, max_views), dtype=torch.bool)
    for index, item in enumerate(items):
        count = item["images"].shape[0]
        images[index, :count] = item["images"]
        view_mask[index, :count] = True
    batch = {
        "images": images,
        "view_mask": view_mask,
        "subject_id": [item["subject_id"] for item in items],
        "study_id": [item["study_id"] for item in items],
    }
    if "targets" in items[0]:
        batch["targets"] = torch.stack([item["targets"] for item in items])
        batch["target_mask"] = torch.stack([item["target_mask"] for item in items])
    return batch


def class_counts(records: Iterable[StudyRecord]) -> tuple[Tensor, Tensor]:
    targets = torch.tensor([record.targets for record in records], dtype=torch.float32)
    masks = torch.tensor([record.target_mask for record in records], dtype=torch.float32)
    positives = (targets * masks).sum(dim=0)
    observed = masks.sum(dim=0)
    return positives, observed
