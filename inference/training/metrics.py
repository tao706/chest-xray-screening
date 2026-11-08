from __future__ import annotations
"""
计算 AUC、F1 和各类别阈值。
"""
import numpy as np
from sklearn.metrics import f1_score, roc_auc_score


def select_f1_thresholds(targets: np.ndarray, probabilities: np.ndarray, mask: np.ndarray) -> np.ndarray:
    thresholds = np.full(targets.shape[1], 0.5, dtype=np.float32)
    candidates = np.linspace(0.05, 0.95, 91)
    for class_index in range(targets.shape[1]):
        observed = mask[:, class_index].astype(bool)
        truth = targets[observed, class_index]
        scores = probabilities[observed, class_index]
        if len(np.unique(truth)) < 2:
            continue
        values = [f1_score(truth, scores >= threshold, zero_division=0) for threshold in candidates]
        thresholds[class_index] = float(candidates[int(np.argmax(values))])
    return thresholds


def multilabel_metrics(
    targets: np.ndarray,
    probabilities: np.ndarray,
    mask: np.ndarray,
    thresholds: np.ndarray | None = None,
) -> dict:
    if thresholds is None:
        thresholds = np.full(targets.shape[1], 0.5, dtype=np.float32)
    aucs: list[float] = []
    f1s: list[float] = []
    for class_index in range(targets.shape[1]):
        observed = mask[:, class_index].astype(bool)
        truth = targets[observed, class_index]
        scores = probabilities[observed, class_index]
        aucs.append(float(roc_auc_score(truth, scores)) if len(np.unique(truth)) >= 2 else float("nan"))
        f1s.append(float(f1_score(truth, scores >= thresholds[class_index], zero_division=0)))
    return {
        "macro_auc": float(np.nanmean(aucs)),
        "macro_f1": float(np.mean(f1s)),
        "auc_per_class": aucs,
        "f1_per_class": f1s,
        "thresholds": thresholds.tolist(),
    }
