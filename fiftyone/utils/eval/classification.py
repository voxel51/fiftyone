"""
Classification evaluation.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import warnings

import matplotlib.pyplot as plt
import numpy as np
import sklearn.metrics as skm

import fiftyone.core.aggregations as foa
import fiftyone.core.evaluation as foe
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof


def evaluate_classifications(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_key=None,
    classes=None,
    missing="none",
    method="simple",
    config=None,
    **kwargs,
):
    """Evaluates the classification predictions in the given collection with
    respect to the specified ground truth labels.

    By default, this method simply compares the ground truth and prediction for
    each sample, but other strategies such as binary evaluation and top-k
    matching can be configured via the ``method`` and ``config`` parameters.

    If an ``eval_key`` is specified, then this method will record some
    statistics on each sample:

    -   When evaluating sample-level fields, an ``eval_key`` field will be
        populated on each sample recording whether that sample's prediction is
        correct.

    -   When evaluating frame-level fields, an ``eval_key`` field will be
        populated on each frame recording whether that frame's prediction is
        correct. In addition, an ``eval_key`` field will be populated on each
        sample that records the average accuracy of the frame predictions of
        the sample.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Classification` instances
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Classification` instances
        eval_key (None): an evaluation key to use to refer to this evaluation
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used for results
            purposes
        missing ("none"): a missing label string. Any None-valued labels are
            given this label for results purposes
        method ("simple"): a string specifying the evaluation method to use.
            Supported values are ``("simple", "binary", "top-k")``
        config (None): an :class:`ClassificationEvaluationConfig` specifying
            the evaluation method to use. If a ``config`` is provided, the
            ``method`` and ``kwargs`` parameters are ignored
        **kwargs: optional keyword arguments for the constructor of the
            :class:`ClassificationEvaluationConfig` being used

    Returns:
        a :class:`ClassificationResults`
    """
    config = _parse_config(config, pred_field, gt_field, method, **kwargs)
    eval_method = config.build()
    eval_method.register_run(samples, eval_key)
    return eval_method.evaluate_samples(
        samples, eval_key=eval_key, classes=classes, missing=missing,
    )


class ClassificationEvaluationConfig(foe.EvaluationMethodConfig):
    """Base class for configuring :class:`ClassificationEvaluation`
    instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Classification` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Classification` instances
    """

    def __init__(self, pred_field, gt_field, **kwargs):
        super().__init__(**kwargs)
        self.pred_field = pred_field
        self.gt_field = gt_field


class ClassificationEvaluation(foe.EvaluationMethod):
    """Base class for classification evaluation methods.

    Args:
        config: a :class:`ClassificationEvaluationConfig`
    """

    def evaluate_samples(
        self, samples, eval_key=None, classes=None, missing=None
    ):
        """Evaluates the predicted classifications in the given samples with
        respect to the specified ground truth labels.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key (None): an evaluation key for this evaluation
            classes (None): the list of possible classes. If not provided, the
                observed ground truth/predicted labels are used for results
                purposes
            missing ("none"): a missing label string. Any None-valued labels
                are given this label for results purposes

        Returns:
            a :class:`ClassificationResults` instance
        """
        raise NotImplementedError("subclass must implement evaluate_samples()")

    def get_fields(self, samples, eval_key):
        fields = [eval_key]
        if samples._is_frame_field(self.config.gt_field):
            fields.append(samples._FRAMES_PREFIX + eval_key)

        return fields

    def cleanup(self, samples, eval_key):
        samples._dataset.delete_sample_field(eval_key, error_level=1)
        if samples._is_frame_field(self.config.gt_field):
            samples._dataset.delete_frame_field(eval_key, error_level=1)

    def _validate_run(self, samples, eval_key, existing_info):
        self._validate_fields_match(eval_key, "pred_field", existing_info)
        self._validate_fields_match(eval_key, "gt_field", existing_info)


class SimpleEvaluationConfig(ClassificationEvaluationConfig):
    """Simple classification evaluation config.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Classification` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Classification` instances
    """

    @property
    def method(self):
        return "simple"


class SimpleEvaluation(ClassificationEvaluation):
    """Standard classification evaluation.

    Args:
        config: a :class:`SimpleClassificationEvaluationConfig`
    """

    def evaluate_samples(
        self, samples, eval_key=None, classes=None, missing=None
    ):
        pred_field = self.config.pred_field
        gt_field = self.config.gt_field
        is_frame_field = samples._is_frame_field(gt_field)

        gt = gt_field + ".label"
        pred = pred_field + ".label"
        pred_conf = pred_field + ".confidence"

        ytrue, ypred, confs = samples.aggregate(
            [foa.Values(gt), foa.Values(pred), foa.Values(pred_conf)]
        )

        if is_frame_field:
            ytrue = list(itertools.chain.from_iterable(ytrue))
            ypred = list(itertools.chain.from_iterable(ypred))
            confs = list(itertools.chain.from_iterable(confs))

        results = ClassificationResults(
            ytrue, ypred, confs, classes=classes, missing=missing
        )

        if eval_key is None:
            return results

        if is_frame_field:
            eval_frame = samples._FRAMES_PREFIX + eval_key
            gt = gt[len(samples._FRAMES_PREFIX) :]
            pred = pred[len(samples._FRAMES_PREFIX) :]

            # Sample-level accuracies
            samples._add_field_if_necessary(eval_key, fof.FloatField)
            samples.set_field(
                eval_key,
                F("frames").map((F(gt) == F(pred)).to_double()).mean(),
            ).save(eval_key)

            # Per-frame accuracies
            samples._add_field_if_necessary(eval_frame, fof.BooleanField)
            samples.set_field(eval_frame, F(gt) == F(pred)).save(eval_frame)
        else:
            # Per-sample accuracies
            samples._add_field_if_necessary(eval_key, fof.BooleanField)
            samples.set_field(eval_key, F(gt) == F(pred)).save(eval_key)

        return results


class TopKEvaluationConfig(ClassificationEvaluationConfig):
    """Top-k classification evaluation config.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Classification` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Classification` instances
        k (5): the top-k value to use when assessing accuracy
    """

    def __init__(self, pred_field, gt_field, k=5, **kwargs):
        super().__init__(pred_field, gt_field, **kwargs)
        self.k = k

    @property
    def method(self):
        return "top-k"


class TopKEvaluation(ClassificationEvaluation):
    """Top-k classification evaluation.

    This method requires the ``logits`` field of each predicted object to be
    populated, and the list of class labels corresponding to these logits must
    be provided.

    Args:
        config: a :class:`TopKEvaluationConfig`
    """

    def evaluate_samples(
        self, samples, eval_key=None, classes=None, missing=None
    ):
        if classes is None:
            raise ValueError(
                "You must provide the list of classes corresponding to your "
                "logits in order to run top-k classification evaluation"
            )

        pred_field = self.config.pred_field
        gt_field = self.config.gt_field
        is_frame_field = samples._is_frame_field(gt_field)
        k = self.config.k

        # This extracts a potentially huge number of logits
        # @todo consider sample iteration for very large datasets
        ytrue, ypred, logits = samples.aggregate(
            [
                foa.Values(gt_field + ".label"),
                foa.Values(pred_field + ".label"),
                foa.Values(pred_field + ".logits"),
            ]
        )

        targets_map = {label: idx for idx, label in enumerate(classes)}

        if is_frame_field:
            confs = []
            correct = []
            for _ytrue, _ypred, _logits in zip(ytrue, ypred, logits):
                _confs, _correct = _evaluate_top_k(
                    _ytrue, _ypred, _logits, k, targets_map
                )
                confs.append(_confs)
                correct.append(_correct)

            ytrue = list(itertools.chain.from_iterable(ytrue))
            ypred = list(itertools.chain.from_iterable(ypred))
            confs = list(itertools.chain.from_iterable(confs))
        else:
            confs, correct = _evaluate_top_k(
                ytrue, ypred, logits, k, targets_map
            )

        results = ClassificationResults(
            ytrue, ypred, confs, classes=classes, missing=missing
        )

        if eval_key is None:
            return results

        if is_frame_field:
            eval_frame = samples._FRAMES_PREFIX + eval_key

            # Sample-level accuracies
            samples._add_field_if_necessary(eval_key, fof.FloatField)
            samples.set_values(eval_key, [np.mean(c) for c in correct])

            # Per-frame accuracies
            samples._add_field_if_necessary(eval_frame, fof.BooleanField)
            samples.set_values(eval_frame, correct)
        else:
            # Per-sample accuracies
            samples._add_field_if_necessary(eval_key, fof.BooleanField)
            samples.set_values(eval_key, correct)

        return results


def _evaluate_top_k(ytrue, ypred, logits, k, targets_map):
    confs = []
    correct = []
    for idx, (_ytrue, _logits) in enumerate(zip(ytrue, logits)):
        if _logits is None:
            # No logits; no prediction
            ypred[idx] = None
            _conf = None
            _correct = False
            msg = (
                "Found sample(s) with no logits. Logits are required to "
                + "compute top-k accuracy"
            )
            warnings.warn(msg)
        else:
            target = targets_map[_ytrue]
            top_k = np.argpartition(_logits, -k)[-k:]
            if target in top_k:
                # Truth is in top-k; use it
                ypred[idx] = _ytrue
                logit = _logits[target]
                _correct = True
            elif ypred[idx] is not None:
                # Truth is not in top-k; retain actual prediction
                logit = _logits[targets_map[ypred[idx]]]
                _correct = False
            else:
                logit = -np.inf
                _correct = False

            _conf = np.exp(logit) / np.sum(np.exp(_logits))

        confs.append(_conf)
        correct.append(_correct)

    return confs, correct


class BinaryEvaluationConfig(ClassificationEvaluationConfig):
    """Binary evaluation config.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Classification` instances
        gt_field: the name of the field containing the ground truth
    """

    @property
    def method(self):
        return "binary"


class BinaryEvaluation(ClassificationEvaluation):
    """Binary classification evaluation.

    Evaluates the binary classification predictions in the given collection
    with respect to the specified ground truth labels.

    Any missing ground truth or prediction labels are assumed to be examples of
    the negative class (with zero confidence, for predictions).

    If an ``eval_key`` is specified, this method will record the TP/FP/FN/TN
    status of each prediction in this field.

    This method requires that the ``(neg_label, pos_label)`` label strings for
    the task are provided via the ``classes`` argument.

    Args:
        config: a :class:`BinaryEvaluationConfig`
    """

    def evaluate_samples(
        self, samples, eval_key=None, classes=None, missing=None
    ):
        if classes is None or len(classes) != 2:
            raise ValueError(
                "You must provide the ``(neg_label, pos_label)`` labels for "
                "your task via the ``classes`` argument in order to run "
                "binary evaluation"
            )

        pred_field = self.config.pred_field
        gt_field = self.config.gt_field
        is_frame_field = samples._is_frame_field(gt_field)

        pos_label = classes[-1]

        gt = gt_field + ".label"
        pred = pred_field + ".label"
        pred_conf = pred_field + ".confidence"

        ytrue, ypred, confs = samples.aggregate(
            [foa.Values(gt), foa.Values(pred), foa.Values(pred_conf)]
        )

        if is_frame_field:
            ytrue = list(itertools.chain.from_iterable(ytrue))
            ypred = list(itertools.chain.from_iterable(ypred))
            confs = list(itertools.chain.from_iterable(confs))

        results = BinaryClassificationResults(ytrue, ypred, confs, classes)

        if eval_key is None:
            return results

        if is_frame_field:
            eval_frame = samples._FRAMES_PREFIX + eval_key
            gt = gt[len(samples._FRAMES_PREFIX) :]
            pred = pred[len(samples._FRAMES_PREFIX) :]

            # Sample-level accuracies
            samples._add_field_if_necessary(eval_key, fof.FloatField)
            samples.set_field(
                eval_key,
                F("frames").map((F(gt) == F(pred)).to_double()).mean(),
            ).save(eval_key)

            # Per-frame accuracies
            samples._add_field_if_necessary(eval_frame, fof.StringField)
            samples.set_field(
                eval_frame,
                F().switch(
                    {
                        (F(gt) == pos_label) & (F(pred) == pos_label): "TP",
                        (F(gt) == pos_label) & (F(pred) != pos_label): "FN",
                        (F(gt) != pos_label) & (F(pred) != pos_label): "TN",
                        (F(gt) != pos_label) & (F(pred) == pos_label): "FP",
                    }
                ),
            ).save(eval_frame)
        else:
            # Per-sample accuracies
            samples._add_field_if_necessary(eval_key, fof.StringField)
            samples.set_field(
                eval_key,
                F().switch(
                    {
                        (F(gt) == pos_label) & (F(pred) == pos_label): "TP",
                        (F(gt) == pos_label) & (F(pred) != pos_label): "FN",
                        (F(gt) != pos_label) & (F(pred) != pos_label): "TN",
                        (F(gt) != pos_label) & (F(pred) == pos_label): "FP",
                    }
                ),
            ).save(eval_key)

        return results


class ClassificationResults(foe.EvaluationResults):
    """Class that stores the results of a classification evaluation.

    Args:
        ytrue: a list of ground truth labels
        ypred: a list of predicted labels
        confs: a list of confidences for the predictions
        weights (None): an optional list of sample weights
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used
        missing ("none"): a missing label string. Any None-valued labels are
            given this label for evaluation purposes
    """

    def __init__(
        self, ytrue, ypred, confs, weights=None, classes=None, missing="none"
    ):
        ytrue, ypred, classes = _parse_labels(ytrue, ypred, classes, missing)

        self.ytrue = ytrue
        self.ypred = ypred
        self.confs = confs
        self.weights = weights
        self.classes = classes
        self.missing = missing

    def _get_labels(self, classes):
        if classes is not None:
            return classes

        return [c for c in self.classes if c != self.missing]

    def report(self, classes=None):
        """Generates a classification report for the results via
        ``sklearn.metrics.classification_report``.

        Args:
            classes (None): an optional list of classes for which to compute
                metrics

        Returns:
            a dict
        """
        labels = self._get_labels(classes)
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

        See ``sklearn.metrics.accuracy_score`` and
        ``sklearn.metrics.precision_recall_fscore_support`` for details.

        Args:
            classes (None): an optional list of classes for which to compute
                metrics
            average ("micro"): the averaging strategy to use
            beta (1.0): the F-beta value to use

        Returns:
            a dict
        """
        labels = self._get_labels(classes)

        try:
            accuracy = skm.accuracy_score(
                self.ytrue,
                self.ypred,
                normalize=True,
                sample_weight=self.weights,
            )
        except ZeroDivisionError:
            accuracy = 0.0

        precision, recall, fscore, _ = skm.precision_recall_fscore_support(
            self.ytrue,
            self.ypred,
            average=average,
            labels=labels,
            beta=beta,
            sample_weight=self.weights,
            zero_division=0,
        )

        return {
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "fscore": fscore,
        }

    def print_report(self, classes=None, digits=2):
        """Prints a classification report for the results via
        ``sklearn.metrics.classification_report``.

        Args:
            classes (None): an optional list of classes for which to compute
                metrics
            digits (2): the number of digits of precision to print
        """
        labels = self._get_labels(classes)
        report_str = skm.classification_report(
            self.ytrue,
            self.ypred,
            labels=labels,
            digits=digits,
            sample_weight=self.weights,
            zero_division=0,
        )
        print(report_str)

    def confusion_matrix(self, classes=None):
        """Generates a confusion matrix for the results via
        ``sklearn.metrics.confusion_matrix``.

        The rows of the confusion matrix represent ground truth and the columns
        represent predictions.

        Args:
            classes (None): an optional list of classes to include in the
                confusion matrix

        Returns:
            a ``num_classes x num_classes`` array containing integer counts
        """
        labels = self._get_labels(classes)
        return skm.confusion_matrix(
            self.ytrue, self.ypred, labels=labels, sample_weight=self.weights
        )

    def plot_confusion_matrix(
        self,
        classes=None,
        include_values=True,
        cmap="viridis",
        xticks_rotation=45.0,
        ax=None,
        figsize=None,
        block=False,
        return_ax=False,
        **kwargs,
    ):
        """Plots a confusion matrix for the results.

        Args:
            classes (None): an optional list of classes to include in the
                confusion matrix
            include_values (True): whether to include count values in the
                confusion matrix cells
            cmap ("viridis"): a colormap recognized by ``matplotlib``
            xticks_rotation (45.0): a rotation for the x-tick labels. Can be
                numeric degrees, or "vertical" or "horizontal"
            ax (None): an optional matplotlib axis to plot in
            figsize (None): an optional ``(width, height)`` for the figure, in
                inches
            block (False): whether to block execution when the plot is
                displayed via ``matplotlib.pyplot.show(block=block)``
            return_ax (False): whether to return the matplotlib axis containing
                the plot
            **kwargs: optional keyword arguments for
                ``sklearn.metrics.ConfusionMatrixDisplay.plot(**kwargs)``

        Returns:
            the matplotlib axis containing the plot
        """
        classes = self._get_labels(classes)
        confusion_matrix = self.confusion_matrix(classes=classes)
        display = skm.ConfusionMatrixDisplay(
            confusion_matrix=confusion_matrix, display_labels=classes,
        )
        display.plot(
            include_values=include_values,
            cmap=cmap,
            xticks_rotation=xticks_rotation,
            ax=ax,
            **kwargs,
        )
        if figsize is not None:
            display.figure_.set_size_inches(*figsize)

        plt.tight_layout()
        plt.show(block=block)
        return display.ax_ if return_ax else None


class BinaryClassificationResults(ClassificationResults):
    """Class that stores the results of a binary classification evaluation.

    Any missing ground truth or prediction labels are assumed to be examples of
    the negative class (with zero confidence, for predictions).

    Args:
        ytrue: a list of ground truth labels
        ypred: a list of predicted labels
        confs: a list of confidences for the predictions
        classes: the ``(neg_label, pos_label)`` label strings for the task
        weights (None): an optional list of sample weights
    """

    def __init__(self, ytrue, ypred, confs, classes, weights=None):
        super().__init__(
            ytrue,
            ypred,
            confs,
            weights=weights,
            classes=classes,
            missing=classes[0],
        )
        self._pos_label = classes[1]
        self.scores = _to_binary_scores(ypred, confs, self._pos_label)

    def _get_labels(self, classes):
        if classes is not None:
            return classes

        return self.classes

    def average_precision(self, average="micro"):
        """Computes the average precision for the results via
        ``sklearn.metrics.average_precision_score``.

        Args:
            average ("micro"): the averaging strategy to use

        Returns:
            the average precision
        """
        return skm.average_precision_score(
            self.ytrue,
            self.scores,
            pos_label=self._pos_label,
            average=average,
            sample_weight=self.weights,
        )

    def plot_pr_curve(
        self,
        average="micro",
        ax=None,
        figsize=None,
        block=False,
        return_ax=False,
        **kwargs,
    ):
        """Plots a precision-recall (PR) curve for the results.

        Args:
            average ("micro"): the averaging strategy to use when computing
                average precision
            ax (None): an optional matplotlib axis to plot in
            figsize (None): an optional ``(width, height)`` for the figure, in
                inches
            block (False): whether to block execution when the plot is
                displayed via ``matplotlib.pyplot.show(block=block)``
            return_ax (False): whether to return the matplotlib axis containing
                the plot
            **kwargs: optional keyword arguments for
                ``sklearn.metrics.PrecisionRecallDisplay.plot(**kwargs)``

        Returns:
            the matplotlib axis containing the plot
        """
        precision, recall, _ = skm.precision_recall_curve(
            self.ytrue,
            self.scores,
            pos_label=self._pos_label,
            sample_weight=self.weights,
        )
        avg_precision = self.average_precision(average=average)
        display = skm.PrecisionRecallDisplay(
            precision=precision, recall=recall
        )

        label = "AP = %.2f" % avg_precision
        display.plot(ax=ax, label=label, **kwargs)
        if figsize is not None:
            display.figure_.set_size_inches(*figsize)

        plt.show(block=block)
        return display.ax_ if return_ax else None

    def plot_roc_curve(
        self, ax=None, figsize=None, block=False, return_ax=False, **kwargs
    ):
        """Plots a receiver operating characteristic (ROC) curve for the
        results.

        Args:
            ax (None): an optional matplotlib axis to plot in
            figsize (None): an optional ``(width, height)`` for the figure, in
                inches
            block (False): whether to block execution when the plot is
                displayed via ``matplotlib.pyplot.show(block=block)``
            return_ax (False): whether to return the matplotlib axis containing
                the plot
            **kwargs: optional keyword arguments for
                ``sklearn.metrics.RocCurveDisplay.plot(**kwargs)``

        Returns:
            the matplotlib axis containing the plot
        """
        fpr, tpr, _ = skm.roc_curve(
            self.ytrue,
            self.scores,
            pos_label=self._pos_label,
            sample_weight=self.weights,
        )
        roc_auc = skm.auc(fpr, tpr)
        display = skm.RocCurveDisplay(fpr=fpr, tpr=tpr, roc_auc=roc_auc)
        display.plot(ax=ax, **kwargs)
        if figsize is not None:
            display.figure_.set_size_inches(*figsize)

        plt.show(block=block)
        return display.ax_ if return_ax else None


def _parse_config(config, pred_field, gt_field, method, **kwargs):
    if config is not None:
        return config

    if method is None:
        method = "simple"

    if method == "simple":
        return SimpleEvaluationConfig(pred_field, gt_field, **kwargs)

    if method == "binary":
        return BinaryEvaluationConfig(pred_field, gt_field, **kwargs)

    if method == "top-k":
        return TopKEvaluationConfig(pred_field, gt_field, **kwargs)

    raise ValueError("Unsupported evaluation method '%s'" % method)


def _parse_labels(ytrue, ypred, classes, missing):
    if classes is None:
        classes = set(ytrue) | set(ypred)
        classes.discard(None)
        classes = sorted(classes)
    else:
        classes = list(classes)

    ytrue, found_missing_true = _clean_labels(ytrue, missing)
    ypred, found_missing_pred = _clean_labels(ypred, missing)

    found_missing = found_missing_true or found_missing_pred
    if found_missing and missing not in classes:
        classes.append(missing)

    return ytrue, ypred, classes


def _clean_labels(y, missing):
    found_missing = False

    yclean = []
    for yi in y:
        if yi is None:
            found_missing = True
            yi = missing

        yclean.append(yi)

    return yclean, found_missing


def _to_binary_scores(y, confs, pos_label):
    scores = []
    for yi, conf in zip(y, confs):
        if conf is None:
            conf = 0.0

        score = conf if yi == pos_label else 1.0 - conf
        scores.append(score)

    return scores
