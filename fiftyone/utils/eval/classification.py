"""
Classification evaluation.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import warnings

import numpy as np
import sklearn.metrics as skm

import fiftyone.core.evaluation as foe
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.plots as fop
import fiftyone.core.validation as fov


def evaluate_classifications(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_key=None,
    classes=None,
    missing=None,
    method="simple",
    **kwargs,
):
    """Evaluates the classification predictions in the given collection with
    respect to the specified ground truth labels.

    By default, this method simply compares the ground truth and prediction
    for each sample, but other strategies such as binary evaluation and
    top-k matching can be configured via the ``method`` parameter.

    You can customize the evaluation method by passing additional
    parameters for the method's config class as ``kwargs``.

    The supported ``method`` values and their associated configs are:

    -   ``"simple"``: :class:`SimpleEvaluationConfig`
    -   ``"top-k"``: :class:`TopKEvaluationConfig`
    -   ``"binary"``: :class:`BinaryEvaluationConfig`

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
        classes (None): the list of possible classes. If not provided, classes
            are loaded from :meth:`fiftyone.core.dataset.Dataset.classes` or
            :meth:`fiftyone.core.dataset.Dataset.default_classes` if
            possible, or else the observed ground truth/predicted labels are
            used
        missing (None): a missing label string. Any None-valued labels are
            given this label for results purposes
        method ("simple"): a string specifying the evaluation method to use.
            Supported values are ``("simple", "binary", "top-k")``
        **kwargs: optional keyword arguments for the constructor of the
            :class:`ClassificationEvaluationConfig` being used

    Returns:
        a :class:`ClassificationResults`
    """
    fov.validate_collection_label_fields(
        samples, (pred_field, gt_field), fol.Classification, same_type=True
    )

    if classes is None:
        if pred_field in samples.classes:
            classes = samples.classes[pred_field]
        elif gt_field in samples.classes:
            classes = samples.classes[gt_field]
        elif samples.default_classes:
            classes = samples.default_classes

    config = _parse_config(pred_field, gt_field, method, **kwargs)
    eval_method = config.build()
    eval_method.register_run(samples, eval_key)

    results = eval_method.evaluate_samples(
        samples, eval_key=eval_key, classes=classes, missing=missing
    )
    eval_method.save_run_results(samples, eval_key, results)

    return results


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
            missing (None): a missing label string. Any None-valued labels are
                given this label for results purposes

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
        gt_id = gt_field + ".id"
        pred = pred_field + ".label"
        pred_id = pred_field + ".id"
        pred_conf = pred_field + ".confidence"

        ytrue, ytrue_ids, ypred, ypred_ids, confs = samples.values(
            [gt, gt_id, pred, pred_id, pred_conf]
        )

        if is_frame_field:
            ytrue = list(itertools.chain.from_iterable(ytrue))
            ytrue_ids = list(itertools.chain.from_iterable(ytrue_ids))
            ypred = list(itertools.chain.from_iterable(ypred))
            ypred_ids = list(itertools.chain.from_iterable(ypred_ids))
            confs = list(itertools.chain.from_iterable(confs))

        results = ClassificationResults(
            ytrue,
            ypred,
            confs=confs,
            gt_field=gt_field,
            pred_field=pred_field,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            classes=classes,
            missing=missing,
            samples=samples,
        )

        if eval_key is None:
            return results

        # note: fields are manually declared so they'll exist even when
        # `samples` is empty
        dataset = samples._dataset
        if is_frame_field:
            eval_frame = samples._FRAMES_PREFIX + eval_key
            gt = gt[len(samples._FRAMES_PREFIX) :]
            pred = pred[len(samples._FRAMES_PREFIX) :]

            # Sample-level accuracies
            dataset._add_sample_field_if_necessary(eval_key, fof.FloatField)
            samples.set_field(
                eval_key,
                F("frames").map((F(gt) == F(pred)).to_double()).mean(),
            ).save(eval_key)

            # Per-frame accuracies
            dataset._add_frame_field_if_necessary(eval_key, fof.BooleanField)
            samples.set_field(eval_frame, F(gt) == F(pred)).save(eval_frame)
        else:
            # Per-sample accuracies
            dataset._add_sample_field_if_necessary(eval_key, fof.BooleanField)
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
        # @todo consider sample iteration for very large datasets?
        ytrue, ytrue_ids, ypred, ypred_ids, logits = samples.values(
            [
                gt_field + ".label",
                gt_field + ".id",
                pred_field + ".label",
                pred_field + ".id",
                pred_field + ".logits",
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
            ytrue_ids = list(itertools.chain.from_iterable(ytrue_ids))
            ypred = list(itertools.chain.from_iterable(ypred))
            ypred_ids = list(itertools.chain.from_iterable(ypred_ids))
            confs = list(itertools.chain.from_iterable(confs))
        else:
            confs, correct = _evaluate_top_k(
                ytrue, ypred, logits, k, targets_map
            )

        results = ClassificationResults(
            ytrue,
            ypred,
            confs=confs,
            gt_field=gt_field,
            pred_field=pred_field,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            classes=classes,
            missing=missing,
            samples=samples,
        )

        if eval_key is None:
            return results

        # note: fields are manually declared so they'll exist even when
        # `samples` is empty
        dataset = samples._dataset
        if is_frame_field:
            eval_frame = samples._FRAMES_PREFIX + eval_key

            # Sample-level accuracies
            avg_accuracies = [np.mean(c) if c else None for c in correct]
            dataset._add_sample_field_if_necessary(eval_key, fof.FloatField)
            samples.set_values(eval_key, avg_accuracies)

            # Per-frame accuracies
            dataset._add_frame_field_if_necessary(eval_key, fof.BooleanField)
            samples.set_values(eval_frame, correct)
        else:
            # Per-sample accuracies
            dataset._add_sample_field_if_necessary(eval_key, fof.BooleanField)
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
        elif _ytrue is None:
            # Missing ground truth
            _correct = ypred[idx] is None
            _conf = None
        else:
            try:
                target = targets_map[_ytrue]
            except KeyError:
                raise ValueError(
                    "Found ground truth label '%s' not in provided classes"
                    % _ytrue
                )

            if k >= len(_logits):
                found = True
            else:
                top_k = np.argpartition(_logits, -k)[-k:]
                found = target in top_k

            if found:
                # Truth is in top-k; use it
                ypred[idx] = _ytrue
                logit = _logits[target]
                _correct = True
            elif ypred[idx] is not None:
                # Truth is not in top-k; retain actual prediction
                _ypred = ypred[idx]

                try:
                    _pred_idx = targets_map[_ypred]
                except KeyError:
                    raise ValueError(
                        "Found predicted label '%s' not in provided classes"
                        % _ypred
                    )

                logit = _logits[_pred_idx]
                _correct = False
            else:
                # Missing prediction
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

        neg_label, pos_label = classes

        gt = gt_field + ".label"
        gt_id = gt_field + ".id"
        pred = pred_field + ".label"
        pred_id = pred_field + ".id"
        pred_conf = pred_field + ".confidence"

        ytrue, ytrue_ids, ypred, ypred_ids, confs = samples.values(
            [gt, gt_id, pred, pred_id, pred_conf]
        )

        if is_frame_field:
            ytrue = list(itertools.chain.from_iterable(ytrue))
            ytrue_ids = list(itertools.chain.from_iterable(ytrue_ids))
            ypred = list(itertools.chain.from_iterable(ypred))
            ypred_ids = list(itertools.chain.from_iterable(ypred_ids))
            confs = list(itertools.chain.from_iterable(confs))

        results = BinaryClassificationResults(
            ytrue,
            ypred,
            confs,
            classes,
            gt_field=gt_field,
            pred_field=pred_field,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            samples=samples,
        )

        if eval_key is None:
            return results

        # note: fields are manually declared so they'll exist even when
        # `samples` is empty
        dataset = samples._dataset
        if is_frame_field:
            eval_frame = samples._FRAMES_PREFIX + eval_key
            gt = gt[len(samples._FRAMES_PREFIX) :]
            pred = pred[len(samples._FRAMES_PREFIX) :]

            Fgt = (F(gt) != None).if_else(F(gt), neg_label)
            Fpred = (F(pred) != None).if_else(F(pred), neg_label)

            # Sample-level accuracies
            dataset._add_sample_field_if_necessary(eval_key, fof.FloatField)
            samples.set_field(
                eval_key, F("frames").map((Fgt == Fpred).to_double()).mean(),
            ).save(eval_key)

            # Per-frame accuracies
            # This implementation implicitly treats missing data as `neg_label`
            dataset._add_frame_field_if_necessary(eval_key, fof.StringField)
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
            # This implementation implicitly treats missing data as `neg_label`
            dataset._add_sample_field_if_necessary(eval_key, fof.StringField)
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
        confs (None): an optional list of confidences for the predictions
        weights (None): an optional list of sample weights
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

    def _get_labels(self, classes, include_missing=False):
        if classes is not None:
            return np.asarray(classes)

        if include_missing:
            return self.classes

        return np.array([c for c in self.classes if c != self.missing])

    def report(self, classes=None):
        """Generates a classification report for the results via
        :func:`sklearn:sklearn.metrics.classification_report`.

        Args:
            classes (None): an optional list of classes to include in the
                report

        Returns:
            a dict
        """
        labels = self._get_labels(classes, include_missing=False)

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
        labels = self._get_labels(classes, include_missing=False)

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
        labels = self._get_labels(classes, include_missing=False)

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
                would like to study a subset of classes including missing data
            include_other (False): whether to include an extra row/column at
                the end of the matrix for labels that do not appear in
                ``classes``

        Returns:
            a ``num_classes x num_classes`` confusion matrix
        """
        labels = self._get_labels(classes, include_missing=True)
        confusion_matrix, _, _ = self._confusion_matrix(
            labels, include_other=include_other
        )
        return confusion_matrix

    def _confusion_matrix(
        self,
        labels,
        include_other=False,
        other_label=None,
        include_missing=False,
        tabulate_ids=False,
    ):
        labels = list(labels)

        if include_other:
            if other_label not in labels:
                labels.append(other_label)

        if include_missing and self.missing not in labels:
            labels.append(self.missing)

        if include_other:
            labels_set = set(labels)
            ypred = [y if y in labels_set else other_label for y in self.ypred]
            ytrue = [y if y in labels_set else other_label for y in self.ytrue]
        else:
            ypred = self.ypred
            ytrue = self.ytrue

        confusion_matrix, ids = _compute_confusion_matrix(
            ytrue,
            ypred,
            labels,
            weights=self.weights,
            ytrue_ids=self.ytrue_ids,
            ypred_ids=self.ypred_ids,
            tabulate_ids=tabulate_ids,
        )

        return confusion_matrix, labels, ids

    def plot_confusion_matrix(
        self,
        classes=None,
        include_other=True,
        other_label="(other)",
        backend="plotly",
        **kwargs,
    ):
        """Plots a confusion matrix for the results.

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
            include_other (True): whether to include extra columns at the end
                of the confusion matrix for **predictions** that are either
                (i) missing, or (ii) are not missing but do not appear in
                ``classes``. If ``self.missing`` already appears in ``classes``
                or there are no missing predictions, no extra column is added
                for (i). Likewise, no extra column is added for (ii) if there
                are no predictions that fall in this case
            other_label ("(other)"): the label to use for "other" predictions.
                Only applicable when ``include_other`` is True
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
        _labels = self._get_labels(classes, include_missing=True)
        confusion_matrix, labels, ids = self._confusion_matrix(
            _labels,
            include_other=include_other,
            other_label=other_label,
            include_missing=include_other,
            tabulate_ids=True,
        )

        if include_other:
            num_labels = len(labels)
            num_extra = num_labels - len(_labels)

            # Don't include extra ground truth rows
            if num_extra > 0:
                confusion_matrix = confusion_matrix[:-num_extra, :]
                ids = ids[:-num_extra, :]

            # Only include non-trivial extra prediction rows
            rm_inds = []
            for idx in range(num_labels - num_extra, num_labels):
                if not any(confusion_matrix[:, idx]):
                    rm_inds.append(idx)

            if rm_inds:
                confusion_matrix = np.delete(confusion_matrix, rm_inds, axis=1)
                ids = np.delete(ids, rm_inds, axis=1)
                labels = [l for i, l in enumerate(labels) if i not in rm_inds]

        return fop.plot_confusion_matrix(
            confusion_matrix,
            labels,
            ids=ids,
            samples=self._samples,
            gt_field=self.gt_field,
            pred_field=self.pred_field,
            backend=backend,
            **kwargs,
        )

    @classmethod
    def _from_dict(cls, d, samples, **kwargs):
        ytrue = d["ytrue"]
        ypred = d["ypred"]
        confs = d.get("confs", None)
        weights = d.get("weights", None)
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
            gt_field=gt_field,
            pred_field=pred_field,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            classes=classes,
            missing=missing,
            samples=samples,
            **kwargs,
        )


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
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        ytrue_ids (None): a list of IDs for the ground truth labels
        ypred_ids (None): a list of IDs for the predicted labels
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            for which the results were computed
    """

    def __init__(
        self,
        ytrue,
        ypred,
        confs,
        classes,
        weights=None,
        gt_field=None,
        pred_field=None,
        ytrue_ids=None,
        ypred_ids=None,
        samples=None,
    ):
        super().__init__(
            ytrue,
            ypred,
            confs=confs,
            weights=weights,
            gt_field=gt_field,
            pred_field=pred_field,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            classes=classes,
            missing=classes[0],
            samples=samples,
        )

        self._pos_label = classes[1]
        self.scores = np.asarray(
            _to_binary_scores(ypred, confs, self._pos_label)
        )

    def _get_labels(self, classes, *args, **kwargs):
        if classes is not None:
            return classes

        return self.classes

    def average_precision(self, average="micro"):
        """Computes the average precision for the results via
        :func:`sklearn:sklearn.metrics.average_precision_score`.

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

    def plot_pr_curve(self, average="micro", backend="plotly", **kwargs):
        """Plots a precision-recall (PR) curve for the results.

        Args:
            average ("micro"): the averaging strategy to use when computing
                average precision
            backend ("plotly"): the plotting backend to use. Supported values
                are ``("plotly", "matplotlib")``
            **kwargs: keyword arguments for the backend plotting method:

                -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_pr_curve`
                -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_pr_curve`

        Returns:
            one of the following:

            -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if
                you are working in a notebook context and the plotly backend is
                used
            -   a plotly or matplotlib figure, otherwise
        """
        precision, recall, _ = skm.precision_recall_curve(
            self.ytrue,
            self.scores,
            pos_label=self._pos_label,
            sample_weight=self.weights,
        )
        avg_precision = self.average_precision(average=average)
        label = "AP = %.2f" % avg_precision

        return fop.plot_pr_curve(
            precision, recall, label=label, backend=backend, **kwargs
        )

    def plot_roc_curve(self, backend="plotly", **kwargs):
        """Plots a receiver operating characteristic (ROC) curve for the
        results.

        Args:
            backend ("plotly"): the plotting backend to use. Supported values
                are ``("plotly", "matplotlib")``
            **kwargs: keyword arguments for the backend plotting method:

                -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_roc_curve`
                -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_roc_curve`

        Returns:
            one of the following:

            -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if
                you are working in a notebook context and the plotly backend is
                used
            -   a plotly or matplotlib figure, otherwise
        """
        fpr, tpr, _ = skm.roc_curve(
            self.ytrue,
            self.scores,
            pos_label=self._pos_label,
            sample_weight=self.weights,
        )
        roc_auc = skm.auc(fpr, tpr)

        return fop.plot_roc_curve(
            fpr, tpr, roc_auc=roc_auc, backend=backend, **kwargs
        )

    @classmethod
    def _from_dict(cls, d, samples, **kwargs):
        ytrue = d["ytrue"]
        ypred = d["ypred"]
        confs = d["confs"]
        classes = d["classes"]
        weights = d.get("weights", None)
        gt_field = d.get("gt_field", None)
        pred_field = d.get("pred_field", None)
        ytrue_ids = d.get("ytrue_ids", None)
        ypred_ids = d.get("ypred_ids", None)
        return cls(
            ytrue,
            ypred,
            confs,
            classes=classes,
            weights=weights,
            gt_field=gt_field,
            pred_field=pred_field,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            samples=samples,
            **kwargs,
        )


def _parse_config(pred_field, gt_field, method, **kwargs):
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
            scores = weights * scores

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
