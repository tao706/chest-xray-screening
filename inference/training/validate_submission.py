from __future__ import annotations

import argparse
import csv
import json
import math
from collections import defaultdict
from pathlib import Path

from model_runtime.classes import CHEST_XRAY_CLASSES


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the multi-label probability export invariants.")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--expected-studies", type=int, required=True)
    args = parser.parse_args()
    errors: list[str] = []
    rows_by_study: dict[str, list[tuple[int, float]]] = defaultdict(list)
    with args.csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = set(reader.fieldnames or [])
        required = {"Study_id", "Predict_class", "Probability"}
        if not required.issubset(fields):
            errors.append(f"Missing columns: {sorted(required.difference(fields))}")
        for line_number, row in enumerate(reader, start=2):
            try:
                study_id = (row.get("Study_id") or "").strip()
                class_id = int(row.get("Predict_class") or "")
                probability = float(row.get("Probability") or "")
                if not study_id or class_id not in range(1, len(CHEST_XRAY_CLASSES) + 1) or not math.isfinite(probability) or not 0 <= probability <= 1:
                    raise ValueError
                rows_by_study[study_id].append((class_id, probability))
            except (TypeError, ValueError):
                errors.append(f"Invalid row {line_number}")
                if len(errors) >= 50:
                    break
    for study_id, values in rows_by_study.items():
        class_ids = [item[0] for item in values]
        if sorted(class_ids) != list(range(1, len(CHEST_XRAY_CLASSES) + 1)):
            errors.append(f"Study {study_id} does not contain every configured class exactly once")
            if len(errors) >= 50:
                break
    if len(rows_by_study) != args.expected_studies:
        errors.append(f"Study count is {len(rows_by_study)}, expected {args.expected_studies}")
    expected_rows = args.expected_studies * len(CHEST_XRAY_CLASSES)
    actual_rows = sum(len(values) for values in rows_by_study.values())
    if actual_rows != expected_rows:
        errors.append(f"Row count is {actual_rows}, expected {expected_rows}")
    report = {
        "valid": not errors,
        "study_count": len(rows_by_study),
        "row_count": actual_rows,
        "expected_studies": args.expected_studies,
        "expected_rows": expected_rows,
        "errors": errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
