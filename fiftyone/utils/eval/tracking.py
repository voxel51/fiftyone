"""
Multi-object tracking evaluation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from copy import deepcopy
import inspect
import math
import numbers

import numpy as np
from tabulate import tabulate

import eta.core.utils as etau
import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.plots as fop
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov

from .base import (
    BaseEvaluationMethod,
    BaseEvaluationMethodConfig,
    BaseEvaluationResults,
)

_DEFAULT_METRICS = ("HOTA", "CLEAR", "Identity")
_METRIC_NAMES = {m.lower(): m for m in _DEFAULT_METRICS}
_METRIC_ORDER = (
    "HOTA",
    "DetA",
    "AssA",
    "IDF1",
    "MOTA",
    "LocA",
    "DetRe",
    "DetPr",
    "AssRe",
    "AssPr",
    "MOTP",
    "TP",
    "FP",
    "FN",
    "IDSW",
    "Frag",
    "MT",
    "PT",
    "ML",
    "IDP",
    "IDR",
    "IDTP",
    "IDFP",
    "IDFN",
)
_REPORT_SECTIONS = (
    ("Summary", ("HOTA", "DetA", "AssA", "IDF1", "MOTA")),
    (
        "Detection and localization",
        ("LocA", "DetRe", "DetPr", "MOTP", "TP", "FP", "FN"),
    ),
    (
        "Association and identity",
        (
            "AssRe",
            "AssPr",
            "IDP",
            "IDR",
            "IDTP",
            "IDFP",
            "IDFN",
            "IDSW",
            "Frag",
        ),
    ),
    ("Track coverage", ("MT", "PT", "ML")),
)
_METRIC_DISPLAY_NAMES = {
    "HOTA": "Higher Order Tracking Accuracy (HOTA)",
    "DetA": "Detection Accuracy (DetA)",
    "AssA": "Association Accuracy (AssA)",
    "IDF1": "Identity F1 Score (IDF1)",
    "MOTA": "Multiple Object Tracking Accuracy (MOTA)",
    "LocA": "Localization Accuracy (LocA)",
    "DetRe": "Detection Recall (DetRe)",
    "DetPr": "Detection Precision (DetPr)",
    "AssRe": "Association Recall (AssRe)",
    "AssPr": "Association Precision (AssPr)",
    "MOTP": "Multiple Object Tracking Precision (MOTP)",
    "TP": "True Positives (TP)",
    "FP": "False Positives (FP)",
    "FN": "False Negatives (FN)",
    "IDSW": "Identity Switches (IDSW)",
    "Frag": "Fragmentations (Frag)",
    "MT": "Mostly Tracked (MT)",
    "PT": "Partially Tracked (PT)",
    "ML": "Mostly Lost (ML)",
    "IDP": "Identity Precision (IDP)",
    "IDR": "Identity Recall (IDR)",
    "IDTP": "Identity True Positives (IDTP)",
    "IDFP": "Identity False Positives (IDFP)",
    "IDFN": "Identity False Negatives (IDFN)",
}

_SAMPLE_METRIC_FIELDS = {
    "HOTA": ("hota", fof.FloatField),
    "DetA": ("deta", fof.FloatField),
    "AssA": ("assa", fof.FloatField),
    "LocA": ("loca", fof.FloatField),
    "MOTA": ("mota", fof.FloatField),
    "MOTP": ("motp", fof.FloatField),
    "IDF1": ("idf1", fof.FloatField),
    "IDP": ("idp", fof.FloatField),
    "IDR": ("idr", fof.FloatField),
    "TP": ("tp", fof.IntField),
    "FP": ("fp", fof.IntField),
    "FN": ("fn", fof.IntField),
    "IDSW": ("idsw", fof.IntField),
    "Frag": ("frag", fof.IntField),
    "MT": ("mt", fof.IntField),
    "ML": ("ml", fof.IntField),
}
_METRIC_FAMILIES = {
    "HOTA": "HOTA",
    "DetA": "HOTA",
    "AssA": "HOTA",
    "LocA": "HOTA",
    "MOTA": "CLEAR",
    "MOTP": "CLEAR",
    "TP": "CLEAR",
    "FP": "CLEAR",
    "FN": "CLEAR",
    "IDSW": "CLEAR",
    "Frag": "CLEAR",
    "MT": "CLEAR",
    "ML": "CLEAR",
}


def evaluate_tracks(
    samples,
    pred_field,
    gt_field="frames.ground_truth",
    eval_key=None,
    method=None,
    metrics=None,
    classes=None,
    use_masks=False,
    iou=0.5,
    custom_metrics=None,
    progress=None,
    **kwargs,
):
    """Evaluates predicted multi-object tracks in a video collection.

    Tracks must be stored as frame-level
    :class:`fiftyone.core.labels.Detections`, with every
    :class:`fiftyone.core.labels.Detection` containing a non-null ``index``.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        pred_field: the frame field containing predicted tracks
        gt_field ("frames.ground_truth"): the frame field containing ground
            truth tracks
        eval_key (None): an evaluation key
        method (None): the tracking protocol to use. Supported values are
            ``fo.evaluation_config.tracking_backends.keys()``
        metrics (None): one or more metric families to compute. By default,
            all families are computed. Supported values are:

            -   ``"HOTA"``: balanced detection and association scores,
                including HOTA, DetA, AssA, LocA, and detection/association
                precision and recall, averaged over localization thresholds
                from 0.05 through 0.95
            -   ``"CLEAR"``: MOTA, MOTP, frame-level TP/FP/FN counts, identity
                switches, fragmentations, and mostly/partially/lost track
                counts, computed at the specified ``iou``
            -   ``"Identity"``: IDF1, identity precision/recall, and
                IDTP/IDFP/IDFN counts from a global track assignment computed
                at the specified ``iou``

        classes (None): an optional list of classes to evaluate
        use_masks (False): whether to evaluate instance masks rather than
            bounding boxes
        iou (0.5): the IoU threshold for CLEAR and Identity metrics. HOTA uses
            its own threshold sweep
        custom_metrics (None): an optional
            :class:`fiftyone.operators.evaluation_metric.EvaluationMetric`
            operator URI or list of URIs to run after TrackEval, or a dict
            mapping URIs to keyword arguments for each operator's
            ``compute()`` method. Returned aggregate values are included in
            ``results.metrics()``. See
            :ref:`custom evaluation metrics <custom-evaluation-metrics>`
        progress (None): whether to render a progress bar
        **kwargs: optional parameters for the selected
            :class:`TrackingEvaluationConfig` subclass. These are primarily
            intended for custom tracking backends; the built-in
            ``"motchallenge"`` and ``"mots"`` backends do not forward
            arbitrary keyword arguments to TrackEval. For example,
            ``config_cls=CustomTrackingEvaluationConfig`` overrides the
            configured backend class

    Returns:
        a :class:`TrackingResults`
    """
    fov.validate_non_grouped_collection(samples)
    fov.validate_video_collection(samples)

    if not samples._is_frame_field(pred_field):
        raise ValueError(
            "Tracking predictions must be stored in a frame-level field such "
            "as 'frames.predictions'; found sample-level field '%s'"
            % pred_field
        )

    if not samples._is_frame_field(gt_field):
        raise ValueError(
            "Tracking ground truth must be stored in a frame-level field such "
            "as 'frames.ground_truth'; found sample-level field '%s'"
            % gt_field
        )

    fov.validate_collection_label_fields(
        samples,
        (pred_field, gt_field),
        fol.Detections,
        same_type=True,
    )

    config = _parse_config(
        pred_field,
        gt_field,
        method,
        metrics=metrics,
        classes=classes,
        use_masks=use_masks,
        iou=iou,
        custom_metrics=custom_metrics,
        **kwargs,
    )
    eval_method = config.build()
    eval_method.ensure_requirements()

    # Evaluate before creating run fields so invalid annotations cannot leave
    # a partially registered evaluation behind
    results = eval_method.evaluate_samples(
        samples,
        eval_key=eval_key,
        progress=progress,
    )

    eval_method.register_run(samples, eval_key)
    eval_method.register_samples(samples, eval_key)
    eval_method.compute_custom_metrics(samples, eval_key, results)

    if eval_key is not None:
        eval_method.save_sample_metrics(
            samples,
            eval_key,
            results,
            progress=progress,
        )
        eval_method.save_run_results(samples, eval_key, results)
        eval_method.add_fields_to_sidebar_group(samples, eval_key)

    return results


class TrackingEvaluationConfig(BaseEvaluationMethodConfig):
    """Base class for configuring tracking evaluations."""

    def __init__(
        self,
        pred_field,
        gt_field,
        metrics=None,
        classes=None,
        use_masks=False,
        iou=0.5,
        custom_metrics=None,
        **kwargs,
    ):
        super().__init__(**kwargs)

        if metrics is None:
            metrics = list(_DEFAULT_METRICS)
        elif etau.is_str(metrics):
            metrics = [metrics]

        parsed_metrics = []
        for metric in metrics:
            name = _METRIC_NAMES.get(str(metric).lower(), None)
            if name is None:
                raise ValueError(
                    "Unsupported tracking metric '%s'. Supported metrics are "
                    "%s" % (metric, sorted(_DEFAULT_METRICS))
                )

            if name not in parsed_metrics:
                parsed_metrics.append(name)

        if not parsed_metrics:
            raise ValueError("At least one tracking metric must be requested")

        if not etau.is_numeric(iou) or not 0 < iou <= 1:
            raise ValueError("`iou` must be in the interval (0, 1]")

        if etau.is_str(classes):
            classes = [classes]
        elif classes is not None:
            classes = list(classes)

        self.pred_field = pred_field
        self.gt_field = gt_field
        self.metrics = parsed_metrics
        self.classes = classes
        self.use_masks = bool(use_masks)
        self.iou = float(iou)
        self.custom_metrics = custom_metrics

    @property
    def type(self):
        return "tracking"


class TrackingEvaluation(BaseEvaluationMethod):
    """Base class for tracking evaluation backends."""

    def register_samples(self, samples, eval_key):
        if eval_key is None:
            return

        dataset = samples._dataset
        for _, suffix, field_type in self._iter_sample_fields(eval_key):
            dataset.add_sample_field(suffix, field_type)

    def evaluate_samples(self, samples, eval_key=None, progress=None):
        raise NotImplementedError("subclass must implement evaluate_samples()")

    def compute_track_assignments(self, results, sample, class_name=None):
        raise NotImplementedError(
            "This tracking backend does not support track assignments"
        )

    def save_sample_metrics(self, samples, eval_key, results, progress=None):
        sequence_results = results.sequence_results
        for sample in samples.iter_samples(progress=progress, autosave=True):
            metrics = sequence_results.get(str(sample.id), {})
            for metric, field, _ in self._iter_sample_fields(eval_key):
                sample[field] = metrics.get(metric, None)

    def get_fields(self, samples, eval_key, include_custom_metrics=True):
        fields = [field for _, field, _ in self._iter_sample_fields(eval_key)]
        if include_custom_metrics:
            fields.extend(self.get_custom_metric_fields(samples, eval_key))

        return fields

    def rename(self, samples, eval_key, new_eval_key):
        dataset = samples._dataset
        in_fields = self.get_fields(
            dataset, eval_key, include_custom_metrics=False
        )
        out_fields = self.get_fields(
            dataset, new_eval_key, include_custom_metrics=False
        )
        dataset.rename_sample_fields(dict(zip(in_fields, out_fields)))
        self.rename_custom_metrics(samples, eval_key, new_eval_key)
        samples._rename_sidebar_group(eval_key, new_eval_key)

    def cleanup(self, samples, eval_key):
        dataset = samples._dataset
        fields = self.get_fields(
            dataset, eval_key, include_custom_metrics=False
        )
        dataset.delete_sample_fields(fields, error_level=1)
        self.cleanup_custom_metrics(samples, eval_key)
        samples._delete_empty_sidebar_group(eval_key)

    def _validate_run(self, samples, eval_key, existing_info):
        self._validate_fields_match(eval_key, "pred_field", existing_info)
        self._validate_fields_match(eval_key, "gt_field", existing_info)

    def _iter_sample_fields(self, eval_key):
        families = set(self.config.metrics)
        for metric, (suffix, field_type) in _SAMPLE_METRIC_FIELDS.items():
            if _family_for_metric(metric) in families:
                yield metric, "%s_%s" % (eval_key, suffix), field_type


class TrackEvalEvaluation(TrackingEvaluation):
    """Base class for TrackEval-backed tracking evaluations."""

    def evaluate_samples(self, samples, eval_key=None, progress=None):
        return _evaluate_trackeval(
            samples, self.config, eval_key, progress=progress, backend=self
        )

    def compute_track_assignments(self, results, sample, class_name=None):
        _ensure_trackeval()

        pred_field, _ = results.samples._handle_frame_field(
            self.config.pred_field
        )
        gt_field, _ = results.samples._handle_frame_field(self.config.gt_field)
        sequence = _collect_sequence(
            sample,
            pred_field,
            gt_field,
            self.config.use_masks,
            self.config.classes,
        )

        if class_name is not None:
            if class_name not in results.classes:
                raise ValueError("Class '%s' not found" % class_name)

            classes = [class_name]
        else:
            classes = results.classes or ["(none)"]

        import trackeval

        assignments = {}
        for name in classes:
            data = _build_trackeval_data(
                sequence,
                name,
                self.config.use_masks,
                trackeval,
            )
            for gt_id, timeline in _match_clear_track_ids(
                data,
                sequence,
                name,
                self.config.iou,
            ).items():
                label = "GT %s (%s)" % (gt_id, name)
                assignments[label] = timeline

        if not assignments:
            raise ValueError(
                "No ground-truth tracks were found for the requested sample"
            )

        if class_name is None:
            expected = results.sequence_results[sequence["id"]]["IDSW"]
            actual = sum(_count_id_switches(v) for v in assignments.values())
            if actual != expected:
                raise ValueError(
                    "The sample's tracking labels have changed since this "
                    "evaluation was computed; rerun the evaluation"
                )

        return assignments


class MOTChallengeEvaluationConfig(TrackingEvaluationConfig):
    """Configures TrackEval's MOTChallenge box-tracking protocol."""

    def __init__(self, pred_field, gt_field, use_masks=False, **kwargs):
        if use_masks:
            raise ValueError(
                "The 'motchallenge' method evaluates boxes. Use method='mots' "
                "with use_masks=True for mask tracking"
            )

        super().__init__(pred_field, gt_field, use_masks=False, **kwargs)

    @property
    def method(self):
        return "motchallenge"


class MOTChallengeEvaluation(TrackEvalEvaluation):
    """TrackEval-backed MOTChallenge box tracking evaluation."""

    def ensure_requirements(self):
        _ensure_trackeval()


class MOTSEvaluationConfig(TrackingEvaluationConfig):
    """Configures TrackEval's MOTS mask-tracking protocol."""

    def __init__(self, pred_field, gt_field, use_masks=True, **kwargs):
        if not use_masks:
            raise ValueError("The 'mots' method requires use_masks=True")

        super().__init__(pred_field, gt_field, use_masks=True, **kwargs)

    @property
    def method(self):
        return "mots"


class MOTSEvaluation(TrackEvalEvaluation):
    """TrackEval-backed MOTS mask tracking evaluation."""

    def ensure_requirements(self):
        _ensure_trackeval()
        fou.ensure_import(
            "pycocotools",
            error_level=0,
            error_msg=(
                "Mask tracking evaluation requires pycocotools. Install it "
                "with `pip install pycocotools`."
            ),
        )


class TrackingResults(BaseEvaluationResults):
    """Stores aggregate, per-class, and per-sequence tracking metrics."""

    def __init__(
        self,
        samples,
        config,
        eval_key,
        aggregate_results,
        sequence_results,
        class_results,
        classes,
        sequence_info=None,
        hota_curves=None,
        custom_metrics=None,
        backend=None,
    ):
        super().__init__(
            samples,
            config,
            eval_key,
            custom_metrics=custom_metrics,
            backend=backend,
        )
        self.aggregate_results = aggregate_results
        self.sequence_results = sequence_results
        self.class_results = class_results
        self.classes = classes
        self.sequence_info = sequence_info or {}
        self.hota_curves = hota_curves

    def metrics(self, sequence=None, class_name=None):
        """Returns aggregate or per-sequence/per-class tracking metrics."""
        if sequence is not None and class_name is not None:
            raise ValueError(
                "Specify at most one of `sequence` and `class_name`"
            )

        if sequence is not None:
            key = str(sequence)
            if key not in self.sequence_results:
                raise ValueError("Sequence '%s' not found" % sequence)

            return dict(self.sequence_results[key])

        if class_name is not None:
            if class_name not in self.class_results:
                raise ValueError("Class '%s' not found" % class_name)

            return dict(self.class_results[class_name])

        metrics = dict(self.aggregate_results)
        metrics.update(self._get_custom_metrics())
        return metrics

    def print_report(
        self,
        sequence=None,
        class_name=None,
        digits=4,
        full_names=False,
    ):
        """Prints a grouped tracking report.

        Args:
            sequence (None): an optional video sample ID
            class_name (None): an optional class name
            digits (4): the number of digits of precision to print
            full_names (False): whether to print full metric names in addition
                to their abbreviations
        """
        metrics = self.metrics(sequence=sequence, class_name=class_name)
        remaining = dict(metrics)
        printed = False
        for title, names in _REPORT_SECTIONS:
            section = {
                (
                    _METRIC_DISPLAY_NAMES[name] if full_names else name
                ): remaining.pop(name)
                for name in names
                if name in remaining
            }
            if not section:
                continue

            if printed:
                print()

            print(title)
            self._print_metrics(section, digits=digits)
            printed = True

        if remaining:
            if printed:
                print()

            print("Custom metrics")
            self._print_metrics(remaining, digits=digits)

    def compare(
        self,
        other,
        values=None,
        digits=4,
        full_names=False,
    ):
        """Prints a side-by-side comparison with another tracking evaluation.

        The delta column is computed as ``other - self``.

        Args:
            other: another :class:`TrackingResults` or the key of a tracking
                evaluation on this dataset
            values (None): an optional metric name or list of metric names to
                compare. By default, all shared numeric metrics are included
            digits (4): the number of digits of precision to print
            full_names (False): whether to print full metric names in addition
                to their abbreviations
        """
        other, labels, values = self._prepare_comparison(other, values)
        current_metrics = self.metrics()
        other_metrics = other.metrics()
        records = []
        for name in values:
            current = current_metrics[name]
            candidate = other_metrics[name]
            records.append(
                (
                    (
                        _METRIC_DISPLAY_NAMES.get(name, name)
                        if full_names
                        else name
                    ),
                    _format_number(current, digits),
                    _format_number(candidate, digits),
                    _format_delta(candidate - current, digits),
                )
            )

        print(
            tabulate(
                records,
                headers=(
                    "Metric",
                    labels[0],
                    labels[1],
                    "Delta (%s - %s)" % (labels[1], labels[0]),
                ),
                tablefmt="simple",
                disable_numparse=True,
            )
        )

    def plot_compare(
        self,
        other,
        values=None,
        backend="plotly",
        **kwargs,
    ):
        """Plots a side-by-side comparison with another tracking evaluation.

        Args:
            other: another :class:`TrackingResults` or the key of a tracking
                evaluation on this dataset
            values (None): an optional metric name or list of metric names to
                plot. By default, the shared headline metrics HOTA, DetA, AssA,
                IDF1, and MOTA are plotted
            backend ("plotly"): the plotting backend to use. Supported values
                are ``("plotly", "matplotlib")``
            **kwargs: optional keyword arguments for the plotting backend

        Returns:
            a plotly or matplotlib figure
        """
        default_values = _REPORT_SECTIONS[0][1] if values is None else None
        other, labels, values = self._prepare_comparison(
            other,
            values,
            default_values=default_values,
        )
        current_metrics = self.metrics()
        other_metrics = other.metrics()
        title = kwargs.pop("title", "Tracking evaluation comparison")
        return _plot_tracking_bars(
            values,
            [current_metrics[name] for name in values],
            [other_metrics[name] for name in values],
            labels,
            backend,
            title,
            **kwargs,
        )

    def _prepare_comparison(self, other, values, default_values=None):
        if etau.is_str(other):
            other_key = other
            other = self.samples.load_evaluation_results(other)
        else:
            other_key = getattr(other, "key", None)

        if not isinstance(other, TrackingResults):
            raise ValueError("`other` must be a tracking evaluation")

        current_metrics = self.metrics()
        other_metrics = other.metrics()
        explicit_values = values is not None
        if values is None:
            values = default_values or current_metrics.keys()
        elif etau.is_str(values):
            values = [values]

        values = list(dict.fromkeys(values))
        if explicit_values:
            missing = [
                name
                for name in values
                if name not in current_metrics or name not in other_metrics
            ]
            if missing:
                raise ValueError(
                    "Metrics %s are not available in both evaluations"
                    % missing
                )
        else:
            values = [
                name
                for name in values
                if name in current_metrics and name in other_metrics
            ]

        numeric_values = [
            name
            for name in values
            if isinstance(current_metrics[name], numbers.Number)
            and isinstance(other_metrics[name], numbers.Number)
        ]
        if explicit_values and len(numeric_values) != len(values):
            raise ValueError("All requested metrics must be numeric")

        values = numeric_values
        if not values:
            raise ValueError("No shared numeric metrics to compare")

        current_key = self.key or "current"
        other_key = other_key or "other"
        if current_key == other_key:
            current_key, other_key = "current", "other"

        return other, (current_key, other_key), values

    def hota(self, sequence=None, class_name=None):
        """Returns the HOTA score."""
        return self._get_metric("HOTA", sequence, class_name)

    def idf1(self, sequence=None, class_name=None):
        """Returns the IDF1 score."""
        return self._get_metric("IDF1", sequence, class_name)

    def mota(self, sequence=None, class_name=None):
        """Returns the MOTA score."""
        return self._get_metric("MOTA", sequence, class_name)

    def plot_hota_curves(
        self,
        sample=None,
        class_name=None,
        backend="plotly",
        **kwargs,
    ):
        """Plots TrackEval's HOTA metrics over localization threshold.

        Args:
            sample (None): an optional video sample
            class_name (None): an optional class name
            backend ("plotly"): the plotting backend to use. Supported values
                are ``("plotly", "matplotlib")``
            **kwargs: optional keyword arguments for the plotting backend

        Returns:
            a plotly or matplotlib figure
        """
        curves = self._get_hota_curves(sample, class_name)
        names = [
            name
            for name in (
                "HOTA",
                "DetA",
                "AssA",
                "LocA",
                "DetRe",
                "DetPr",
                "AssRe",
                "AssPr",
            )
            if name in curves
        ]
        thresholds = self.hota_curves["thresholds"]
        title = kwargs.pop("title", "HOTA metrics over localization threshold")
        return _plot_tracking_lines(
            x=[thresholds] * len(names),
            y=[curves[name] for name in names],
            labels=names,
            backend=backend,
            title=title,
            xlabel="alpha",
            ylabel="score",
            **kwargs,
        )

    def plot_id_switches(
        self,
        sample,
        class_name=None,
        backend="plotly",
        **kwargs,
    ):
        """Plots predicted track IDs assigned to ground-truth tracks by frame.

        Each line represents a ground-truth track. Its values are the predicted
        track IDs assigned by TrackEval's CLEAR matching, so an identity switch
        is shown as a transition from the old predicted ID to the new one.

        Args:
            sample: the video sample to plot
            class_name (None): an optional class name
            backend ("plotly"): the plotting backend to use. Supported values
                are ``("plotly", "matplotlib")``
            **kwargs: optional keyword arguments for the plotting backend

        Returns:
            a plotly or matplotlib figure
        """
        if "CLEAR" not in self.config.metrics:
            raise ValueError(
                "Identity switches were not computed. Include 'CLEAR' in "
                "`metrics` when evaluating tracks"
            )

        sample_key = self._get_sample_key(sample)
        assignments = self.backend.compute_track_assignments(
            self, sample, class_name
        )
        frames = list(range(1, len(next(iter(assignments.values()))) + 1))

        title = kwargs.pop(
            "title",
            "Track assignments: %s"
            % self.sequence_info.get(sample_key, {}).get(
                "filepath", sample_key
            ),
        )
        return _plot_tracking_lines(
            x=[frames] * len(assignments),
            y=list(assignments.values()),
            labels=list(assignments),
            backend=backend,
            title=title,
            xlabel="frame",
            ylabel="predicted track ID",
            **kwargs,
        )

    def _get_hota_curves(self, sample, class_name):
        if not self.hota_curves:
            raise ValueError(
                "HOTA curves were not computed. Include 'HOTA' in `metrics` "
                "when evaluating tracks"
            )

        if sample is not None and class_name is not None:
            raise ValueError(
                "Specify at most one of `sample` and `class_name`"
            )

        if sample is not None:
            key = self._get_sample_key(sample)
            curves = self.hota_curves["sequences"].get(key, None)
            return curves

        if class_name is not None:
            curves = self.hota_curves["classes"].get(class_name, None)
            if curves is None:
                raise ValueError("Class '%s' not found" % class_name)

            return curves

        return self.hota_curves["aggregate"]

    def _get_sample_key(self, sample):
        sample_id = getattr(sample, "id", None)
        if sample_id is None:
            raise ValueError("`sample` must be a FiftyOne video sample")

        key = str(sample_id)
        if key not in self.sequence_results:
            raise ValueError(
                "Sample '%s' was not included in this evaluation" % sample_id
            )

        return key

    def _get_metric(self, name, sequence, class_name):
        metrics = self.metrics(sequence=sequence, class_name=class_name)
        if name not in metrics:
            raise ValueError(
                "%s was not computed. Requested metric families were %s"
                % (name, self.config.metrics)
            )

        return metrics[name]

    @classmethod
    def _from_dict(cls, d, samples, config, eval_key, **kwargs):
        return cls(
            samples,
            config,
            eval_key,
            d.get("aggregate_results", {}),
            d.get("sequence_results", {}),
            d.get("class_results", {}),
            d.get("classes", []),
            sequence_info=d.get("sequence_info", None),
            hota_curves=d.get("hota_curves", None),
            custom_metrics=d.get("custom_metrics", None),
            **kwargs,
        )


def _evaluate_trackeval(samples, config, eval_key, progress, backend):
    pred_field, _ = samples._handle_frame_field(config.pred_field)
    gt_field, _ = samples._handle_frame_field(config.gt_field)

    sequences = []
    observed_classes = set()
    for sample in samples.iter_samples(progress=progress):
        sequence = _collect_sequence(
            sample,
            pred_field,
            gt_field,
            config.use_masks,
            config.classes,
        )
        sequences.append(sequence)
        observed_classes.update(sequence["classes"])

    classes = (
        list(config.classes)
        if config.classes is not None
        else sorted(observed_classes)
    )
    eval_classes = classes or ["(none)"]

    import trackeval

    metric_objects = _make_metrics(trackeval, config.metrics, config.iou)
    raw_sequence_results = {}
    for sequence in sequences:
        sequence_key = sequence["id"]
        class_data = {}
        for class_name in eval_classes:
            data = _build_trackeval_data(
                sequence,
                class_name,
                config.use_masks,
                trackeval,
            )
            class_data[class_name] = {
                name: metric.eval_sequence(data)
                for name, metric in metric_objects.items()
            }

        raw_sequence_results[sequence_key] = class_data

    raw_class_results = {}
    for class_name in eval_classes:
        raw_class_results[class_name] = {}
        for name, metric in metric_objects.items():
            per_sequence = {
                key: result[class_name][name]
                for key, result in raw_sequence_results.items()
            }
            if per_sequence:
                combined = metric.combine_sequences(per_sequence)
            else:
                combined = metric.eval_sequence(
                    _empty_trackeval_data("(empty)")
                )

            raw_class_results[class_name][name] = combined

    raw_combined = _combine_classes(metric_objects, raw_class_results)

    raw_sequence_combined = {}
    sequence_results = {}
    for sequence_key, class_data in raw_sequence_results.items():
        combined = _combine_classes(metric_objects, class_data)
        raw_sequence_combined[sequence_key] = combined
        sequence_results[sequence_key] = _flatten_results(combined)

    class_results = {
        class_name: _flatten_results(raw)
        for class_name, raw in raw_class_results.items()
        if classes
    }
    aggregate_results = _flatten_results(raw_combined)
    hota_curves = _extract_hota_curves(
        metric_objects,
        raw_combined,
        raw_sequence_combined,
        raw_class_results,
        classes,
    )
    sequence_info = {
        sequence["id"]: {
            "filepath": sequence["filepath"],
            "frame_width": sequence["width"],
            "frame_height": sequence["height"],
            "frame_count": sequence["length"],
        }
        for sequence in sequences
    }

    return TrackingResults(
        samples,
        config,
        eval_key,
        aggregate_results,
        sequence_results,
        class_results,
        classes,
        sequence_info=sequence_info,
        hota_curves=hota_curves,
        backend=backend,
    )


def _collect_sequence(
    sample, pred_field, gt_field, use_masks, selected_classes
):
    metadata = sample.metadata
    required = ("frame_width", "frame_height", "total_frame_count")
    if metadata is None or any(
        getattr(metadata, f, None) is None for f in required
    ):
        raise ValueError(
            "Video sample '%s' is missing frame width, frame height, or frame "
            "count metadata. Populate it with `dataset.compute_metadata()` "
            "before evaluating tracks" % sample.filepath
        )

    width = metadata.frame_width
    height = metadata.frame_height
    length = metadata.total_frame_count
    if width <= 0 or height <= 0 or length < 0:
        raise ValueError(
            "Video sample '%s' has invalid metadata: width=%s, height=%s, "
            "frame_count=%s" % (sample.filepath, width, height, length)
        )

    frames = {frame.frame_number: frame for frame in sample.frames.values()}
    invalid_frames = sorted(f for f in frames if f > length)
    if invalid_frames:
        raise ValueError(
            "Video sample '%s' contains annotations beyond its reported frame "
            "count %d: %s" % (sample.filepath, length, invalid_frames)
        )

    selected_classes = (
        set(selected_classes) if selected_classes is not None else None
    )
    class_names = set()
    track_labels = {"ground truth": {}, "predictions": {}}
    frame_data = []
    for frame_number in range(1, length + 1):
        frame = frames.get(frame_number, None)
        values = {}
        for side, field in (
            ("ground truth", gt_field),
            ("predictions", pred_field),
        ):
            labels = frame.get_field(field) if frame is not None else None
            detections = [] if labels is None else (labels.detections or [])
            values[side] = _parse_frame_detections(
                detections,
                side,
                sample.filepath,
                frame_number,
                width,
                height,
                use_masks,
                selected_classes,
                track_labels[side],
                class_names,
            )

        frame_data.append(
            {
                "gt": values["ground truth"],
                "pred": values["predictions"],
            }
        )

    return {
        "id": str(sample.id),
        "filepath": sample.filepath,
        "width": width,
        "height": height,
        "length": length,
        "frames": frame_data,
        "classes": class_names,
    }


def _parse_frame_detections(
    detections,
    side,
    filepath,
    frame_number,
    width,
    height,
    use_masks,
    selected_classes,
    track_labels,
    class_names,
):
    seen_ids = set()
    parsed = []
    for detection in detections:
        index = detection.index
        if index is None:
            raise ValueError(
                "%s detection on video '%s', frame %d is missing its track "
                "`index`" % (side.capitalize(), filepath, frame_number)
            )

        if index in seen_ids:
            raise ValueError(
                "%s contains duplicate track index %s on video '%s', frame %d"
                % (side.capitalize(), index, filepath, frame_number)
            )

        seen_ids.add(index)

        label = detection.label
        if label is None:
            raise ValueError(
                "%s track %s on video '%s', frame %d has no class label"
                % (side.capitalize(), index, filepath, frame_number)
            )

        previous_label = track_labels.setdefault(index, label)
        if previous_label != label:
            raise ValueError(
                "%s track index %s is ambiguous within video '%s': it is "
                "used for both '%s' and '%s'"
                % (side.capitalize(), index, filepath, previous_label, label)
            )

        if selected_classes is not None and label not in selected_classes:
            continue

        box = _parse_box(
            detection.bounding_box,
            width,
            height,
            side,
            filepath,
            frame_number,
            index,
        )
        confidence = detection.confidence
        if side == "predictions":
            if confidence is None:
                confidence = 1.0
            elif not etau.is_numeric(confidence) or not math.isfinite(
                confidence
            ):
                raise ValueError(
                    "Prediction track %s on video '%s', frame %d has invalid "
                    "confidence %s"
                    % (index, filepath, frame_number, confidence)
                )
        else:
            confidence = 1.0

        mask = None
        if use_masks:
            mask = _parse_mask(
                detection,
                width,
                height,
                side,
                filepath,
                frame_number,
                index,
            )

        class_names.add(label)
        parsed.append(
            {
                "id": index,
                "label": label,
                "box": box,
                "mask": mask,
                "confidence": float(confidence),
            }
        )

    return parsed


def _parse_box(box, width, height, side, filepath, frame_number, index):
    try:
        box = np.asarray(box, dtype=float)
    except Exception as e:
        raise ValueError(
            "%s track %s on video '%s', frame %d has an invalid bounding box"
            % (side.capitalize(), index, filepath, frame_number)
        ) from e

    if box.shape != (4,) or not np.isfinite(box).all():
        raise ValueError(
            "%s track %s on video '%s', frame %d must have a finite "
            "[x, y, width, height] bounding box"
            % (side.capitalize(), index, filepath, frame_number)
        )

    x, y, w, h = box
    eps = 1e-9
    if (
        x < 0
        or y < 0
        or w <= 0
        or h <= 0
        or x + w > 1 + eps
        or y + h > 1 + eps
    ):
        raise ValueError(
            "%s track %s on video '%s', frame %d has invalid normalized "
            "bounding box %s"
            % (
                side.capitalize(),
                index,
                filepath,
                frame_number,
                box.tolist(),
            )
        )

    return np.asarray([x * width, y * height, w * width, h * height])


def _parse_mask(detection, width, height, side, filepath, frame_number, index):
    if detection.mask is None:
        raise ValueError(
            "%s track %s on video '%s', frame %d has no `Detection.mask`"
            % (side.capitalize(), index, filepath, frame_number)
        )

    mask = np.asarray(detection.mask)
    if mask.ndim != 2 or mask.size == 0:
        raise ValueError(
            "%s track %s on video '%s', frame %d must have a non-empty 2D "
            "instance mask"
            % (side.capitalize(), index, filepath, frame_number)
        )

    if not np.issubdtype(mask.dtype, np.number) and mask.dtype != bool:
        raise ValueError(
            "%s track %s on video '%s', frame %d has a non-numeric mask"
            % (side.capitalize(), index, filepath, frame_number)
        )

    if not np.isfinite(mask).all() or not np.isin(mask, (0, 1)).all():
        raise ValueError(
            "%s track %s on video '%s', frame %d must have a binary 0/1 mask"
            % (side.capitalize(), index, filepath, frame_number)
        )

    try:
        full_mask = detection.to_segmentation(
            frame_size=(width, height), target=1
        ).mask.astype(bool)
    except Exception as e:
        raise ValueError(
            "%s track %s on video '%s', frame %d has a mask that cannot be "
            "rendered within its bounding box"
            % (side.capitalize(), index, filepath, frame_number)
        ) from e

    if not full_mask.any():
        raise ValueError(
            "%s track %s on video '%s', frame %d has an empty instance mask"
            % (side.capitalize(), index, filepath, frame_number)
        )

    return full_mask


def _build_trackeval_data(sequence, class_name, use_masks, trackeval):
    gt_tracks, pred_tracks = _get_class_tracks(sequence, class_name)

    gt_id_map = _make_id_map(gt_tracks)
    pred_id_map = _make_id_map(pred_tracks)
    gt_ids = []
    pred_ids = []
    gt_dets = []
    pred_dets = []
    confidences = []
    similarities = []
    for gt_frame, pred_frame in zip(gt_tracks, pred_tracks):
        gt_ids_t = np.asarray(
            [gt_id_map[d["id"]] for d in gt_frame], dtype=int
        )
        pred_ids_t = np.asarray(
            [pred_id_map[d["id"]] for d in pred_frame], dtype=int
        )
        gt_boxes_t = _stack_boxes(gt_frame)
        pred_boxes_t = _stack_boxes(pred_frame)

        if use_masks:
            if gt_frame and pred_frame:
                gt_masks = np.stack([d["mask"] for d in gt_frame])
                pred_masks = np.stack([d["mask"] for d in pred_frame])
                similarity = (
                    trackeval.datasets.MOTSChallenge._calculate_mask_ious(
                        gt_masks, pred_masks, is_encoded=False
                    )
                )
            else:
                similarity = np.zeros(
                    (len(gt_frame), len(pred_frame)), dtype=float
                )
        else:
            similarity = (
                trackeval.datasets.MotChallenge2DBox._calculate_box_ious(
                    gt_boxes_t, pred_boxes_t, box_format="xywh"
                )
            )

        gt_ids.append(gt_ids_t)
        pred_ids.append(pred_ids_t)
        gt_dets.append(gt_boxes_t)
        pred_dets.append(pred_boxes_t)
        confidences.append(
            np.asarray([d["confidence"] for d in pred_frame], dtype=float)
        )
        similarities.append(similarity)

    return {
        "num_timesteps": sequence["length"],
        "num_gt_ids": len(gt_id_map),
        "num_tracker_ids": len(pred_id_map),
        "num_gt_dets": sum(len(ids) for ids in gt_ids),
        "num_tracker_dets": sum(len(ids) for ids in pred_ids),
        "gt_ids": gt_ids,
        "tracker_ids": pred_ids,
        "gt_dets": gt_dets,
        "tracker_dets": pred_dets,
        "tracker_confidences": confidences,
        "similarity_scores": similarities,
        "seq": sequence["id"],
    }


def _empty_trackeval_data(sequence):
    return {
        "num_timesteps": 0,
        "num_gt_ids": 0,
        "num_tracker_ids": 0,
        "num_gt_dets": 0,
        "num_tracker_dets": 0,
        "gt_ids": [],
        "tracker_ids": [],
        "gt_dets": [],
        "tracker_dets": [],
        "tracker_confidences": [],
        "similarity_scores": [],
        "seq": sequence,
    }


def _get_class_tracks(sequence, class_name):
    frames = sequence["frames"]
    return (
        [
            [d for d in frame["gt"] if d["label"] == class_name]
            for frame in frames
        ],
        [
            [d for d in frame["pred"] if d["label"] == class_name]
            for frame in frames
        ],
    )


def _make_id_map(frames):
    ids = {d["id"] for frame in frames for d in frame}
    return {track_id: index for index, track_id in enumerate(sorted(ids))}


def _match_clear_track_ids(data, sequence, class_name, threshold):
    from scipy.optimize import linear_sum_assignment

    gt_tracks, pred_tracks = _get_class_tracks(sequence, class_name)
    gt_ids = sorted({d["id"] for frame in gt_tracks for d in frame})
    pred_ids = sorted({d["id"] for frame in pred_tracks for d in frame})
    timelines = {gt_id: [np.nan] * data["num_timesteps"] for gt_id in gt_ids}
    previous = np.full(data["num_gt_ids"], np.nan)
    eps = np.spacing(1)

    for frame_number, (frame_gt_ids, frame_pred_ids) in enumerate(
        zip(data["gt_ids"], data["tracker_ids"])
    ):
        if not len(frame_gt_ids) or not len(frame_pred_ids):
            continue

        similarity = data["similarity_scores"][frame_number]
        scores = 1000 * (
            frame_pred_ids[np.newaxis, :]
            == previous[frame_gt_ids[:, np.newaxis]]
        )
        scores = scores + similarity
        scores[similarity < threshold - eps] = 0
        rows, cols = linear_sum_assignment(-scores)
        matched = scores[rows, cols] > eps
        rows, cols = rows[matched], cols[matched]
        matched_gt_ids = frame_gt_ids[rows]
        matched_pred_ids = frame_pred_ids[cols]

        previous[:] = np.nan
        previous[matched_gt_ids] = matched_pred_ids
        for gt_id, pred_id in zip(matched_gt_ids, matched_pred_ids):
            timelines[gt_ids[gt_id]][frame_number] = pred_ids[pred_id]

    return timelines


def _count_id_switches(timeline):
    previous = None
    switches = 0
    for track_id in timeline:
        if np.isnan(track_id):
            continue

        if previous is not None and track_id != previous:
            switches += 1

        previous = track_id

    return switches


def _stack_boxes(detections):
    if not detections:
        return np.empty((0, 4), dtype=float)

    return np.stack([d["box"] for d in detections])


def _make_metrics(trackeval, metric_names, iou):
    metrics = {}
    for name in metric_names:
        metric_cls = getattr(trackeval.metrics, name)
        if name in ("CLEAR", "Identity"):
            metric = metric_cls({"THRESHOLD": iou, "PRINT_CONFIG": False})
        else:
            metric = metric_cls()

        metrics[name] = metric

    return metrics


def _combine_classes(metric_objects, class_results):
    return {
        name: metric.combine_classes_det_averaged(
            {
                class_name: result[name]
                for class_name, result in class_results.items()
            }
        )
        for name, metric in metric_objects.items()
    }


def _flatten_results(results):
    flat = {}
    hota = results.get("HOTA", {})
    for name in (
        "HOTA",
        "DetA",
        "AssA",
        "LocA",
        "DetRe",
        "DetPr",
        "AssRe",
        "AssPr",
    ):
        if name in hota:
            flat[name] = float(np.mean(hota[name]))

    clear = results.get("CLEAR", {})
    for name in ("MOTA", "MOTP"):
        if name in clear:
            flat[name] = float(clear[name])

    for output_name, input_name in (
        ("TP", "CLR_TP"),
        ("FP", "CLR_FP"),
        ("FN", "CLR_FN"),
        ("IDSW", "IDSW"),
        ("Frag", "Frag"),
        ("MT", "MT"),
        ("ML", "ML"),
        ("PT", "PT"),
    ):
        if input_name in clear:
            flat[output_name] = int(clear[input_name])

    identity = results.get("Identity", {})
    for name in ("IDF1", "IDP", "IDR"):
        if name in identity:
            flat[name] = float(identity[name])

    for name in ("IDTP", "IDFP", "IDFN"):
        if name in identity:
            flat[name] = int(identity[name])

    return {name: flat[name] for name in _METRIC_ORDER if name in flat}


def _extract_hota_curves(
    metric_objects,
    aggregate_results,
    sequence_results,
    class_results,
    classes,
):
    metric = metric_objects.get("HOTA", None)
    if metric is None:
        return None

    fields = metric.float_array_fields

    def _extract(results):
        results = results["HOTA"]
        return {
            field: np.asarray(results[field]).tolist()
            for field in fields
            if field in results
        }

    return {
        "thresholds": np.asarray(metric.array_labels).tolist(),
        "aggregate": _extract(aggregate_results),
        "sequences": {
            sequence: _extract(results)
            for sequence, results in sequence_results.items()
        },
        "classes": {
            class_name: _extract(class_results[class_name])
            for class_name in classes
        },
    }


def _family_for_metric(metric):
    return _METRIC_FAMILIES.get(metric, "Identity")


def _plot_tracking_lines(
    x,
    y,
    labels,
    backend,
    title,
    xlabel,
    ylabel,
    **kwargs,
):
    if backend == "matplotlib":
        return fop.lines(
            x=x,
            y=y,
            labels=labels,
            backend=backend,
            title=title,
            xlabel=xlabel,
            ylabel=ylabel,
            **kwargs,
        )

    if backend != "plotly":
        raise ValueError(
            "Unsupported plotting backend '%s'; supported values are "
            "('plotly', 'matplotlib')" % backend
        )

    import plotly.graph_objects as go

    figure = go.Figure()
    for x_values, y_values, label in zip(x, y, labels):
        figure.add_scatter(
            x=x_values,
            y=y_values,
            mode="lines+markers",
            name=label,
        )

    figure.update_layout(
        title=title,
        xaxis_title=xlabel,
        yaxis_title=ylabel,
        **kwargs,
    )
    return figure


def _plot_tracking_bars(
    names,
    current,
    other,
    labels,
    backend,
    title,
    **kwargs,
):
    if backend == "matplotlib":
        import matplotlib.pyplot as plt

        positions = np.arange(len(names))
        width = 0.4
        figure, axis = plt.subplots(figsize=kwargs.pop("figsize", None))
        axis.bar(
            positions - width / 2,
            current,
            width,
            label=labels[0],
            **kwargs,
        )
        axis.bar(
            positions + width / 2,
            other,
            width,
            label=labels[1],
            **kwargs,
        )
        axis.set(
            title=title,
            ylabel="value",
            xticks=positions,
            xticklabels=names,
        )
        axis.legend()
        figure.tight_layout()
        return figure

    if backend != "plotly":
        raise ValueError(
            "Unsupported plotting backend '%s'; supported values are "
            "('plotly', 'matplotlib')" % backend
        )

    import plotly.graph_objects as go

    figure = go.Figure()
    figure.add_bar(x=names, y=current, name=labels[0])
    figure.add_bar(x=names, y=other, name=labels[1])
    figure.update_layout(
        barmode="group",
        title=title,
        yaxis_title="value",
        **kwargs,
    )
    return figure


def _format_number(value, digits):
    if isinstance(value, numbers.Integral):
        return str(value)

    return ("%%.%df" % digits) % value


def _format_delta(value, digits):
    if isinstance(value, numbers.Integral):
        return "%+d" % value if value else "0"

    return ("%+.*f" % (digits, value)) if value else ("0.%s" % ("0" * digits))


def _ensure_trackeval():
    fou.ensure_import(
        "trackeval",
        error_level=0,
        error_msg=(
            "Tracking evaluation requires TrackEval. Install it with "
            "`pip install trackeval`."
        ),
    )


def _parse_config(pred_field, gt_field, method, **kwargs):
    use_masks = kwargs.get("use_masks", False)
    if method is None:
        method = (
            "mots"
            if use_masks
            else fo.evaluation_config.default_tracking_backend
        )

    custom_metrics = kwargs.get("custom_metrics", None)
    if etau.is_str(custom_metrics):
        kwargs["custom_metrics"] = [custom_metrics]

    if inspect.isclass(method):
        return method(pred_field, gt_field, **kwargs)

    backends = fo.evaluation_config.tracking_backends
    if method not in backends:
        raise ValueError(
            "Unsupported tracking evaluation method '%s'. The available "
            "methods are %s" % (method, sorted(backends.keys()))
        )

    params = deepcopy(backends[method])
    config_cls = kwargs.pop("config_cls", None)
    if config_cls is None:
        config_cls = params.pop("config_cls", None)

    if config_cls is None:
        raise ValueError(
            "Tracking evaluation method '%s' has no `config_cls`" % method
        )

    if etau.is_str(config_cls):
        config_cls = etau.get_class(config_cls)

    params.update(**kwargs)
    return config_cls(pred_field, gt_field, **params)
