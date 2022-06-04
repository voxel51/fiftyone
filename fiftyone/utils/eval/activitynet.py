"""
ActivityNet-style temporal detection evaluation.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
from collections import defaultdict

import numpy as np

import eta.core.utils as etau

import fiftyone.core.plots as fop
import fiftyone.utils.iou as foui

from .detection import (
    DetectionEvaluation,
    DetectionEvaluationConfig,
    DetectionResults,
)


logger = logging.getLogger(__name__)


class ActivityNetEvaluationConfig(DetectionEvaluationConfig):
    """ActivityNet-style evaluation config.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.TemporalDetection` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.TemporalDetection` instances
        iou (None): the IoU threshold to use to determine matches
        classwise (None): whether to only match segments with the same class
            label (True) or allow matches between classes (False)
        compute_mAP (False): whether to perform the necessary computations so
            that mAP and PR curves can be generated
        iou_threshs (None): a list of IoU thresholds to use when computing mAP
            and PR curves. Only applicable when ``compute_mAP`` is True
    """

    def __init__(
        self,
        pred_field,
        gt_field,
        iou=None,
        classwise=None,
        compute_mAP=False,
        iou_threshs=None,
        **kwargs,
    ):
        super().__init__(
            pred_field, gt_field, iou=iou, classwise=classwise, **kwargs
        )

        if compute_mAP and iou_threshs is None:
            iou_threshs = [x / 100 for x in range(50, 100, 5)]

        self.compute_mAP = compute_mAP
        self.iou_threshs = iou_threshs

    @property
    def method(self):
        return "activitynet"


class ActivityNetEvaluation(DetectionEvaluation):
    """ActivityNet-style evaluation.

    Args:
        config: a :class:`ActivityNetEvaluationConfig`
    """

    def __init__(self, config):
        super().__init__(config)

        if config.iou is None:
            raise ValueError(
                "You must specify an `iou` threshold in order to run "
                "ActivityNet evaluation"
            )

        if config.classwise is None:
            raise ValueError(
                "You must specify a `classwise` value in order to run "
                "ActivityNet evaluation"
            )

    def evaluate(self, sample, eval_key=None):
        """Performs ActivityNet-style evaluation on the given video.

        Predicted segments are matched to ground truth segments in descending
        order of confidence, with matches requiring a minimum IoU of
        ``self.config.iou``.

        The ``self.config.classwise`` parameter controls whether to only match
        segments with the same class label (True) or allow matches between
        classes (False).

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
            eval_key (None): the evaluation key for this evaluation

        Returns:
            a list of matched
            ``(gt_label, pred_label, iou, pred_confidence, gt_id, pred_id)``
            tuples
        """
        gts = sample[self.gt_field]
        preds = sample[self.pred_field]

        if eval_key is None:
            # Don't save results on user's data
            eval_key = "eval"
            gts = _copy_labels(gts)
            preds = _copy_labels(preds)

        return _activitynet_evaluation_single_iou(
            gts, preds, eval_key, self.config
        )

    def generate_results(
        self, samples, matches, eval_key=None, classes=None, missing=None
    ):
        """Generates aggregate evaluation results for the samples.

        If ``self.config.compute_mAP`` is True, this method performs
        ActivityNet-style evaluation as in :meth:`evaluate` to generate
        precision and recall sweeps over the range of IoU thresholds in
        ``self.config.iou_threshs``. In this case, an
        :class:`ActivityNetDetectionResults` instance is returned that can
        compute mAP and PR curves.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            matches: a list of
                ``(gt_label, pred_label, iou, pred_confidence, gt_id, pred_id)``
                matches. Either label can be ``None`` to indicate an unmatched
                segment
            eval_key (None): the evaluation key for this evaluation
            classes (None): the list of possible classes. If not provided, the
                observed ground truth/predicted labels are used for results
                purposes
            missing (None): a missing label string. Any unmatched segments are
                given this label for results purposes

        Returns:
            a :class:`DetectionResults`
        """
        gt_field = self.config.gt_field
        pred_field = self.config.pred_field

        if not self.config.compute_mAP:
            return DetectionResults(
                matches,
                eval_key=eval_key,
                gt_field=gt_field,
                pred_field=pred_field,
                classes=classes,
                missing=missing,
                samples=samples,
            )

        _samples = samples.select_fields([gt_field, pred_field])

        iou_threshs = self.config.iou_threshs
        thresh_matches = {t: {} for t in iou_threshs}

        if classes is None:
            _classes = set()
        else:
            _classes = None

        # IoU sweep
        logger.info("Performing IoU sweep...")
        for sample in _samples.iter_samples(progress=True):
            # Don't edit user's data during sweep
            gts = _copy_labels(sample[self.gt_field])
            preds = _copy_labels(sample[self.pred_field])

            video_matches = _activitynet_evaluation_iou_sweep(
                gts, preds, self.config
            )

            for t, t_matches in video_matches.items():
                for match in t_matches:
                    gt_label = match[0]
                    pred_label = match[1]

                    if _classes is not None:
                        _classes.add(gt_label)
                        _classes.add(pred_label)

                    c = gt_label if gt_label is not None else pred_label

                    if c not in thresh_matches[t]:
                        thresh_matches[t][c] = {
                            "tp": [],
                            "fp": [],
                            "num_gt": 0,
                        }

                    if gt_label == pred_label:
                        thresh_matches[t][c]["tp"].append(match)
                    elif pred_label:
                        thresh_matches[t][c]["fp"].append(match)

                    if gt_label:
                        thresh_matches[t][c]["num_gt"] += 1

        if _classes is not None:
            _classes.discard(None)
            classes = sorted(_classes)

        # Compute precision-recall array
        # https://github.com/activitynet/ActivityNet/blob/master/Evaluation/eval_detection.py
        num_threshs = len(iou_threshs)
        num_classes = len(classes)
        precision = -np.ones((num_threshs, num_classes, 101))
        thresholds = -np.ones((num_threshs, num_classes, 101))
        classwise_AP = -np.ones((num_threshs, num_classes))
        recall = np.linspace(0, 1, 101)
        for t in thresh_matches.keys():
            for c in thresh_matches[t].keys():
                tp = thresh_matches[t][c]["tp"]
                fp = thresh_matches[t][c]["fp"]
                num_gt = thresh_matches[t][c]["num_gt"]
                if num_gt == 0:
                    continue

                tp_fp = np.array([1] * len(tp) + [0] * len(fp))
                confs = np.array([m[3] for m in tp] + [m[3] for m in fp])
                if None in confs:
                    raise ValueError(
                        "All predicted segments must have their `confidence` "
                        "attribute populated in order to compute "
                        "precision-recall curves"
                    )
                inds = np.argsort(-confs, kind="mergesort")
                tp_fp = tp_fp[inds]
                confs = confs[inds]

                tp_sum = np.cumsum(tp_fp).astype(dtype=float)
                total = np.arange(1, len(tp_fp) + 1).astype(dtype=float)

                pre = tp_sum / total
                rec = tp_sum / num_gt

                for i in range(len(pre) - 1, 0, -1):
                    if pre[i] > pre[i - 1]:
                        pre[i - 1] = pre[i]

                # ActivityNet mAP is calculated without interpolated precision
                # This slightly differs from COCO evaluation
                mprec = np.hstack([[0], pre, [0]])
                mrec = np.hstack([[0], rec, [1]])
                idx = np.where(mrec[1::] != mrec[0:-1])[0] + 1
                ap = np.sum((mrec[idx] - mrec[idx - 1]) * mprec[idx])

                q = np.zeros(101)
                tr = np.zeros(101)

                # Interpolate precision values for PR curve plotting purposes
                inds = np.searchsorted(rec, recall, side="left")
                try:
                    for ri, pi in enumerate(inds):
                        q[ri] = pre[pi]
                        tr[ri] = confs[pi]
                except:
                    pass

                precision[iou_threshs.index(t)][classes.index(c)] = q
                thresholds[iou_threshs.index(t)][classes.index(c)] = tr
                classwise_AP[iou_threshs.index(t)][classes.index(c)] = ap

        return ActivityNetDetectionResults(
            matches,
            precision,
            recall,
            classwise_AP,
            iou_threshs,
            classes,
            thresholds=thresholds,
            eval_key=eval_key,
            gt_field=gt_field,
            pred_field=pred_field,
            missing=missing,
            samples=samples,
        )


class ActivityNetDetectionResults(DetectionResults):
    """Class that stores the results of a ActivityNet detection evaluation.

    Args:
        matches: a list of
            ``(gt_label, pred_label, iou, pred_confidence, gt_id, pred_id)``
            matches. Either label can be ``None`` to indicate an unmatched
            segment
        precision: an array of precision values of shape
            ``num_iou_threshs x num_classes x num_recall``
        recall: an array of recall values
        classwise_AP: an array of average precision values of shape
            ``num_iou_threshs x num_classes``
        iou_threshs: an array of IoU thresholds
        classes: the list of possible classes
        thresholds (None): an optional array of decision thresholds of shape
            ``num_iou_threshs x num_classes x num_recall``
        eval_key (None): the evaluation key for this evaluation
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        missing (None): a missing label string. Any unmatched segments are
            given this label for evaluation purposes
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            for which the results were computed
    """

    def __init__(
        self,
        matches,
        precision,
        recall,
        classwise_AP,
        iou_threshs,
        classes,
        thresholds=None,
        eval_key=None,
        gt_field=None,
        pred_field=None,
        missing=None,
        samples=None,
    ):
        super().__init__(
            matches,
            eval_key=eval_key,
            gt_field=gt_field,
            pred_field=pred_field,
            classes=classes,
            missing=missing,
            samples=samples,
        )

        self.precision = np.asarray(precision)
        self.recall = np.asarray(recall)
        self.iou_threshs = np.asarray(iou_threshs)
        self.thresholds = (
            np.asarray(thresholds) if thresholds is not None else None
        )

        self._classwise_AP = classwise_AP.mean(0)

    def plot_pr_curves(
        self, classes=None, iou_thresh=None, backend="plotly", **kwargs
    ):
        """Plots precision-recall (PR) curves for the results.

        Args:
            classes (None): a list of classes to generate curves for. By
                default, the top 3 AP classes will be plotted
            iou_thresh (None): an optional IoU threshold or list of IoU
                thresholds for which to plot curves. If multiple thresholds are
                provided, precision data is averaged across these thresholds.
                By default, precision data is averaged over all IoU thresholds.
                Refer to :attr:`iou_threshs` to see the available thresholds
            backend ("plotly"): the plotting backend to use. Supported values
                are ``("plotly", "matplotlib")``
            **kwargs: keyword arguments for the backend plotting method:

                -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_pr_curves`
                -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_pr_curves`

        Returns:
            one of the following:

            -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if
                you are working in a notebook context and the plotly backend is
                used
            -   a plotly or matplotlib figure, otherwise
        """
        if classes is None:
            inds = np.argsort(self._classwise_AP)[::-1][:3]
            classes = self.classes[inds]

        thresh_inds = self._get_iou_thresh_inds(iou_thresh=iou_thresh)

        precisions = []

        has_thresholds = self.thresholds is not None
        thresholds = [] if has_thresholds else None

        for c in classes:
            class_ind = self._get_class_index(c)
            precisions.append(
                np.mean(self.precision[thresh_inds, class_ind], axis=0)
            )
            if has_thresholds:
                thresholds.append(
                    np.mean(self.thresholds[thresh_inds, class_ind], axis=0)
                )

        return fop.plot_pr_curves(
            precisions,
            self.recall,
            classes,
            thresholds=thresholds,
            backend=backend,
            **kwargs,
        )

    def mAP(self, classes=None):
        """Computes ActivityNet-style mean average precision (mAP) for the
        specified classes.

        See `this page <https://github.com/activitynet/ActivityNet/tree/master/Evaluation>`_
        for more details about ActivityNet-style mAP.

        Args:
            classes (None): a list of classes for which to compute mAP

        Returns:
            the mAP in ``[0, 1]``
        """
        if classes is not None:
            class_inds = np.array([self._get_class_index(c) for c in classes])
            classwise_AP = self._classwise_AP[class_inds]
        else:
            classwise_AP = self._classwise_AP

        classwise_AP = classwise_AP[classwise_AP > -1]
        if classwise_AP.size == 0:
            return -1

        return np.mean(classwise_AP)

    def _get_iou_thresh_inds(self, iou_thresh=None):
        if iou_thresh is None:
            return np.arange(len(self.iou_threshs))

        if etau.is_numeric(iou_thresh):
            iou_threshs = [iou_thresh]
        else:
            iou_threshs = iou_thresh

        thresh_inds = []
        for iou_thresh in iou_threshs:
            inds = np.where(np.abs(iou_thresh - self.iou_threshs) < 1e-6)[0]
            if inds.size == 0:
                raise ValueError(
                    "Invalid IoU threshold %f. Refer to `results.iou_threshs` "
                    "to see the available values" % iou_thresh
                )

            thresh_inds.append(inds[0])

        return thresh_inds

    def _get_class_index(self, label):
        inds = np.where(self.classes == label)[0]
        if inds.size == 0:
            raise ValueError("Class '%s' not found" % label)

        return inds[0]

    @classmethod
    def _from_dict(cls, d, samples, config, **kwargs):
        precision = d["precision"]
        recall = d["recall"]
        iou_threshs = d["iou_threshs"]
        thresholds = d.get("thresholds", None)
        return super()._from_dict(
            d,
            samples,
            config,
            precision=precision,
            recall=recall,
            iou_threshs=iou_threshs,
            thresholds=thresholds,
            **kwargs,
        )


_NO_MATCH_ID = ""
_NO_MATCH_IOU = None


def _activitynet_evaluation_single_iou(gts, preds, eval_key, config):
    iou_thresh = min(config.iou, 1 - 1e-10)
    id_key = "%s_id" % eval_key
    iou_key = "%s_iou" % eval_key

    cats, pred_ious = _activitynet_evaluation_setup(
        gts, preds, [id_key], iou_key, config
    )

    matches = _compute_matches(
        cats,
        pred_ious,
        iou_thresh,
        eval_key=eval_key,
        id_key=id_key,
        iou_key=iou_key,
    )

    return matches


def _activitynet_evaluation_iou_sweep(gts, preds, config):
    iou_threshs = config.iou_threshs
    id_keys = ["eval_id_%s" % str(i).replace(".", "_") for i in iou_threshs]
    iou_key = "eval_iou"

    cats, pred_ious = _activitynet_evaluation_setup(
        gts, preds, id_keys, iou_key, config
    )

    matches_dict = {
        i: _compute_matches(
            cats,
            pred_ious,
            i,
            eval_key="eval",
            id_key=k,
            iou_key=iou_key,
        )
        for i, k in zip(iou_threshs, id_keys)
    }

    return matches_dict


def _activitynet_evaluation_setup(
    gts,
    preds,
    id_keys,
    iou_key,
    config,
):
    classwise = config.classwise

    # Organize ground truth and predictions by category

    cats = defaultdict(lambda: defaultdict(list))

    if gts is not None:
        for obj in gts[gts._LABEL_LIST_FIELD]:
            obj[iou_key] = _NO_MATCH_IOU
            for id_key in id_keys:
                obj[id_key] = _NO_MATCH_ID

            label = obj.label if classwise else "all"
            cats[label]["gts"].append(obj)

    if preds is not None:
        for obj in preds[preds._LABEL_LIST_FIELD]:
            obj[iou_key] = _NO_MATCH_IOU
            for id_key in id_keys:
                obj[id_key] = _NO_MATCH_ID

            label = obj.label if classwise else "all"
            cats[label]["preds"].append(obj)

    # Compute IoUs within each category
    pred_ious = {}
    for segments in cats.values():
        gts = segments["gts"]
        preds = segments["preds"]

        # Highest confidence predictions first
        preds = sorted(preds, key=lambda p: p.confidence or -1, reverse=True)

        segments["preds"] = preds

        # Compute ``num_preds x num_gts`` IoUs
        ious = foui.compute_segment_ious(preds, gts)

        gt_ids = [g.id for g in gts]
        for pred, gt_ious in zip(preds, ious):
            pred_ious[pred.id] = list(zip(gt_ids, gt_ious))

    return cats, pred_ious


def _compute_matches(cats, pred_ious, iou_thresh, eval_key, id_key, iou_key):
    matches = []

    # Match preds to GT, highest confidence first
    for cat, segments in cats.items():
        gt_map = {gt.id: gt for gt in segments["gts"]}

        # Match each prediction to the highest available IoU ground truth
        for pred in segments["preds"]:
            if pred.id in pred_ious:
                best_match = None
                best_match_iou = iou_thresh
                for gt_id, iou in pred_ious[pred.id]:
                    gt = gt_map[gt_id]

                    # Each gt can only match with one prediction
                    if gt[id_key] != _NO_MATCH_ID:
                        continue

                    if iou < best_match_iou:
                        continue

                    best_match_iou = iou
                    best_match = gt_id

                if best_match:
                    gt = gt_map[best_match]

                    gt[eval_key] = "tp" if gt.label == pred.label else "fn"
                    gt[id_key] = pred.id
                    gt[iou_key] = best_match_iou

                    pred[eval_key] = "tp" if gt.label == pred.label else "fp"
                    pred[id_key] = best_match
                    pred[iou_key] = best_match_iou

                    matches.append(
                        (
                            gt.label,
                            pred.label,
                            best_match_iou,
                            pred.confidence,
                            gt.id,
                            pred.id,
                        )
                    )
                else:
                    pred[eval_key] = "fp"
                    matches.append(
                        (
                            None,
                            pred.label,
                            None,
                            pred.confidence,
                            None,
                            pred.id,
                        )
                    )

            elif pred.label == cat:
                pred[eval_key] = "fp"
                matches.append(
                    (
                        None,
                        pred.label,
                        None,
                        pred.confidence,
                        None,
                        pred.id,
                    )
                )

        # Leftover GTs are false negatives
        for gt in segments["gts"]:
            if gt[id_key] == _NO_MATCH_ID:
                gt[eval_key] = "fn"
                matches.append((gt.label, None, None, None, gt.id, None))

    return matches


def _copy_labels(labels):
    if labels is None:
        return None

    field = labels._LABEL_LIST_FIELD
    _labels = labels.copy()

    # We need the IDs to stay the same
    for _label, label in zip(_labels[field], labels[field]):
        _label.id = label.id

    return _labels
