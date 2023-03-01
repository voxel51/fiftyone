"""
Base evaluation methods.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools

import numpy as np
import sklearn.metrics as skm

import fiftyone.core.evaluation as foe
import fiftyone.core.plots as fop


class BaseEvaluationResults(foe.EvaluationResults):
    """Base class for evaluation results.

    Args:
        ytrue: a list of ground truth labels
        ypred: a list of predicted labels
        confs (None): an optional list of confidences for the predictions
        weights (None): an optional list of sample weights
        eval_key (None): the evaluation key of the evaluation
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        ytrue_ids (None): a list of IDs for the ground truth labels
        ypred_ids (None): a list of IDs for the predicted labels
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used
        missing (None): a missing label string. Any None-valued labels are
            given this label for evaluation purposes
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            for which the results were computed
    """

    def __init__(
        self,
        ytrue,
        ypred,
        confs=None,
        weights=None,
        eval_key=None,
        gt_field=None,
        pred_field=None,
        ytrue_ids=None,
        ypred_ids=None,
        classes=None,
        missing=None,
        samples=None,
    ):
        if missing is None:
            missing = "(none)"

        ytrue, ypred, classes = _parse_labels(ytrue, ypred, classes, missing)

        self.ytrue = np.asarray(ytrue)
        self.ypred = np.asarray(ypred)
        self.confs = np.asarray(confs) if confs is not None else None
        self.weights = np.asarray(weights) if weights is not None else None
        self.eval_key = eval_key
        self.gt_field = gt_field
        self.pred_field = pred_field
        self.ytrue_ids = (
            np.asarray(ytrue_ids) if ytrue_ids is not None else None
        )
        self.ypred_ids = (
            np.asarray(ypred_ids) if ypred_ids is not None else None
        )
        self.classes = np.asarray(classes)
        self.missing = missing

        self._samples = samples

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

    def metrics(self, classes=None, average="micro", beta=1.0):
        """Computes classification metrics for the results, including accuracy,
        precision, recall, and F-beta score.

        See :func:`sklearn:sklearn.metrics.precision_recall_fscore_support` for
        details.

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

        return {
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "fscore": fscore,
            "support": support,
        }

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

    def confusion_matrix(self, classes=None, include_other=False):
        """Generates a confusion matrix for the results via
        :func:`sklearn:sklearn.metrics.confusion_matrix`.

        The rows of the confusion matrix represent ground truth and the columns
        represent predictions.

        Args:
            classes (None): an optional list of classes to include in the
                confusion matrix. Include ``self.missing`` in this list if you
                would like to include a row/column for unmatched examples
            include_other (False): whether to include an extra row/column at
                the end of the matrix for labels that do not appear in
                ``classes``. Only applicable if ``classes`` are provided

        Returns:
            a ``num_classes x num_classes`` confusion matrix
        """
        confusion_matrix, _, _ = self._confusion_matrix(
            classes=classes, include_other=include_other, include_missing=False
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
            samples=self._samples,
            eval_key=self.eval_key,
            gt_field=self.gt_field,
            pred_field=self.pred_field,
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
            ids[i, i] = []

            if added_missing:
                # Omit `(other, missing)` and `(missing, other)`
                j = labels.index(self.missing)
                cmat[i, j] = 0
                cmat[j, i] = 0
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
            ids = np.delete(np.delete(ids, rm_inds, axis=0), rm_inds, axis=1)
            labels = [l for i, l in enumerate(labels) if i not in rm_inds]

        return cmat, labels, ids

    @classmethod
    def _from_dict(cls, d, samples, config, **kwargs):
        ytrue = d["ytrue"]
        ypred = d["ypred"]
        confs = d.get("confs", None)
        weights = d.get("weights", None)
        eval_key = d.get("eval_key", None)
        gt_field = d.get("gt_field", None)
        pred_field = d.get("pred_field", None)
        ytrue_ids = d.get("ytrue_ids", None)
        ypred_ids = d.get("ypred_ids", None)
        classes = d.get("classes", None)
        missing = d.get("missing", None)
        return cls(
            ytrue,
            ypred,
            confs=confs,
            weights=weights,
            eval_key=eval_key,
            gt_field=gt_field,
            pred_field=pred_field,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            classes=classes,
            missing=missing,
            samples=samples,
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
