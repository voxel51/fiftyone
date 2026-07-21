"""
TIDE-style detection error analysis.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import Counter, defaultdict

import numpy as np

import fiftyone.core.context as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.utils.iou as foui

from .coco import (
    COCOEvaluation,
    COCOEvaluationConfig,
    COCODetectionResults,
    _coco_evaluation_single_iou,
    _copy_labels,
    _compute_pr_curves,
)
from .detection import DetectionResults

_MAIN_ERRORS = ("cls", "loc", "both", "dupe", "bkg", "miss")
_SPECIAL_ERRORS = ("false_pos", "false_neg")


class TIDEEvaluationConfig(COCOEvaluationConfig):
    """TIDE-style detection evaluation config.

    This backend classifies false positives and false negatives into
    classification, localization, both, duplicate, background, and missed
    errors. It requires classwise matching.

    Args:
        bg_thresh (0.1): the IoU threshold below which a detection is treated
            as background
        max_preds (100): the maximum number of predictions per image to
            evaluate
    """

    def __init__(
        self, pred_field, gt_field, bg_thresh=0.1, max_preds=100, **kwargs
    ):
        super().__init__(pred_field, gt_field, max_preds=max_preds, **kwargs)
        self.bg_thresh = bg_thresh

    @property
    def method(self):
        return "tide"


class TIDEEvaluation(COCOEvaluation):
    """TIDE-style detection evaluation."""

    def __init__(self, config):
        super().__init__(config)

        if not config.classwise:
            raise ValueError("TIDE evaluation requires classwise=True")

        if not 0 <= config.bg_thresh <= config.iou:
            raise ValueError("`bg_thresh` must be in [0, iou]")

        self._records = []
        self._errors = []
        self._gt_counts = Counter()
        self._missed = Counter()
        self._false_negatives = Counter()
        self._error_counts = Counter()

    def register_samples(self, samples, eval_key, dynamic=True):
        super().register_samples(samples, eval_key, dynamic=dynamic)

        if eval_key is None or not dynamic:
            return

        error_key = "%s_error" % eval_key
        processing_frames = samples._is_frame_field(self.config.pred_field)
        dataset = samples._dataset

        for field in (self.config.gt_field, self.config.pred_field):
            _, prefix = samples._get_label_field_path(field)
            prefix, _ = samples._handle_frame_field(prefix)
            path = "%s.%s" % (prefix, error_key)
            if processing_frames:
                dataset.add_frame_field(path, fof.StringField)
            else:
                dataset.add_sample_field(path, fof.StringField)

    def evaluate(self, sample_or_frame, eval_key=None):
        if eval_key is None:
            eval_key = "eval"
            gts = _copy_labels(sample_or_frame[self.gt_field])
            preds = _copy_labels(sample_or_frame[self.pred_field])
        else:
            gts = sample_or_frame[self.gt_field]
            preds = sample_or_frame[self.pred_field]

        pred_ids = _get_tide_pred_ids(preds, self.config.max_preds)
        matches = _coco_evaluation_single_iou(
            gts,
            preds,
            eval_key,
            self.config,
            max_preds=self.config.max_preds,
            per_class_max_preds=False,
        )
        self._analyze_errors(gts, preds, eval_key, pred_ids)

        return matches

    def generate_results(
        self,
        samples,
        matches,
        eval_key=None,
        classes=None,
        missing=None,
        progress=None,
    ):
        tide_ap, error_deltas, special_error_deltas = _compute_dap(
            self._records,
            self._errors,
            self._gt_counts,
            self._missed,
            self._false_negatives,
        )

        kwargs = {}
        if self.config.compute_mAP:
            (
                precision,
                recall,
                thresholds,
                iou_threshs,
                classes,
                recall_sweep,
            ) = _compute_pr_curves(
                samples, self.config, classes=classes, progress=progress
            )
            kwargs.update(
                precision=precision,
                recall=recall,
                iou_threshs=iou_threshs,
                recall_sweep=recall_sweep,
                thresholds=thresholds,
            )

        return TIDEDetectionResults(
            samples,
            self.config,
            eval_key,
            matches,
            classes=classes,
            missing=missing,
            error_counts={
                error: self._error_counts[error] for error in _MAIN_ERRORS
            },
            tide_ap=tide_ap,
            error_deltas=error_deltas,
            special_error_deltas=special_error_deltas,
            backend=self,
            **kwargs,
        )

    def get_fields(self, samples, eval_key, include_custom_metrics=True):
        fields = super().get_fields(
            samples, eval_key, include_custom_metrics=include_custom_metrics
        )
        error_key = "%s_error" % eval_key

        for field in (self.config.gt_field, self.config.pred_field):
            label_type = samples._get_label_field_type(field)
            fields.append(
                "%s.%s.%s" % (field, label_type._LABEL_LIST_FIELD, error_key)
            )

        return fields

    def cleanup(self, samples, eval_key):
        super().cleanup(samples, eval_key)

        dataset = samples._dataset
        error_key = "%s_error" % eval_key
        fields = []
        for original_field in (self.config.gt_field, self.config.pred_field):
            try:
                field, _ = dataset._handle_frame_field(original_field)
                label_type = dataset._get_label_field_type(original_field)
                fields.append(
                    "%s.%s.%s"
                    % (field, label_type._LABEL_LIST_FIELD, error_key)
                )
            except ValueError:
                pass

        if dataset._is_frame_field(self.config.pred_field):
            dataset.delete_frame_fields(fields, error_level=1)
        else:
            dataset.delete_sample_fields(fields, error_level=1)

    def _analyze_errors(self, gts, preds, eval_key, pred_ids):
        gt_list = _get_labels(gts)
        all_preds = _get_labels(preds)
        pred_list = sorted(
            (pred for pred in all_preds if pred.id in pred_ids),
            key=_get_confidence,
            reverse=True,
        )
        error_key = "%s_error" % eval_key
        id_key = "%s_id" % eval_key

        for obj in gt_list + all_preds:
            obj[error_key] = None

        for pred in all_preds:
            if pred.id not in pred_ids:
                pred[eval_key] = None

        def iscrowd(obj):
            return bool(obj.get_attribute_value(self.config.iscrowd, False))

        crowd_ids = {gt.id for gt in gt_list if iscrowd(gt)}
        active_gts = [gt for gt in gt_list if gt.id not in crowd_ids]
        used_ids = {gt.id for gt in active_gts if gt[eval_key] == "tp"}
        unused_ids = {gt.id for gt in active_gts if gt.id not in used_ids}

        for gt in active_gts:
            self._gt_counts[gt.label] += 1
            if gt.id in unused_ids:
                self._false_negatives[gt.label] += 1

        ignored_ids = _get_ignored_pred_ids(
            pred_list, active_gts, gt_list, self.config, iscrowd, id_key
        )

        fp_preds = [
            pred
            for pred in pred_list
            if pred[eval_key] != "tp" or pred[id_key] in crowd_ids
        ]
        fp_preds.sort(key=_get_confidence, reverse=True)

        ious = _compute_ious(fp_preds, active_gts, self.config, iscrowd)
        error_info = {}
        usable_ids = set()
        best_matches = {}

        for pred_idx, pred in enumerate(fp_preds):
            row = ious[pred_idx]
            error, target = _classify_error(
                pred,
                active_gts,
                row,
                used_ids,
                self.config.iou,
                self.config.bg_thresh,
            )

            info = {"error": error, "target": target, "fixable": False}
            error_info[pred.id] = info
            pred[error_key] = error
            self._error_counts[error] += 1

            if target is not None and target.id in unused_ids:
                usable_ids.add(target.id)
                confidence = _get_confidence(pred)
                previous = best_matches.get(target.id, None)
                if previous is None or confidence > previous[0]:
                    best_matches[target.id] = (confidence, pred.id)

        for _, pred_id in best_matches.values():
            error_info[pred_id]["fixable"] = True

        for pred in fp_preds:
            info = error_info[pred.id]
            self._errors.append(
                {
                    "id": pred.id,
                    "label": pred.label,
                    "score": _get_confidence(pred),
                    "error": info["error"],
                    "target_label": (
                        info["target"].label if info["target"] else None
                    ),
                    "fixable": info["fixable"],
                    "original": pred.id not in ignored_ids,
                }
            )

        for gt in active_gts:
            if gt.id in unused_ids and gt.id not in usable_ids:
                gt[error_key] = "miss"
                self._error_counts["miss"] += 1
                self._missed[gt.label] += 1

        for pred in pred_list:
            if pred.id in ignored_ids:
                continue

            self._records.append(
                {
                    "id": pred.id,
                    "label": pred.label,
                    "score": _get_confidence(pred),
                    "tp": pred[eval_key] == "tp"
                    and pred[id_key] not in crowd_ids,
                }
            )


class TIDEDetectionResults(COCODetectionResults):
    """Class that stores the results of a TIDE detection evaluation.

    The :attr:`error_counts` attribute stores the number of each TIDE error
    type. :attr:`error_deltas` and :attr:`special_error_deltas` contain dAP
    values in ``[0, 100]``.
    """

    def __init__(
        self,
        samples,
        config,
        eval_key,
        matches,
        classes=None,
        missing=None,
        custom_metrics=None,
        backend=None,
        precision=None,
        recall=None,
        iou_threshs=None,
        recall_sweep=None,
        thresholds=None,
        error_counts=None,
        tide_ap=0,
        error_deltas=None,
        special_error_deltas=None,
    ):
        if precision is None:
            DetectionResults.__init__(
                self,
                samples,
                config,
                eval_key,
                matches,
                classes=classes,
                missing=missing,
                custom_metrics=custom_metrics,
                backend=backend,
            )
            self.precision = None
            self.recall = None
            self.iou_threshs = None
            self.recall_sweep = None
            self.thresholds = None
            self._classwise_AP = None
            self._classwise_AR = None
        else:
            super().__init__(
                samples,
                config,
                eval_key,
                matches,
                precision,
                recall,
                iou_threshs,
                classes,
                recall_sweep=recall_sweep,
                thresholds=thresholds,
                missing=missing,
                custom_metrics=custom_metrics,
                backend=backend,
            )

        self.error_counts = error_counts or {}
        self.tide_ap = tide_ap
        self.error_deltas = error_deltas or {}
        self.special_error_deltas = special_error_deltas or {}

    @property
    def dAP(self):
        """The main TIDE dAP values in ``[0, 100]``."""
        return self.error_deltas

    @property
    def special_dAP(self):
        """The special TIDE dAP values in ``[0, 100]``."""
        return self.special_error_deltas

    def metrics(self, classes=None, average="micro", beta=1.0):
        """Computes standard detection metrics and TIDE AP/dAP metrics.

        TIDE AP/dAP values are reported in ``[0, 100]``.
        """
        metrics = super().metrics(
            classes=classes, average=average, beta=beta
        )
        metrics["tide_ap"] = self.tide_ap
        metrics.update(
            ("error_count_%s" % error, count)
            for error, count in self.error_counts.items()
        )
        metrics.update(
            ("dAP_%s" % error, value)
            for error, value in self.dAP.items()
        )
        metrics.update(
            ("dAP_%s" % error, value)
            for error, value in self.special_dAP.items()
        )
        return metrics

    def plot_error_counts(self, backend="plotly", **kwargs):
        """Plots the number of detections in each TIDE error category.

        Args:
            backend ("plotly"): the plotting backend to use. Supported values
                are ``("plotly", "matplotlib")``
            **kwargs: optional plotting backend arguments. Pass
                ``plot="pie"`` to render a pie chart instead of a bar chart

        Returns:
            a plotly or matplotlib figure
        """
        errors = list(_MAIN_ERRORS)
        counts = [self.error_counts.get(error, 0) for error in errors]
        plot = kwargs.pop("plot", "bar")
        title = kwargs.pop("title", "TIDE error counts")

        if plot not in ("bar", "pie"):
            raise ValueError(
                "Unsupported plot type '%s'; supported values are %s"
                % (plot, ("bar", "pie"))
            )

        if plot == "pie" and not any(counts):
            raise ValueError("Cannot plot a pie chart with no errors")

        if backend == "matplotlib":
            import matplotlib.pyplot as plt

            ax = kwargs.pop("ax", None)
            figsize = kwargs.pop("figsize", None)
            close_figure = ax is None and foc.is_jupyter_context()
            if ax is None:
                figure, ax = plt.subplots(figsize=figsize)
            else:
                figure = ax.figure

            if plot == "pie":
                ax.pie(counts, labels=errors, **kwargs)
                ax.set_title(title)
            else:
                ax.bar(errors, counts, **kwargs)
                ax.set(xlabel="Error type", ylabel="Count", title=title)

            if close_figure:
                plt.close(figure)

            return figure

        if backend == "plotly":
            import plotly.graph_objects as go

            if plot == "pie":
                trace = go.Pie(labels=errors, values=counts, **kwargs)
            else:
                trace = go.Bar(x=errors, y=counts, **kwargs)

            figure = go.Figure(trace)
            layout = dict(
                template="ggplot2",
                margin={"r": 0, "t": 30, "l": 0, "b": 0},
                title=title,
            )
            if plot == "bar":
                layout.update(
                    xaxis_title="Error type",
                    yaxis_title="Count",
                )

            figure.update_layout(**layout)
            return figure

        raise ValueError(
            "Unsupported plotting backend '%s'; supported values are %s"
            % (backend, ("matplotlib", "plotly"))
        )

    def mAP(self, classes=None):
        if self.precision is None:
            raise ValueError("Set `compute_mAP=True` to compute COCO mAP")

        return super().mAP(classes=classes)

    def mAR(self, classes=None):
        if self.precision is None:
            raise ValueError("Set `compute_mAP=True` to compute COCO mAR")

        return super().mAR(classes=classes)

    def plot_pr_curves(
        self, classes=None, iou_thresh=None, backend="plotly", **kwargs
    ):
        if self.precision is None:
            raise ValueError("Set `compute_mAP=True` to plot PR curves")

        close_figure = (
            backend == "matplotlib"
            and kwargs.get("ax", None) is None
            and foc.is_jupyter_context()
        )
        figure = super().plot_pr_curves(
            classes=classes,
            iou_thresh=iou_thresh,
            backend=backend,
            **kwargs,
        )

        if backend in (None, "plotly") and foc.is_jupyter_context():
            return figure._figure

        if close_figure:
            import matplotlib.pyplot as plt

            plt.close(figure)

        return figure

    @classmethod
    def _from_dict(cls, d, samples, config, eval_key, **kwargs):
        return DetectionResults._from_dict.__func__(
            cls,
            d,
            samples,
            config,
            eval_key,
            precision=d.get("precision", None),
            recall=d.get("recall", None),
            iou_threshs=d.get("iou_threshs", None),
            recall_sweep=d.get("recall_sweep", None),
            thresholds=d.get("thresholds", None),
            error_counts=d.get("error_counts", None),
            tide_ap=d.get("tide_ap", 0),
            error_deltas=d.get("error_deltas", None),
            special_error_deltas=d.get("special_error_deltas", None),
            **kwargs,
        )


def _get_labels(labels):
    if labels is None:
        return []

    return labels[labels._LABEL_LIST_FIELD]


def _get_confidence(label):
    if isinstance(label, fol.Keypoint):
        return np.nanmean(label.confidence) if label.confidence else None

    return label.confidence


def _get_tide_pred_ids(preds, max_preds):
    pred_list = _get_labels(preds)
    for pred in pred_list:
        if _get_confidence(pred) is None:
            raise ValueError(
                "All predicted objects must have their `confidence` attribute "
                "populated in order to compute TIDE metrics"
            )

    preds = sorted(pred_list, key=_get_confidence, reverse=True)
    if max_preds is not None:
        preds = preds[:max_preds]

    return {pred.id for pred in preds}


def _get_ignored_pred_ids(preds, active_gts, gts, config, iscrowd, id_key):
    crowd_gts = [gt for gt in gts if iscrowd(gt)]
    active_ids = {gt.id for gt in active_gts}
    preds = [pred for pred in preds if pred[id_key] not in active_ids]
    ious = _compute_ious(preds, crowd_gts, config, iscrowd)
    ignored_ids = set()
    for pred, row in zip(preds, ious):
        if any(
            pred.label == gt.label and iou > config.iou
            for gt, iou in zip(crowd_gts, row)
        ):
            ignored_ids.add(pred.id)

    return ignored_ids


def _compute_ious(preds, gts, config, iscrowd):
    kwargs = {
        "iscrowd": iscrowd,
        "error_level": config.error_level,
    }
    if config.use_masks:
        kwargs.update(use_masks=True, tolerance=config.tolerance)
    if config.use_boxes:
        kwargs.update(use_boxes=True)
    if config.keypoint_sigmas is not None:
        kwargs.update(keypoint_sigmas=config.keypoint_sigmas)

    return foui.compute_ious(preds, gts, **kwargs)


def _classify_error(pred, gts, ious, used_ids, pos_thresh, bg_thresh):
    same_inds = [idx for idx, gt in enumerate(gts) if gt.label == pred.label]
    if same_inds:
        same_idx = max(same_inds, key=lambda idx: ious[idx])
        same_iou = ious[same_idx]
        if bg_thresh <= same_iou <= pos_thresh:
            return "loc", gts[same_idx]

    noncls_inds = [idx for idx, gt in enumerate(gts) if gt.label != pred.label]
    if noncls_inds:
        noncls_idx = max(noncls_inds, key=lambda idx: ious[idx])
        if ious[noncls_idx] >= pos_thresh:
            return "cls", gts[noncls_idx]

    used_same_inds = [
        idx
        for idx, gt in enumerate(gts)
        if gt.id in used_ids and gt.label == pred.label
    ]
    if used_same_inds:
        used_same_iou = max(ious[idx] for idx in used_same_inds)
        if used_same_iou >= pos_thresh:
            return "dupe", None

    if not gts or np.max(ious) <= bg_thresh:
        return "bkg", None

    return "both", None


def _compute_dap(records, errors, gt_counts, missed, false_negatives):
    tide_ap = _compute_map(records, gt_counts)
    error_deltas = {}
    for error in _MAIN_ERRORS:
        fixed_records = []
        for error_record in errors:
            record = {
                "id": error_record["id"],
                "label": error_record["label"],
                "score": error_record["score"],
                "tp": False,
            }
            if error_record["error"] != error:
                if error_record["original"]:
                    fixed_records.append(record)
                continue

            if error in ("cls", "loc") and error_record["fixable"]:
                fixed_records.append(
                    {
                        "id": error_record["id"],
                        "label": error_record["target_label"],
                        "score": error_record["score"],
                        "tp": True,
                    }
                )

        fixed_records.extend(record for record in records if record["tp"])

        fixed_gt_counts = gt_counts.copy()
        if error == "miss":
            for label, count in missed.items():
                fixed_gt_counts[label] -= count

        error_deltas[error] = max(
            _compute_map(fixed_records, fixed_gt_counts) - tide_ap, 0
        )

    perfect_precision = [
        dict(record, score=1 if record["tp"] else 0) for record in records
    ]
    perfect_recall_gt_counts = gt_counts.copy()
    for label, count in false_negatives.items():
        perfect_recall_gt_counts[label] -= count

    special_error_deltas = {
        "false_pos": _compute_map(perfect_precision, gt_counts) - tide_ap,
        "false_neg": _compute_map(records, perfect_recall_gt_counts) - tide_ap,
    }

    return tide_ap, error_deltas, special_error_deltas


def _compute_map(records, gt_counts):
    by_label = defaultdict(list)
    for record in records:
        by_label[record["label"]].append(record)

    aps = []
    for label in set(gt_counts) | set(by_label):
        label_records = by_label[label]
        num_gt = gt_counts[label]
        if not label_records and num_gt == 0:
            continue

        aps.append(_compute_ap(label_records, num_gt))

    return float(np.mean(aps)) if aps else 0


def _compute_ap(records, num_gt):
    if num_gt <= 0 or not records:
        return 0

    records = sorted(records, key=lambda record: -record["score"])
    tp = np.array([record["tp"] for record in records], dtype=float)
    tp_sum = np.cumsum(tp)
    precision = tp_sum / np.arange(1, len(tp) + 1)
    recall = tp_sum / num_gt

    for idx in range(len(precision) - 1, 0, -1):
        if precision[idx] > precision[idx - 1]:
            precision[idx - 1] = precision[idx]

    recall_grid = np.linspace(0, 1, 101)
    inds = np.searchsorted(recall, recall_grid, side="left")
    valid = inds < len(precision)
    return float(np.mean(precision[inds[valid]]) * 100)
