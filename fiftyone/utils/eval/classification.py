"""
Classification evaluation.

| Copyright 2017-2023, Voxel51, Inc.
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

from .base import BaseEvaluationResults


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
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used
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

    config = _parse_config(pred_field, gt_field, method, **kwargs)
    eval_method = config.build()
    eval_method.ensure_requirements()

    eval_method.register_run(samples, eval_key)
    eval_method.register_samples(samples, eval_key)

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

    def register_samples(self, samples, eval_key):
        """Registers the collection on which evaluation will be performed.

        This method will be called before calling :meth:`evaluate_samples`.
        Subclasses can extend this method to perform any setup required for an
        evaluation run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: the evaluation key for this evaluation
        """
        raise NotImplementedError("subclass must implement register_samples()")

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
        is_frame_field = samples._is_frame_field(self.config.gt_field)

        fields = [eval_key]

        if is_frame_field:
            fields.append(samples._FRAMES_PREFIX + eval_key)

        return fields

    def cleanup(self, samples, eval_key):
        dataset = samples._dataset
        is_frame_field = samples._is_frame_field(self.config.gt_field)

        dataset.delete_sample_field(eval_key, error_level=1)

        if is_frame_field:
            dataset.delete_frame_field(eval_key, error_level=1)

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

    def register_samples(self, samples, eval_key):
        """Registers the collection on which evaluation will be performed.

        This method will be called before calling :meth:`evaluate_samples`.
        Subclasses can extend this method to perform any setup required for an
        evaluation run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: the evaluation key for this evaluation
        """
        if eval_key is None:
            return

        dataset = samples._dataset
        is_frame_field = samples._is_frame_field(self.config.gt_field)

        if is_frame_field:
            dataset.add_sample_field(eval_key, fof.FloatField)
            dataset.add_frame_field(eval_key, fof.BooleanField)
        else:
            dataset.add_sample_field(eval_key, fof.BooleanField)

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
            eval_key=eval_key,
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

        if is_frame_field:
            eval_frame = samples._FRAMES_PREFIX + eval_key
            gt = gt[len(samples._FRAMES_PREFIX) :]
            pred = pred[len(samples._FRAMES_PREFIX) :]

            # Sample-level accuracies
            samples.set_field(
                eval_key,
                F("frames").map((F(gt) == F(pred)).to_double()).mean(),
            ).save(eval_key)

            # Per-frame accuracies
            samples.set_field(eval_frame, F(gt) == F(pred)).save(eval_frame)
        else:
            # Per-sample accuracies
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

    def register_samples(self, samples, eval_key):
        """Registers the collection on which evaluation will be performed.

        This method will be called before calling :meth:`evaluate_samples`.
        Subclasses can extend this method to perform any setup required for an
        evaluation run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: the evaluation key for this evaluation
        """
        if eval_key is None:
            return

        dataset = samples._dataset
        is_frame_field = samples._is_frame_field(self.config.gt_field)

        if is_frame_field:
            dataset.add_sample_field(eval_key, fof.FloatField)
            dataset.add_frame_field(eval_key, fof.BooleanField)
        else:
            dataset.add_sample_field(eval_key, fof.BooleanField)

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
            eval_key=eval_key,
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

        if is_frame_field:
            eval_frame = samples._FRAMES_PREFIX + eval_key

            # Sample-level accuracies
            avg_accuracies = [np.mean(c) if c else None for c in correct]
            samples.set_values(eval_key, avg_accuracies)

            # Per-frame accuracies
            samples.set_values(eval_frame, correct)
        else:
            # Per-sample accuracies
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

    def register_samples(self, samples, eval_key):
        """Registers the collection on which evaluation will be performed.

        This method will be called before calling :meth:`evaluate_samples`.
        Subclasses can extend this method to perform any setup required for an
        evaluation run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: the evaluation key for this evaluation
        """
        if eval_key is None:
            return

        dataset = samples._dataset
        is_frame_field = samples._is_frame_field(self.config.gt_field)

        if is_frame_field:
            dataset.add_sample_field(eval_key, fof.FloatField)
            dataset.add_frame_field(eval_key, fof.StringField)
        else:
            dataset.add_sample_field(eval_key, fof.StringField)

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
            eval_key=eval_key,
            gt_field=gt_field,
            pred_field=pred_field,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            samples=samples,
        )

        if eval_key is None:
            return results

        if is_frame_field:
            eval_frame = samples._FRAMES_PREFIX + eval_key
            gt = gt[len(samples._FRAMES_PREFIX) :]
            pred = pred[len(samples._FRAMES_PREFIX) :]

            Fgt = (F(gt) != None).if_else(F(gt), neg_label)
            Fpred = (F(pred) != None).if_else(F(pred), neg_label)

            # Sample-level accuracies
            samples.set_field(
                eval_key,
                F("frames").map((Fgt == Fpred).to_double()).mean(),
            ).save(eval_key)

            # Per-frame accuracies
            # This implementation implicitly treats missing data as `neg_label`
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


class ClassificationResults(BaseEvaluationResults):
    """Class that stores the results of a classification evaluation.

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

    pass


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
        eval_key (None): the evaluation key of the evaluation
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
        eval_key=None,
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
            eval_key=eval_key,
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
        precision, recall, thresholds = skm.precision_recall_curve(
            self.ytrue,
            self.scores,
            pos_label=self._pos_label,
            sample_weight=self.weights,
        )
        thresholds = np.concatenate([thresholds, [max(1, thresholds[-1])]])
        avg_precision = self.average_precision(average=average)
        label = "AP = %.2f" % avg_precision

        return fop.plot_pr_curve(
            precision,
            recall,
            thresholds=thresholds,
            label=label,
            backend=backend,
            **kwargs,
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
        fpr, tpr, thresholds = skm.roc_curve(
            self.ytrue,
            self.scores,
            pos_label=self._pos_label,
            sample_weight=self.weights,
        )
        thresholds[0] = max(1, thresholds[1])
        roc_auc = skm.auc(fpr, tpr)

        return fop.plot_roc_curve(
            fpr,
            tpr,
            thresholds=thresholds,
            roc_auc=roc_auc,
            backend=backend,
            **kwargs,
        )

    def _parse_classes(self, classes):
        if classes is not None:
            return np.asarray(classes)

        return self.classes

    @classmethod
    def _from_dict(cls, d, samples, config, **kwargs):
        ytrue = d["ytrue"]
        ypred = d["ypred"]
        confs = d["confs"]
        classes = d["classes"]
        weights = d.get("weights", None)
        eval_key = d.get("eval_key", None)
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
            eval_key=eval_key,
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


def _to_binary_scores(y, confs, pos_label):
    scores = []
    for yi, conf in zip(y, confs):
        if conf is None:
            conf = 0.0

        score = conf if yi == pos_label else 1.0 - conf
        scores.append(score)

    return scores
