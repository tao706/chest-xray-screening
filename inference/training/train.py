   
                                
                      
   
from __future__ import annotations

import argparse
import json
import math
import random
import time
from contextlib import nullcontext
from pathlib import Path

import numpy as np
import torch
from torch import Tensor, nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader
from tqdm import tqdm

from model_runtime.classes import CHEST_XRAY_CLASSES
from model_runtime.model_definition import SUPPORTED_ARCHITECTURES, StudyClassifier
from training.data import StudyDataset, build_transform, class_counts, collate_studies, load_labeled_studies
from training.metrics import multilabel_metrics, select_f1_thresholds


DEFAULT_MEAN = (0.485, 0.456, 0.406)
DEFAULT_STD = (0.229, 0.224, 0.225)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a NIH ChestX-ray14 multi-label classifier.")
    parser.add_argument("--train-csv", type=Path, required=True)
    parser.add_argument("--train-images", type=Path, required=True)
    parser.add_argument("--val-csv", type=Path, required=True)
    parser.add_argument("--val-images", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("weights/chest_model.pt"))
    parser.add_argument("--architecture", choices=SUPPORTED_ARCHITECTURES, default="efficientnet_b0")
    parser.add_argument("--aggregation", choices=("max", "mean"), default="max")
    parser.add_argument("--input-size", type=int, default=224)
    parser.add_argument("--max-views", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--max-pos-weight", type=float, default=20.0)
    parser.add_argument("--uncertain-policy", choices=("zero", "one", "ignore"), default="zero")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--patience", type=int, default=7)
    parser.add_argument("--model-version", default="nih14-efficientnet-b0-v1")
    parser.add_argument("--pretrained", action=argparse.BooleanOptionalAction, default=True,
                        help="Initialize from ImageNet weights (downloaded inside inference/.cache).")
    parser.add_argument("--freeze-backbone-epochs", type=int, default=1,
                        help="Train only the classifier head for this many initial epochs.")
    parser.add_argument("--allow-subject-overlap", action="store_true",
                        help="Allow organizer-provided train/val splits to share Subject_id values.")
    return parser.parse_args()


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def choose_device(requested: str) -> torch.device:
    if requested == "auto":
        return torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    device = torch.device(requested)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is unavailable")
    return device


def masked_bce(logits: Tensor, targets: Tensor, mask: Tensor, pos_weight: Tensor) -> Tensor:
    loss = nn.functional.binary_cross_entropy_with_logits(logits, targets, reduction="none", pos_weight=pos_weight)
    return (loss * mask).sum() / mask.sum().clamp_min(1.0)


def autocast_context(device: torch.device):
    return torch.autocast(device_type="cuda", dtype=torch.float16) if device.type == "cuda" else nullcontext()


def set_backbone_trainable(model: StudyClassifier, trainable: bool) -> None:
    for parameter in model.backbone.parameters():
        parameter.requires_grad = trainable
    if model.architecture == "densenet121":
        head = model.backbone.classifier
    elif model.architecture == "efficientnet_b0":
        head = model.backbone.classifier
    else:
        head = model.backbone.fc
    for parameter in head.parameters():
        parameter.requires_grad = True


def train_epoch(model, loader, optimizer, scaler, device, pos_weight) -> float:
    model.train()
    running_loss = 0.0
    sample_count = 0
    for batch in tqdm(loader, desc="train", leave=False):
        images = batch["images"].to(device, non_blocking=True)
        view_mask = batch["view_mask"].to(device, non_blocking=True)
        targets = batch["targets"].to(device, non_blocking=True)
        target_mask = batch["target_mask"].to(device, non_blocking=True)
        optimizer.zero_grad(set_to_none=True)
        with autocast_context(device):
            logits = model(images, view_mask)
            loss = masked_bce(logits, targets, target_mask, pos_weight)
        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
        scaler.step(optimizer)
        scaler.update()
        running_loss += float(loss.detach()) * images.shape[0]
        sample_count += images.shape[0]
    return running_loss / max(1, sample_count)


@torch.inference_mode()
def validate(model, loader, device, pos_weight) -> tuple[float, np.ndarray, np.ndarray, np.ndarray]:
    model.eval()
    running_loss = 0.0
    sample_count = 0
    probabilities: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    masks: list[np.ndarray] = []
    for batch in tqdm(loader, desc="validate", leave=False):
        images = batch["images"].to(device, non_blocking=True)
        view_mask = batch["view_mask"].to(device, non_blocking=True)
        target = batch["targets"].to(device, non_blocking=True)
        target_mask = batch["target_mask"].to(device, non_blocking=True)
        with autocast_context(device):
            logits = model(images, view_mask)
            loss = masked_bce(logits, target, target_mask, pos_weight)
        running_loss += float(loss) * images.shape[0]
        sample_count += images.shape[0]
        probabilities.append(torch.sigmoid(logits).float().cpu().numpy())
        targets.append(target.cpu().numpy())
        masks.append(target_mask.cpu().numpy())
    return (
        running_loss / max(1, sample_count),
        np.concatenate(targets),
        np.concatenate(probabilities),
        np.concatenate(masks),
    )


def main() -> int:
    args = arguments()
    if args.input_size < 224 or args.input_size > 1024:
        raise ValueError("input-size must be between 224 and 1024")
    seed_everything(args.seed)
    device = choose_device(args.device)
    train_records = load_labeled_studies(args.train_csv.resolve(), args.train_images.resolve(), args.uncertain_policy)
    val_records = load_labeled_studies(args.val_csv.resolve(), args.val_images.resolve(), args.uncertain_policy)
    overlap = {item.subject_id for item in train_records}.intersection(item.subject_id for item in val_records)
    if overlap and not args.allow_subject_overlap:
        raise ValueError(f"Patient leakage: {len(overlap)} Subject_id values occur in both train and validation")
    if overlap:
        print(f"WARNING: organizer splits share {len(overlap)} Subject_id values; validation may be optimistic")

    positives, observed = class_counts(train_records)
    negatives = observed - positives
    if torch.any(positives == 0):
        missing = [str(index + 1) for index, value in enumerate(positives) if value == 0]
        raise ValueError(f"Training split has no positive example for classes: {', '.join(missing)}")
    pos_weight = (negatives / positives.clamp_min(1.0)).clamp(min=1.0, max=args.max_pos_weight).to(device)

    train_dataset = StudyDataset(
        train_records, build_transform(args.input_size, True, DEFAULT_MEAN, DEFAULT_STD), args.max_views, train=True
    )
    val_dataset = StudyDataset(
        val_records, build_transform(args.input_size, False, DEFAULT_MEAN, DEFAULT_STD), args.max_views, train=False
    )
    loader_options = dict(batch_size=args.batch_size, num_workers=args.workers, pin_memory=device.type == "cuda",
                          collate_fn=collate_studies, persistent_workers=args.workers > 0)
    train_loader = DataLoader(train_dataset, shuffle=True, drop_last=False, **loader_options)
    val_loader = DataLoader(val_dataset, shuffle=False, drop_last=False, **loader_options)

    if args.pretrained:
        torch.hub.set_dir(str((Path(__file__).resolve().parents[1] / ".cache" / "torch").resolve()))
    model = StudyClassifier(
        args.architecture, len(CHEST_XRAY_CLASSES), args.aggregation, pretrained=args.pretrained
    ).to(device)
    set_backbone_trainable(model, args.freeze_backbone_epochs <= 0)
    optimizer = AdamW(model.parameters(), lr=args.learning_rate, weight_decay=args.weight_decay)
    scheduler = CosineAnnealingLR(optimizer, T_max=max(1, args.epochs), eta_min=args.learning_rate * 0.02)
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    history_path = args.output.with_suffix(".history.json")
    history: list[dict] = []
    best_auc = -math.inf
    stale_epochs = 0
    started = time.time()

    print(json.dumps({
        "device": str(device), "train_studies": len(train_records), "val_studies": len(val_records),
        "architecture": args.architecture, "input_size": args.input_size, "positive_counts": positives.tolist(),
        "pos_weight": pos_weight.detach().cpu().tolist(), "imagenet_pretraining": args.pretrained,
    }, ensure_ascii=False, indent=2))

    for epoch in range(1, args.epochs + 1):
        if epoch == args.freeze_backbone_epochs + 1 and args.freeze_backbone_epochs > 0:
            set_backbone_trainable(model, True)
            print("Unfroze the image backbone for fine-tuning")
        train_loss = train_epoch(model, train_loader, optimizer, scaler, device, pos_weight)
        val_loss, targets, probabilities, target_mask = validate(model, val_loader, device, pos_weight)
        thresholds = select_f1_thresholds(targets, probabilities, target_mask)
        metrics = multilabel_metrics(targets, probabilities, target_mask, thresholds)
        epoch_result = {
            "epoch": epoch, "train_loss": train_loss, "val_loss": val_loss,
            "learning_rate": optimizer.param_groups[0]["lr"], **metrics,
        }
        history.append(epoch_result)
        history_path.write_text(json.dumps(history, ensure_ascii=False, indent=2, allow_nan=True), encoding="utf-8")
        print(json.dumps(epoch_result, ensure_ascii=False, allow_nan=True))

        if metrics["macro_auc"] > best_auc:
            best_auc = metrics["macro_auc"]
            stale_epochs = 0
            checkpoint = {
                "format_version": 2,
                "dataset": "NIH ChestX-ray14 (local 4,999-image subset)",
                "architecture": args.architecture,
                "aggregation": args.aggregation,
                "input_size": args.input_size,
                "mean": list(DEFAULT_MEAN),
                "std": list(DEFAULT_STD),
                "class_ids": [item.class_id for item in CHEST_XRAY_CLASSES],
                "class_names": [item.class_name_en for item in CHEST_XRAY_CLASSES],
                "thresholds": thresholds.tolist(),
                "model_version": args.model_version,
                "state_dict": {key: value.detach().cpu() for key, value in model.state_dict().items()},
                "metrics": metrics,
                "epoch": epoch,
                "training_seconds": time.time() - started,
                "imagenet_pretraining": args.pretrained,
            }
            torch.save(checkpoint, args.output)
        else:
            stale_epochs += 1
        scheduler.step()
        if stale_epochs >= args.patience:
            print(f"Early stopping after {epoch} epochs; best Macro-AUC={best_auc:.6f}")
            break

    size_mb = args.output.stat().st_size / 1024 / 1024
    print(f"Saved best checkpoint to {args.output.resolve()} ({size_mb:.1f}MB, Macro-AUC={best_auc:.6f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
