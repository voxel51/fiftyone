"""
Base evaluation methods.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from copy import deepcopy
import itertools
import logging
import numbers

import numpy as np
import sklearn.metrics as skm
from tabulate import tabulate

import eta.core.utils as etau

import fiftyone.core.collections as foc
import fiftyone.core.evaluation as foe
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.plots as fop
import fiftyone.core.utils as fou

foo = fou.lazy_import("fiftyone.operators")
foue = fou.lazy_import("fiftyone.utils.eval")


logger = logging.getLogger(__name__)


def get_subset_view(sample_collection, gt_field, subset_def):
    """Returns the view into the given collection specified by the subset
    definition.

    Example subset definitions::

        # Subset defined by a saved view
        subset_def = {
            "type": "view",
            "view": "night_view",
        }

        # Subset defined by a sample field value
        subset_def = {
            "type": "sample",
            "field": "timeofday",
            "value": "night",
        }

        # Subset defined by a sample field expression
        subset_def = {
            "type": "field",
            "expr": F("uniqueness") > 0.75,
        }

        # Subset defined by a label attribute value
        subset_def = {
            "type": "attribute",
            "field": "type",
            "value": "sedan",
        }

        # Subset defined by a label expression
        bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
        subset_def = {
            "type": "attribute",
            "expr": (0.05 <= bbox_area) & (bbox_area <= 0.5),
        }

        # Compound subset defined by a sample field value + sample expression
        subset_def = [
            {
                "type": "field",
                "field": "timeofday",
                "value": "night",
            },
            {
                "type": "field",
                "expr": F("uniqueness") > 0.75,
            },
        ]

        # Compound subset defined by a sample field value + label expression
        bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
        subset_def = [
            {
                "type": "field",
                "field": "timeofday",
                "value": "night",
            },
            {
                "type": "attribute",
                "expr": (0.05 <= bbox_area) & (bbox_area <= 0.5),
            },
        ]

        # Compound subset defined by a saved view + label attribute value
        subset_def = [
            {
                "type": "view",
                "view": "night_view",
            },
            {
                "type": "attribute",
                "field": "type",
                "value": "sedan",
            }
        ]

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        gt_field: the ground truth field
        subset_def: a dict or list of dicts defining the subset. See above for
            syntax and examples

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    from fiftyone import ViewField as F

    if isinstance(subset_def, dict):
        subset_def = [subset_def]
    else:
        subset_def = list(subset_def)

    subset_view = None

    # Always apply saved view first
    for d in subset_def:
        type = d["type"]
        view = d.get("view", None)

        if type == "view":
            subset_view = sample_collection._root_dataset.load_saved_view(view)

    if subset_view is None:
        subset_view = sample_collection

    for d in subset_def:
        type = d["type"]
        field = d.get("field", None)
        value = d.get("value", None)
        expr = d.get("expr", None)

        if type == "field":
            if value is not None:
                # Field value
                if field == "tags":
                    subset_view = subset_view.match_tags(value)
                elif isinstance(subset_view.get_field(field), fof.ListField):
                    subset_view = subset_view.match(F(field).contains(value))
                else:
                    subset_view = subset_view.match(F(field) == value)
            elif expr is not None:
                # Field expression
                expr = deepcopy(expr)  # don't modify caller's expression
                subset_view = subset_view.match(expr)
        elif type == "attribute":
            gt_root, is_list_field = sample_collection._get_label_field_root(
                gt_field
            )

            if value is not None:
                # Label attribute value
                if isinstance(
                    subset_view.get_field(gt_root + "." + field),
                    fof.ListField,
                ):
                    expr = F(field).contains(value)
                else:
                    expr = F(field) == value
            else:
                # Label attribute expression
                expr = deepcopy(expr)  # don't modify caller's expression

            if is_list_field:
                subset_view = subset_view.filter_labels(gt_field, expr)
            else:
                subset_view = subset_view.match(F(gt_field).apply(expr))

    return subset_view


class BaseEvaluationMethodConfig(foe.EvaluationMethodConfig):
    """Base class for configuring evaluation methods.

    Args:
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    pass


class BaseEvaluationMethod(foe.EvaluationMethod):
    """Base class for evaluation methods.

    Args:
        config: an :class:`BaseEvaluationMethodConfig`
    """

    def _get_custom_metrics(self, metric_uris=None):
        if not self.config.custom_metrics:
            return {}

        if isinstance(self.config.custom_metrics, list):
            return {m: None for m in self.config.custom_metrics}

        custom_metrics = self.config.custom_metrics

        if metric_uris is not None:
            custom_metrics = {
                k: v for k, v in custom_metrics.items() if k in metric_uris
            }

        return custom_metrics

    def compute_custom_metrics(
        self, samples, eval_key, results, metric_uris=None
    ):
        custom_metrics = self._get_custom_metrics(metric_uris=metric_uris)
        for metric, kwargs in custom_metrics.items():
            try:
                operator = foo.get_operator(metric)
                value = operator.compute(samples, results, **kwargs or {})
                if value is not None:
                    if results.custom_metrics is None:
                        results.custom_metrics = {}

                    key = operator.config.aggregate_key
                    if key is None:
                        key = operator.config.name

                    results.custom_metrics[operator.uri] = {
                        "key": key,
                        "value": value,
                        "label": operator.config.label,
                        "lower_is_better": operator.config.kwargs.get(
                            "lower_is_better", True
                        ),
                    }
            except Exception as e:
                logger.warning(
                    "Failed to compute metric '%s': Reason: %s",
                    metric,
                    e,
                )

    def get_custom_metric_fields(self, samples, eval_key, metric_uris=None):
        fields = []

        custom_metrics = self._get_custom_metrics(metric_uris=metric_uris)
        for metric in custom_metrics.keys():
            try:
                operator = foo.get_operator(metric)
                fields.extend(
                    operator.get_fields(samples, self.config, eval_key)
                )
            except Exception as e:
                logger.warning(
                    "Failed to get fields for metric '%s': Reason: %s",
                    metric,
                    e,
                )

        return fields

    def rename_custom_metrics(
        self, samples, eval_key, new_eval_key, metric_uris=None
    ):
        custom_metrics = self._get_custom_metrics(metric_uris=metric_uris)
        for metric in custom_metrics.keys():
            try:
                operator = foo.get_operator(metric)
                operator.rename(samples, self.config, eval_key, new_eval_key)
            except Exception as e:
                logger.warning(
                    "Failed to rename fields for metric '%s': Reason: %s",
                    metric,
                    e,
                )

    def cleanup_custom_metrics(self, samples, eval_key, metric_uris=None):
        custom_metrics = self._get_custom_metrics(metric_uris=metric_uris)
        for metric in custom_metrics.keys():
            try:
                operator = foo.get_operator(metric)
                operator.cleanup(samples, self.config, eval_key)
            except Exception as e:
                logger.warning(
                    "Failed to cleanup metric '%s': Reason: %s",
                    metric,
                    e,
                )

    def get_fields(self, samples, eval_key, include_custom_metrics=True):
        return []

    def add_fields_to_sidebar_group(self, samples, eval_key, omit_fields=None):
        if omit_fields is not None:
            if etau.is_container(omit_fields):
                omit_fields = set(omit_fields)
            else:
                omit_fields = {omit_fields}
        else:
            omit_fields = set()

        fields = self.get_fields(samples, eval_key)

        fields = [f for f in fields if "." not in f and f not in omit_fields]

        samples._add_paths_to_sidebar_group(fields, eval_key)


class BaseEvaluationResults(foe.EvaluationResults):
    """Base class for evaluation results.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`BaseEvaluationMethodConfig` used
        eval_key: the evaluation key
        custom_metrics (None): an optional dict of custom metrics
        backend (None): an :class:`EvaluationMethod` backend
    """

    def __init__(
        self,
        samples,
        config,
        eval_key,
        custom_metrics=None,
        backend=None,
    ):
        super().__init__(samples, config, eval_key, backend=backend)
        self.custom_metrics = custom_metrics

    def add_custom_metrics(self, custom_metrics, overwrite=True):
        """Computes the given custom metrics and adds them to these results.

        Args:
            custom_metrics: a list of custom metrics to compute or a dict
                mapping metric names to kwargs dicts
            overwrite (True): whether to recompute any custom metrics that
                have already been applied
        """
        _custom_metrics = self.config.custom_metrics

        if _custom_metrics is None:
            _custom_metrics = {}

        if isinstance(_custom_metrics, list):
            _custom_metrics = {k: None for k in _custom_metrics}

        if isinstance(custom_metrics, list):
            custom_metrics = {k: None for k in custom_metrics}

        if not overwrite:
            custom_metrics = {
                k: v
                for k, v in custom_metrics.items()
                if k not in _custom_metrics
            }

        if not custom_metrics:
            return

        metric_uris = list(custom_metrics.keys())

        _custom_metrics.update(custom_metrics)
        if all(v is None for v in _custom_metrics.values()):
            _custom_metrics = list(_custom_metrics.keys())

        self.config.custom_metrics = _custom_metrics
        self.save_config()

        self.backend.compute_custom_metrics(
            self.samples, self.key, self, metric_uris=metric_uris
        )
        self.save()

        if self.samples._has_sidebar_group(self.key):
            fields = self.backend.get_custom_metric_fields(
                self.samples, self.key, metric_uris=metric_uris
            )
            self.samples._add_paths_to_sidebar_group(fields, self.key)

    def metrics(self, *args, **kwargs):
        """Returns the metrics associated with this evaluation run.

        Also includes any custom metrics from :attr:`custom_metrics`.

        Args:
            *args: subclass-specific positional arguments
            **kwargs: subclass-specific keyword arguments

        Returns:
            a dict
        """
        return self._get_custom_metrics()

    def print_metrics(self, *args, digits=2, **kwargs):
        """Prints the metrics computed via :meth:`metrics`.

        Args:
            *args: subclass-specific positional arguments
            digits (2): the number of digits of precision to print
            **kwargs: subclass-specific keyword argument
        """
        metrics = self.metrics(*args, **kwargs)
        self._print_metrics(metrics, digits=digits)

    def _get_custom_metrics(self):
        if not self.custom_metrics:
            return {}

        metrics = {}

        try:
            for uri, metric in self.custom_metrics.items():
                metrics[metric["key"]] = metric["value"]
        except Exception as e:
            logger.warning("Failed to parse custom metrics. Reason: %s", e)

        return metrics

    def _print_metrics(self, metrics, digits=2):
        _print_dict_as_table(metrics, digits)


class BaseClassificationResults(BaseEvaluationResults):
    """Base class for evaluation results that expose classification metrics
    like P/R/F1 and confusion matrices.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`fiftyone.core.evaluation.EvaluationMethodConfig`
            used
        eval_key: the evaluation key
        ytrue: a list of ground truth labels
        ypred: a list of predicted labels
        confs (None): an optional list of confidences for the predictions
        weights (None): an optional list of sample weights
        ytrue_ids (None): a list of IDs for the ground truth labels
        ypred_ids (None): a list of IDs for the predicted labels
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used
        missing (None): a missing label string. Any None-valued labels are
            given this label for evaluation purposes
        custom_metrics (None): an optional dict of custom metrics
        backend (None): a :class:`fiftyone.core.evaluation.EvaluationMethod`
            backend
    """

    def __init__(
        self,
        samples,
        config,
        eval_key,
        ytrue,
        ypred,
        confs=None,
        weights=None,
        ytrue_ids=None,
        ypred_ids=None,
        classes=None,
        missing=None,
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

        if missing is None:
            missing = "(none)"

        ytrue, ypred, classes = _parse_labels(ytrue, ypred, classes, missing)

        self.ytrue = np.asarray(ytrue)
        self.ypred = np.asarray(ypred)
        self.confs = np.asarray(confs) if confs is not None else None
        self.weights = np.asarray(weights) if weights is not None else None
        self.ytrue_ids = (
            np.asarray(ytrue_ids) if ytrue_ids is not None else None
        )
        self.ypred_ids = (
            np.asarray(ypred_ids) if ypred_ids is not None else None
        )
        self.classes = np.asarray(classes)
        self.missing = missing

        self._has_subset = False
        self._samples_orig = None
        self._ytrue_orig = None
        self._ypred_orig = None
        self._confs_orig = None
        self._weights_orig = None
        self._ytrue_ids_orig = None
        self._ypred_ids_orig = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        if self.has_subset:
            self.clear_subset()

    @property
    def has_subset(self):
        """Whether these results are currently restricted to a subset via
        :meth:`use_subset`.
        """
        return self._has_subset

    def use_subset(self, subset_def):
        """Restricts the evaluation results to the specified subset.

        Subsequent calls to supported methods on this instance will only
        contain results from the specified subset rather than the full results.

        Use :meth:`clear_subset` to reset to the full results. Or,
        equivalently, use the context manager interface as demonstrated below
        to automatically reset the results when the context exits.

        Example usage::

            import fiftyone as fo
            import fiftyone.zoo as foz
            import fiftyone.utils.random as four
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")
            four.random_split(dataset, {"sunny": 0.7, "cloudy": 0.2, "rainy": 0.1})

            results = dataset.evaluate_detections(
                "predictions",
                gt_field="ground_truth",
                eval_key="eval",
            )

            counts = dataset.count_values("ground_truth.detections.label")
            classes = sorted(counts, key=counts.get, reverse=True)[:5]

            # Full results
            results.print_report(classes=classes)

            # Sunny samples
            subset_def = dict(type="field", field="tags", value="sunny")
            with results.use_subset(subset_def):
                results.print_report(classes=classes)

            # Small objects
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
            small_objects = bbox_area <= 0.05
            subset_def = dict(type="attribute", expr=small_objects)
            with results.use_subset(subset_def):
                results.print_report(classes=classes)

        Args:
            subset_def: the subset definition, which can be:

                -   a dict or list of dicts defining the subset. See above
                    for examples and see :func:`get_subset_view` for full
                    syntax
                -   a :class:`fiftyone.core.view.DatasetView` defining the
                    subset

        Returns:
            self
        """
        if self.ytrue_ids is None:
            raise ValueError(
                "Cannot load subsets for evaluation runs that don't store "
                "label IDs"
            )

        gt_field = self.config.gt_field
        if isinstance(subset_def, foc.SampleCollection):
            subset_view = subset_def
        else:
            subset_view = get_subset_view(self.samples, gt_field, subset_def)

        self._samples_orig = self.samples
        self._ytrue_orig = self.ytrue
        self._ypred_orig = self.ypred
        self._confs_orig = self.confs
        self._weights_orig = self.weights
        self._ytrue_ids_orig = self.ytrue_ids
        self._ypred_ids_orig = self.ypred_ids

        # Locate all ground truth in subset
        _, gt_id_path = subset_view._get_label_field_path(gt_field, "id")
        gt_ids = set(subset_view.values(gt_id_path, unwind=True))
        inds = np.array([_id in gt_ids for _id in self.ytrue_ids])

        # Detection evaluations can contain unmatched predictions, which must
        # also be partitioned into subsets
        if isinstance(self, foue.DetectionResults):
            pred_field = self.config.pred_field
            fp_view = subset_view.filter_labels(
                pred_field, F(self.key) == "fp"
            )
            _, pred_id_path = fp_view._get_label_field_path(pred_field, "id")
            pred_ids = set(fp_view.values(pred_id_path, unwind=True))
            inds |= np.array([_id in pred_ids for _id in self.ypred_ids])

        self._has_subset = True
        self._samples = subset_view
        self.ytrue = self.ytrue[inds]
        self.ypred = self.ypred[inds]
        self.confs = self.confs[inds] if self.confs is not None else None
        self.weights = self.weights[inds] if self.weights is not None else None
        self.ytrue_ids = self.ytrue_ids[inds]
        self.ypred_ids = self.ypred_ids[inds]

        return self

    def clear_subset(self):
        """Clears the subset set by :meth:`use_subset`, if any.

        Subsequent operations will be performed on the full results.
        """
        if not self.has_subset:
            return

        self._samples = self._samples_orig
        self.ytrue = self._ytrue_orig
        self.ypred = self._ypred_orig
        self.confs = self._confs_orig
        self.weights = self._weights_orig
        self.ytrue_ids = self._ytrue_ids_orig
        self.ypred_ids = self._ypred_ids_orig

        self._has_subset = False
        self._samples_orig = None
        self._ytrue_orig = None
        self._ypred_orig = None
        self._confs_orig = None
        self._weights_orig = None
        self._ytrue_ids_orig = None
        self._ypred_ids_orig = None

    def report(self, classes=None):
        """Generates a classification report for the results via
        :func:`sklearn:sklearn.metrics.classification_report`.

        Args:
            classes (None): an optional list of classes to include in the
                report

        Returns:
            a dict
        """
        labels = self._parse_classes(classes)

        if self.ytrue.size == 0 or labels.size == 0:
            d = {}
            empty = {
                "precision": 0.0,
                "recall": 0.0,
                "f1-score": 0.0,
                "support": 0,
            }

            if labels.size > 0:
                for label in labels:
                    d[label] = empty.copy()

            d["micro avg"] = empty.copy()
            d["macro avg"] = empty.copy()
            d["weighted avg"] = empty.copy()
            return d

        return skm.classification_report(
            self.ytrue,
            self.ypred,
            labels=labels,
            sample_weight=self.weights,
            output_dict=True,
            zero_division=0,
        )

    def print_report(self, classes=None, digits=2):
        """Prints a classification report for the results via
        :func:`sklearn:sklearn.metrics.classification_report`.

        Args:
            classes (None): an optional list of classes to include in the
                report
            digits (2): the number of digits of precision to print
        """
        labels = self._parse_classes(classes)

        if labels.size == 0:
            print("No classes to analyze")
            return

        report_str = skm.classification_report(
            self.ytrue,
            self.ypred,
            labels=labels,
            digits=digits,
            sample_weight=self.weights,
            zero_division=0,
        )
        print(report_str)

    def metrics(self, classes=None, average="micro", beta=1.0):
        """Computes classification metrics for the results, including accuracy,
        precision, recall, and F-beta score.

        See :func:`sklearn:sklearn.metrics.precision_recall_fscore_support` for
        details.

        Also includes any custom metrics from :attr:`custom_metrics`.

        Args:
            classes (None): an optional list of classes to include in the
                calculations
            average ("micro"): the averaging strategy to use
            beta (1.0): the F-beta value to use

        Returns:
            a dict
        """
        labels = self._parse_classes(classes)

        accuracy = _compute_accuracy(
            self.ytrue, self.ypred, labels=labels, weights=self.weights
        )

        precision, recall, fscore, _ = skm.precision_recall_fscore_support(
            self.ytrue,
            self.ypred,
            average=average,
            labels=labels,
            beta=beta,
            sample_weight=self.weights,
            zero_division=0,
        )

        support = _compute_support(
            self.ytrue, labels=labels, weights=self.weights
        )

        metrics = {
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "fscore": fscore,
            "support": support,
        }

        metrics.update(self._get_custom_metrics())

        return metrics

    def print_metrics(self, classes=None, average="micro", beta=1.0, digits=2):
        """Prints the metrics computed via :meth:`metrics`.

        Args:
            classes (None): an optional list of classes to include in the
                calculations
            average ("micro"): the averaging strategy to use
            beta (1.0): the F-beta value to use
            digits (2): the number of digits of precision to print
        """
        metrics = self.metrics(classes=classes, average=average, beta=beta)
        self._print_metrics(metrics, digits=digits)

    def confusion_matrix(
        self,
        classes=None,
        include_other=False,
        include_missing=False,
    ):
        """Generates a confusion matrix for the results via
        :func:`sklearn:sklearn.metrics.confusion_matrix`.

        The rows of the confusion matrix represent ground truth and the columns
        represent predictions.

        Args:
            classes (None): an optional list of classes to include in the
                confusion matrix
            include_other (False): whether to include an extra row/column at
                the end of the matrix for labels that do not appear in
                ``classes``. Only applicable if ``classes`` are provided
            include_missing (False): whether to include a row/column at the end
                of the matrix for unmatched labels. Only applicable if
                ``self.missing`` does not already appear in ``classes``. If
                both "other" and "missing" rows/columns are requested, this one
                is last

        Returns:
            a ``num_classes x num_classes`` confusion matrix
        """
        confusion_matrix, _, _ = self._confusion_matrix(
            classes=classes,
            include_other=include_other,
            include_missing=include_missing,
        )
        return confusion_matrix

    def plot_confusion_matrix(
        self,
        classes=None,
        include_other=None,
        include_missing=None,
        other_label="(other)",
        backend="plotly",
        **kwargs,
    ):
        """Plots a confusion matrix for the evaluation results.

        If you are working in a notebook environment with the default plotly
        backend, this method returns an interactive
        :class:`fiftyone.core.plots.plotly.InteractiveHeatmap` that you can
        attach to an App session via its
        :attr:`fiftyone.core.session.Session.plots` attribute, which will
        automatically sync the session's view with the currently selected cells
        in the confusion matrix.

        Args:
            classes (None): an optional list of classes to include in the
                confusion matrix
            include_other (None): whether to include a row/column for examples
                whose label is in ``classes`` but are matched to labels that
                do not appear in ``classes``. Only applicable if ``classes``
                are provided. The supported values are:

                -   None (default): only include a row/column for other labels
                    if there are any
                -   True: do include a row/column for other labels
                -   False: do not include a row/column for other labels
            include_missing (None): whether to include a row/column for missing
                ground truth/predictions in the confusion matrix. The supported
                values are:

                -   None (default): only include a row/column for missing
                    labels if there are any
                -   True: do include a row/column for missing labels
                -   False: do not include a row/column for missing labels
            other_label ("(other)"): the label to use for "other" predictions
            backend ("plotly"): the plotting backend to use. Supported values
                are ``("plotly", "matplotlib")``
            **kwargs: keyword arguments for the backend plotting method:

                -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_confusion_matrix`
                -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_confusion_matrix`

        Returns:
            one of the following:

            -   a :class:`fiftyone.core.plots.plotly.InteractiveHeatmap`, if
                the plotly backend is used
            -   a matplotlib figure, otherwise
        """
        confusion_matrix, labels, ids = self._confusion_matrix(
            classes=classes,
            include_other=include_other,
            include_missing=include_missing,
            other_label=other_label,
            tabulate_ids=True,
        )

        return fop.plot_confusion_matrix(
            confusion_matrix,
            labels,
            ids=ids,
            samples=self.samples,
            eval_key=self.key,
            gt_field=self.config.gt_field,
            pred_field=self.config.pred_field,
            backend=backend,
            **kwargs,
        )

    def _parse_classes(self, classes):
        if classes is not None:
            return np.asarray(classes)

        return np.array([c for c in self.classes if c != self.missing])

    def _confusion_matrix(
        self,
        classes=None,
        include_other=None,
        include_missing=None,
        other_label=None,
        tabulate_ids=False,
    ):
        if classes is not None:
            labels = list(classes)
        else:
            labels = list(self.classes)
            include_other = False

        if include_other != False and other_label not in labels:
            added_other = True
            labels.append(other_label)
        else:
            added_other = False

        if include_missing != False and self.missing not in labels:
            added_missing = True
            labels.append(self.missing)
        else:
            added_missing = False

        if include_other != False:
            labels_set = set(labels + [self.missing])
            ypred = [y if y in labels_set else other_label for y in self.ypred]
            ytrue = [y if y in labels_set else other_label for y in self.ytrue]
        else:
            ypred = self.ypred
            ytrue = self.ytrue

        cmat, ids = _compute_confusion_matrix(
            ytrue,
            ypred,
            labels,
            weights=self.weights,
            ytrue_ids=self.ytrue_ids,
            ypred_ids=self.ypred_ids,
            tabulate_ids=tabulate_ids,
        )

        if added_other:
            # Omit `(other, other)`
            i = labels.index(other_label)
            cmat[i, i] = 0
            if tabulate_ids:
                ids[i, i] = []

            if added_missing:
                # Omit `(other, missing)` and `(missing, other)`
                j = labels.index(self.missing)
                cmat[i, j] = 0
                cmat[j, i] = 0
                if tabulate_ids:
                    ids[i, j] = []
                    ids[j, i] = []

        rm_inds = []

        if include_other == None:
            idx = labels.index(other_label)
            if not any(cmat[:, idx]) and not any(cmat[idx, :]):
                rm_inds.append(idx)

        if include_missing == None:
            idx = labels.index(self.missing)
            if not any(cmat[:, idx]) and not any(cmat[idx, :]):
                rm_inds.append(idx)

        if rm_inds:
            cmat = np.delete(np.delete(cmat, rm_inds, axis=0), rm_inds, axis=1)
            if tabulate_ids:
                ids = np.delete(
                    np.delete(ids, rm_inds, axis=0), rm_inds, axis=1
                )
            labels = [l for i, l in enumerate(labels) if i not in rm_inds]

        return cmat, labels, ids

    @classmethod
    def _from_dict(cls, d, samples, config, eval_key, **kwargs):
        ytrue = d["ytrue"]
        ypred = d["ypred"]
        confs = d.get("confs", None)
        weights = d.get("weights", None)
        ytrue_ids = d.get("ytrue_ids", None)
        ypred_ids = d.get("ypred_ids", None)
        classes = d.get("classes", None)
        missing = d.get("missing", None)
        return cls(
            samples,
            config,
            eval_key,
            ytrue,
            ypred,
            confs=confs,
            weights=weights,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            classes=classes,
            missing=missing,
            **kwargs,
        )


def _parse_labels(ytrue, ypred, classes, missing):
    if classes is None:
        classes = set(ytrue) | set(ypred)
        classes.discard(None)
        classes = sorted(classes)
    else:
        classes = list(classes)

    ytrue = [y if y is not None else missing for y in ytrue]
    ypred = [y if y is not None else missing for y in ypred]

    return ytrue, ypred, classes


def _compute_accuracy(ytrue, ypred, labels=None, weights=None):
    if labels is not None:
        labels = set(labels)
        found = np.array(
            [yt in labels or yp in labels for yt, yp in zip(ytrue, ypred)],
            dtype=bool,
        )
        ytrue = ytrue[found]
        ypred = ypred[found]
        if weights is not None:
            weights = weights[found]

    if ytrue.size > 0:
        scores = ytrue == ypred
        if weights is not None:
            try:
                accuracy = np.sum(weights * scores) / np.sum(weights)
            except ZeroDivisionError:
                accuracy = 0.0
        else:
            accuracy = np.mean(scores)
    else:
        accuracy = 0.0

    return accuracy


def _compute_support(ytrue, labels=None, weights=None):
    if labels is not None:
        labels = set(labels)
        found = np.array([y in labels for y in ytrue], dtype=bool)
        ytrue = ytrue[found]
        if weights is not None:
            weights = weights[found]

    if weights is not None:
        support = np.sum(weights)
    else:
        support = ytrue.size

    return support


def _compute_confusion_matrix(
    ytrue,
    ypred,
    labels,
    weights=None,
    ytrue_ids=None,
    ypred_ids=None,
    tabulate_ids=False,
):
    ytrue = np.asarray(ytrue).flatten()
    ypred = np.asarray(ypred).flatten()
    labels = np.asarray(labels)

    if weights is None:
        weights = np.ones(ytrue.size, dtype=int)
    else:
        weights = np.asarray(weights).flatten()

    if weights.dtype.kind in {"i", "u", "b"}:
        dtype = np.int64
    else:
        dtype = np.float64

    num_labels = labels.size

    confusion_matrix = np.zeros((num_labels, num_labels), dtype=dtype)

    if tabulate_ids:
        ids = np.empty((num_labels, num_labels), dtype=object)
        for i in range(num_labels):
            for j in range(num_labels):
                ids[i, j] = []
    else:
        ytrue_ids = None
        ypred_ids = None
        ids = None

    if num_labels == 0 or ytrue.size == 0:
        return confusion_matrix, ids

    labels_to_inds = {label: idx for idx, label in enumerate(labels)}
    ypred = np.array([labels_to_inds.get(y, -1) for y in ypred])
    ytrue = np.array([labels_to_inds.get(y, -1) for y in ytrue])

    found = np.logical_and(ypred >= 0, ytrue >= 0)
    ypred = ypred[found]
    ytrue = ytrue[found]
    weights = weights[found]

    if ytrue_ids is not None:
        ytrue_ids = ytrue_ids[found]
    else:
        ytrue_ids = itertools.repeat(None)

    if ypred_ids is not None:
        ypred_ids = ypred_ids[found]
    else:
        ypred_ids = itertools.repeat(None)

    for yt, yp, w, it, ip in zip(ytrue, ypred, weights, ytrue_ids, ypred_ids):
        confusion_matrix[yt, yp] += w

        if it is not None:
            ids[yt, yp].append(it)

        if ip is not None:
            ids[yt, yp].append(ip)

    return confusion_matrix, ids


def _print_dict_as_table(d, digits):
    fmt = "%%.%df" % digits
    records = []
    for k, v in d.items():
        k = k.replace("_", " ")
        if isinstance(v, numbers.Integral):
            v = str(v)
        elif isinstance(v, numbers.Number):
            v = fmt % v
        else:
            v = str(v)

        records.append((k, v))

    print(tabulate(records, tablefmt="plain", numalign="left"))
