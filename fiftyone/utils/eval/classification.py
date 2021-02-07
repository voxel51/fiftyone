"""
Classification evaluation.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import matplotlib.pyplot as plt
import numpy as np
import sklearn.metrics as skm

import fiftyone.core.aggregations as foa
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou


def evaluate_classifications(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_field=None,
    classes=None,
):
    """Evaluates the classification predictions in the given samples with
    respect to the specified ground truth labels.

    If an ``eval_field`` is specified, this method will record whether each
    prediction is correct in this field.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Classification` instances to evaluate
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Classification` instances
        eval_field (None): the name of a field in which to record whether each
            prediction is correct
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used

    Returns:
        a :class:`ClassificationResults`
    """
    gt = gt_field + ".label"
    pred = pred_field + ".label"
    pred_conf = pred_field + ".confidence"

    ytrue, ypred, confs = samples.aggregate(
        [foa.Values(gt), foa.Values(pred), foa.Values(pred_conf)]
    )

    if eval_field:
        samples._add_field_if_necessary(eval_field, fof.BooleanField)
        samples.set_field(eval_field, F(gt) == F(pred)).save(eval_field)

    # Equivalent with loops
    # ytrue = []
    # ypred = []
    # confs = []
    # with fou.ProgressBar() as pb:
    #     for sample in pb(samples.select_fields([pred_field, gt_field])):
    #         gt_label = sample[gt_field].label
    #         pred_label = sample[pred_field].label
    #         pred_conf = sample[pred_field].confidence
    #         ytrue.append(gt_label)
    #         ypred.append(pred_label)
    #         confs.append(pred_conf)
    #         if eval_field:
    #             sample[eval_field] = gt_label == pred_label
    #             sample.save()

    if classes is None:
        classes = set(ytrue) | set(ypred)
        classes.discard(None)
        classes = sorted(classes)

    return ClassificationResults(ytrue, ypred, confs, classes)


def evaluate_binary_classifications(
    samples, classes, pred_field, gt_field="ground_truth", eval_field=None,
):
    """Evaluates the binary classification predictions in the given samples
    with respect to the specified ground truth labels.

    If an ``eval_field`` is specified, this method will record the TP/FP/FN/TN
    status of each prediction in this field.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        classes: the ``(neg_label, pos_label)`` label strings for the task
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Classification` instances to evaluate
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Classification` instances
        eval_field (None): the name of a field in which to record whether each
            prediction is correct

    Returns:
        a :class:`BinaryClassificationResults`
    """
    pos_label = classes[-1]

    gt = gt_field + ".label"
    pred = pred_field + ".label"
    pred_conf = pred_field + ".confidence"

    ytrue, ypred, confs = samples.aggregate(
        [foa.Values(gt), foa.Values(pred), foa.Values(pred_conf)]
    )

    if eval_field:
        samples._add_field_if_necessary(eval_field, fof.StringField)
        samples.set_field(
            eval_field,
            F().switch(
                {
                    (F(gt) == pos_label) & (F(pred) == pos_label): "TP",
                    (F(gt) == pos_label) & (F(pred) != pos_label): "FN",
                    (F(gt) != pos_label) & (F(pred) != pos_label): "TN",
                    (F(gt) != pos_label) & (F(pred) == pos_label): "FP",
                }
            ),
        ).save(eval_field)

    # Equivalent with loops
    # ytrue = []
    # ypred = []
    # confs = []
    # with fou.ProgressBar() as pb:
    #     for sample in pb(samples.select_fields([pred_field, gt_field])):
    #         gt_label = sample[gt_field].label
    #         pred_label = sample[pred_field].label
    #         pred_conf = sample[pred_field].confidence
    #         ytrue.append(gt_label)
    #         ypred.append(pred_label)
    #         confs.append(pred_conf)
    #         if eval_field:
    #             if gt_label == pos_label:
    #                 eval_label = "TP" if pred_label == pos_label else "FN"
    #             else:
    #                 eval_label = "TN" if pred_label != pos_label else "FP"
    #
    #             sample[eval_field] = fol.Classification(label=eval_label)
    #             sample.save()

    return BinaryClassificationResults(ytrue, ypred, confs, classes)


def evaluate_top_k_classifications(
    samples, k, classes, pred_field, gt_field="ground_truth", eval_field=None,
):
    """Evaluates the top-k accuracy of the classification predictions in the
    given samples with respect to the specified ground truth labels.

    The predictions in ``pred_field`` must have their ``logits`` populated.

    If an ``eval_field`` is specified, this method will record whether each
    prediction is top-k correct in this field.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        k: the top-k value to use when assessing accuracy
        classes: the list of class labels corresponding to the predicted logits
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Classification` instances to evaluate.
            This field must have its ``logits`` populated
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Classification` instances
        eval_field (None): the name of a field in which to record whether each
            prediction is top-k correct

    Returns:
        the top-k accuracy in ``[0, 1]``
    """
    targets_map = {label: idx for idx, label in enumerate(classes)}

    # This extracts a `num_samples x num_classes` array of logits
    ytrue, logits = samples.aggregate(
        [foa.Values(gt_field + ".label"), foa.Values(pred_field + ".logits")]
    )

    correct = []
    for _label, _logits in zip(ytrue, logits):
        if _logits is not None:
            target = targets_map[_label]
            top_k = np.argpartition(_logits, -k)[-k:]
            _correct = target in top_k
        else:
            _correct = False

        correct.append(_correct)

    if eval_field:
        samples._add_field_if_necessary(eval_field, fof.BooleanField)
        samples.set_values(eval_field, correct)

    top_k_accuracy = np.mean(correct)

    # Equivalent with loops
    # num_correct = 0
    # with fou.ProgressBar() as pb:
    #     for sample in pb(samples.select_fields([gt_field, pred_field])):
    #         idx = targets_map[sample[gt_field].label]
    #         logits = sample[pred_field].logits
    #         in_top_k = idx in np.argpartition(logits, -k)[-k:]
    #         num_correct += int(in_top_k)
    #         if eval_field:
    #             sample[eval_field] = in_top_k
    #             sample.save()
    #
    # top_k_accuracy = num_correct / len(samples)

    return top_k_accuracy


class ClassificationResults(object):
    """Class that stores the results of a classification evaluation.

    Args:
        ytrue: a list of ground truth labels
        ypred: a list of predicted labels
        confs: a list of confidences for the predictions
        classes: the list of possible classes
    """

    def __init__(self, ytrue, ypred, confs, classes):
        self.ytrue = ytrue
        self.ypred = ypred
        self.confs = confs
        self.classes = classes

    def report(self):
        """Generates a classification report for the results via
        ``sklearn.metrics.classification_report``.

        Returns:
            a dict
        """
        return skm.classification_report(
            self.ytrue,
            self.ypred,
            target_names=self.classes,
            output_dict=True,
        )

    def metrics(self, average="micro", beta=1.0):
        """Computes classification metrics for the results, including accuracy,
        precision, recall, and F-beta score.

        See ``sklearn.metrics.precision_recall_fscore_support`` for details.

        Args:
            average ("micro"): the averaging strategy to use
            beta (1.0): the F-beta value to use

        Returns:
            a dict
        """
        accuracy = skm.accuracy_score(self.ytrue, self.ypred, normalize=True)
        precision, recall, fscore, _ = skm.precision_recall_fscore_support(
            self.ytrue,
            self.ypred,
            average=average,
            labels=self.classes,
            beta=beta,
        )
        return {
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "fscore": fscore,
        }

    def print_report(self, digits=2):
        """Prints a classification report for the results via
        ``sklearn.metrics.classification_report``.

        Args:
            digits (2): the number of digits of precision to print
        """
        report_str = skm.classification_report(
            self.ytrue, self.ypred, target_names=self.classes, digits=digits
        )
        print(report_str)

    def plot_confusion_matrix(self, ax=None, block=False, **kwargs):
        """Plots a confusion matrix for the results.

        Args:
            ax (None): an optional matplotlib axis to plot in
            block (False): whether to block execution when the plot is
                displayed via ``matplotlib.pyplot.show(block=block)``
            **kwargs: optional keyword arguments for
                ``sklearn.metrics.ConfusionMatrixDisplay.plot(**kwargs)``
        """
        confusion_matrix = skm.confusion_matrix(
            self.ytrue, self.ypred, labels=self.classes
        )
        display = skm.ConfusionMatrixDisplay(
            confusion_matrix=confusion_matrix, display_labels=self.classes,
        )
        display.plot(ax=ax, **kwargs)
        plt.show(block=block)


class BinaryClassificationResults(ClassificationResults):
    """Class that stores the results of a binary classification evaluation.

    Args:
        ytrue: a list of ground truth labels
        ypred: a list of predicted labels
        confs: a list of confidences for the predictions
        classes: the list of possible classes. The positive class must be the
            *last* element
    """

    def __init__(self, ytrue, ypred, confs, classes):
        super().__init__(ytrue, ypred, confs, classes)
        self.pos_label = classes[-1]
        self.scores = [
            conf if pred == self.pos_label else 1.0 - conf
            for pred, conf in zip(ypred, confs)
        ]

    def average_precision(self, average="micro"):
        """Computes the average precision for the results via
        ``sklearn.metrics.average_precision_score``.

        Args:
            average ("micro"): the averaging strategy to use

        Returns:
            the average precision
        """
        return skm.average_precision_score(
            self.ytrue, self.scores, pos_label=self.pos_label, average=average
        )

    def plot_pr_curve(self, average="micro", ax=None, block=False, **kwargs):
        """Plots a precision-recall (PR) curve for the results.

        Args:
            average ("micro"): the averaging strategy to use when computing
                average precision
            ax (None): an optional matplotlib axis to plot in
            block (False): whether to block execution when the plot is
                displayed via ``matplotlib.pyplot.show(block=block)``
            **kwargs: optional keyword arguments for
                ``sklearn.metrics.PrecisionRecallDisplay.plot(**kwargs)``
        """
        precision, recall, _ = skm.precision_recall_curve(
            self.ytrue, self.scores, pos_label=self.pos_label
        )
        avg_precision = self.average_precision()
        display = skm.PrecisionRecallDisplay(
            precision=precision, recall=recall
        )
        label = "AP = %.2f" % avg_precision
        display.plot(ax=ax, label=label, **kwargs)
        plt.show(block=block)

    def plot_roc_curve(self, ax=None, block=False, **kwargs):
        """Plots a receiver operating characteristic (ROC) curve for the
        results.

        Args:
            ax (None): an optional matplotlib axis to plot in
            block (False): whether to block execution when the plot is
                displayed via ``matplotlib.pyplot.show(block=block)``
            **kwargs: optional keyword arguments for
                ``sklearn.metrics.RocCurveDisplay.plot(**kwargs)``
        """
        fpr, tpr, _ = skm.roc_curve(
            self.ytrue, self.scores, pos_label=self.pos_label
        )
        roc_auc = skm.auc(fpr, tpr)
        display = skm.RocCurveDisplay(fpr=fpr, tpr=tpr, roc_auc=roc_auc)
        display.plot(ax=ax, **kwargs)
        plt.show(block=block)
