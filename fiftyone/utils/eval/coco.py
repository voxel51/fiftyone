"""
COCO-style detection evaluation.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
from collections import defaultdict

import matplotlib.pyplot as plt
import numpy as np
import sklearn.metrics as skm

import fiftyone.core.utils as fou

from .detection import (
    DetectionEvaluation,
    DetectionEvaluationConfig,
    DetectionResults,
)


logger = logging.getLogger(__name__)


class COCOEvaluationConfig(DetectionEvaluationConfig):
    """COCO-style evaluation config.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Detections` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Detections` instances
        iou (None): the IoU threshold to use to determine matches
        classwise (None): whether to only match objects with the same class
            label (True) or allow matches between classes (False)
        iscrowd ("iscrowd"): the name of the crowd attribute
        compute_mAP (False): whether to perform the necessary computations so
            that mAP and PR curves can be generated
        iou_threshs (None): a list of IoU thresholds to use when computing mAP
            and PR curves. Only applicable when ``compute_mAP`` is True
        max_preds (None): the maximum number of predicted objects to evaluate
            when computing mAP and PR curves. Only applicable when
            ``compute_mAP`` is True
    """

    def __init__(
        self,
        pred_field,
        gt_field,
        iou=None,
        classwise=None,
        iscrowd="iscrowd",
        compute_mAP=False,
        iou_threshs=None,
        max_preds=None,
        **kwargs
    ):
        super().__init__(
            pred_field, gt_field, iou=iou, classwise=classwise, **kwargs
        )

        if compute_mAP and iou_threshs is None:
            iou_threshs = [x / 100 for x in range(50, 100, 5)]

        if compute_mAP and max_preds is None:
            max_preds = 100

        self.iscrowd = iscrowd
        self.compute_mAP = compute_mAP
        self.iou_threshs = iou_threshs
        self.max_preds = max_preds

    @property
    def method(self):
        return "coco"


class COCOEvaluation(DetectionEvaluation):
    """COCO-style evaluation.

    Args:
        config: a :class:`COCOEvaluationConfig`
    """

    def __init__(self, config):
        super().__init__(config)

        if config.iou is None:
            raise ValueError(
                "You must specify an `iou` threshold in order to run COCO "
                "evaluation"
            )

        if config.classwise is None:
            raise ValueError(
                "You must specify a `classwise` value in order to run COCO "
                "evaluation"
            )

    def evaluate_image(self, sample_or_frame, eval_key=None):
        """Performs COCO-style evaluation on the given image.

        Predicted objects are matched to ground truth objects in descending
        order of confidence, with matches requiring a minimum IoU of
        ``self.config.iou``.

        The ``self.config.classwise`` parameter controls whether to only match
        objects with the same class label (True) or allow matches between
        classes (False).

        If a ground truth object has its ``self.config.iscrowd`` attribute set,
        then the object can have multiple true positive predictions matched to
        it.

        Args:
            sample_or_frame: a :class:`fiftyone.core.Sample` or
                :class:`fiftyone.core.frame.Frame`
            eval_key (None): the evaluation key for this evaluation

        Returns:
            a list of matched ``(gt_label, pred_label, iou, pred_confidence)``
            tuples
        """
        gts = sample_or_frame[self.config.gt_field]
        preds = sample_or_frame[self.config.pred_field]

        if eval_key is None:
            # Don't save results on user's data
            eval_key = "eval"
            gts = gts.copy()
            preds = preds.copy()

        return _coco_evaluation_single_iou(gts, preds, eval_key, self.config)

    def generate_results(
        self, samples, matches, eval_key=None, classes=None, missing=None
    ):
        """Generates aggregate evaluation results for the samples.

        If ``self.config.compute_mAP`` is True, this method performs COCO-style
        evaluation as in :meth:`evaluate_image` to generate precision and
        recall sweeps over the range of IoU thresholds in
        ``self.config.iou_threshs``. In this case, a
        :class:`COCODetectionResults` instance is returned that can compute
        mAP and PR curves.

        Args:
            samples: a :class:`fiftyone.core.SampleCollection`
            matches: a list of ``(gt_label, pred_label, iou, pred_confidence)``
                matches. Either label can be ``None`` to indicate an unmatched
                object
            eval_key (None): the evaluation key for this evaluation
            classes (None): the list of possible classes. If not provided, the
                observed ground truth/predicted labels are used for results
                purposes
            missing ("none"): a missing label string. Any unmatched objects are
                given this label for results purposes

        Returns:
            a :class:`DetectionResults`
        """
        if not self.config.compute_mAP:
            return DetectionResults(matches, classes=classes, missing=missing)

        pred_field = self.config.pred_field
        gt_field = self.config.gt_field
        iou_threshs = self.config.iou_threshs

        thresh_matches = {t: {} for t in iou_threshs}
        if classes is None:
            classes = []

        # IoU sweep
        logger.info("Performing IoU sweep...")
        with fou.ProgressBar() as pb:
            for sample in pb(samples):
                # Don't mess with the user's data
                gts = sample[gt_field].copy()
                preds = sample[pred_field].copy()

                sample_matches = _coco_evaluation_iou_sweep(
                    gts, preds, self.config
                )

                for t, ms in sample_matches.items():
                    for m in ms:
                        # m = (gt_label, pred_label, iou, confidence, iscrowd)
                        if m[4]:
                            continue

                        c = m[0] if m[0] != None else m[1]
                        if c not in classes:
                            classes.append(c)

                        if c not in thresh_matches[t]:
                            thresh_matches[t][c] = {
                                "tp": [],
                                "fp": [],
                                "num_gt": 0,
                            }

                        if m[0] == m[1]:
                            thresh_matches[t][c]["tp"].append(m)
                        elif m[1]:
                            thresh_matches[t][c]["fp"].append(m)

                        if m[0]:
                            thresh_matches[t][c]["num_gt"] += 1

        # Compute precision-recall array
        # Reference:
        # https://github.com/cocodataset/cocoapi/blob/master/PythonAPI/pycocotools/cocoeval.py
        precision = -np.ones((len(iou_threshs), len(classes), 101))
        recall = np.linspace(0, 1, 101)
        for t in thresh_matches.keys():
            for c in thresh_matches[t].keys():
                tp = thresh_matches[t][c]["tp"]
                fp = thresh_matches[t][c]["fp"]
                num_gt = thresh_matches[t][c]["num_gt"]
                if num_gt == 0:
                    continue

                tp_fp = [1] * len(tp) + [0] * len(fp)
                confs = [p[3] for p in tp] + [p[3] for p in fp]
                inds = np.argsort(-np.array(confs), kind="mergesort")
                tp_fp = np.array(tp_fp)[inds]
                tp_sum = np.cumsum(tp_fp).astype(dtype=np.float)
                total = np.arange(1, len(tp_fp) + 1).astype(dtype=np.float)

                pre = tp_sum / total
                rec = tp_sum / num_gt

                q = np.zeros((101,))
                for i in range(len(pre) - 1, 0, -1):
                    if pre[i] > pre[i - 1]:
                        pre[i - 1] = pre[i]

                inds = np.searchsorted(rec, recall, side="left")
                try:
                    for ri, pi in enumerate(inds):
                        q[ri] = pre[pi]
                except:
                    pass

                precision[iou_threshs.index(t)][classes.index(c)] = q

        return COCODetectionResults(
            matches, precision, recall, iou_threshs, classes, missing=missing
        )


class COCODetectionResults(DetectionResults):
    """Class that stores the results of a COCO detection evaluation.

    Args:
        matches: a list of ``(gt_label, pred_label, iou, pred_confidence)``
            matches. Either label can be ``None`` to indicate an unmatched
            object
        precision: an array of precision values of shape
            ``num_iou_threshs x num_classes x num_recall``
        recall: an array of recall values
        iou_threshs: the list of IoU thresholds
        classes: the list of possible classes
        missing ("none"): a missing label string. Any unmatched objects are
            given this label for evaluation purposes
    """

    def __init__(
        self, matches, precision, recall, iou_threshs, classes, missing="none"
    ):
        super().__init__(matches, classes=classes, missing=missing)
        self.precision = precision
        self.recall = recall
        self.iou_threshs = iou_threshs
        self._classwise_AP = np.mean(precision, axis=(0, 2))

    def plot_pr_curves(
        self,
        classes=None,
        ax=None,
        figsize=None,
        block=False,
        return_ax=False,
        **kwargs
    ):
        """Plots precision-recall (PR) curves for the detection results.

        Args:
            classes (None): a list of classes to generate curves for. By
                default, top 3 AP classes will be plotted
            ax (None): an optional matplotlib axis to plot in
            figsize (None): an optional ``(width, height)`` for the figure, in
                inches
            block (False): whether to block execution when the plot is
                displayed via ``matplotlib.pyplot.show(block=block)``
            return_ax (False): whether to return the matplotlib axis containing
                the plots
            **kwargs: optional keyword arguments for
                ``sklearn.metrics.PrecisionRecallDisplay.plot(**kwargs)``

        Returns:
            None, or, if ``return_ax`` is True, the matplotlib axis containing
            the plots
        """
        if not classes:
            inds = np.argsort(self._classwise_AP)[::-1][:3]
            classes = [self.classes[i] for i in inds]

        for c in classes:
            class_ind = self.classes.index(c)
            precision = np.mean(self.precision[:, class_ind], axis=0)
            avg_precision = np.mean(precision)
            display = skm.PrecisionRecallDisplay(
                precision=precision, recall=self.recall
            )
            label = "AP = %.2f, class = %s" % (avg_precision, c)
            display.plot(ax=ax, label=label, **kwargs)
            ax = display.ax_

        if figsize is not None:
            display.figure_.set_size_inches(*figsize)

        plt.show(block=block)
        return ax if return_ax else None

    def mAP(self, classes=None):
        """Computes COCO-style mean average precision (mAP) for the specified
        classes.

        See `this page <https://github.com/cocodataset/cocoapi/blob/master/PythonAPI/pycocotools/cocoeval.py>`_
        for more details about COCO-style mAP.

        Args:
            classes (None): a list of classes for which to compute mAP

        Returns:
            the mAP in ``[0, 1]``
        """
        if classes is not None:
            class_inds = [self.classes.index(c) for c in classes]
            classwise_AP = self._classwise_AP[class_inds]
        else:
            classwise_AP = self._classwise_AP

        classwise_AP = classwise_AP[classwise_AP > -1]
        if classwise_AP.size == 0:
            return -1

        return np.mean(classwise_AP)


_NO_MATCH_ID = ""
_NO_MATCH_IOU = -1


def _coco_evaluation_single_iou(gts, preds, eval_key, config):
    iou_thresh = min(config.iou, 1 - 1e-10)
    id_key = "%s_id" % eval_key
    iou_key = "%s_iou" % eval_key

    cats, pred_ious, iscrowd = _coco_evaluation_setup(
        gts, preds, [id_key], iou_key, config
    )

    matches = _compute_matches(
        cats,
        pred_ious,
        iou_thresh,
        iscrowd,
        eval_key=eval_key,
        id_key=id_key,
        iou_key=iou_key,
    )

    # omit iscrowd
    return [m[:4] for m in matches]


def _coco_evaluation_iou_sweep(gts, preds, config):
    iou_threshs = config.iou_threshs
    id_keys = ["eval_id_%s" % str(i).replace(".", "_") for i in iou_threshs]
    iou_key = "eval_iou"

    cats, pred_ious, iscrowd = _coco_evaluation_setup(
        gts, preds, id_keys, iou_key, config, max_preds=config.max_preds
    )

    matches = {
        i: _compute_matches(
            cats,
            pred_ious,
            i,
            iscrowd,
            eval_key="eval",
            id_key=k,
            iou_key=iou_key,
        )
        for i, k in zip(iou_threshs, id_keys)
    }

    return matches


def _coco_evaluation_setup(
    gts, preds, id_keys, iou_key, config, max_preds=None
):
    iscrowd = _make_iscrowd_fcn(config.iscrowd)
    classwise = config.classwise

    # Organize preds and GT by category
    cats = defaultdict(lambda: defaultdict(list))
    for det in preds.detections:
        det[iou_key] = _NO_MATCH_IOU
        for id_key in id_keys:
            det[id_key] = _NO_MATCH_ID

        label = det.label if classwise else "all"
        cats[label]["preds"].append(det)

    for det in gts.detections:
        det[iou_key] = _NO_MATCH_IOU
        for id_key in id_keys:
            det[id_key] = _NO_MATCH_ID

        label = det.label if classwise else "all"
        cats[label]["gts"].append(det)

    # Compute IoUs within each category
    pred_ious = {}
    for objects in cats.values():
        gts = objects["gts"]
        preds = objects["preds"]

        # Highest confidence predictions first
        preds = sorted(preds, key=lambda p: p.confidence or -1, reverse=True)

        if max_preds is not None:
            preds = preds[:max_preds]

        objects["preds"] = preds

        # Sort ground truth so crowds are last
        gts = sorted(gts, key=iscrowd)

        # Compute ``num_preds x num_gts`` IoUs
        ious = _compute_iou(preds, gts, iscrowd)

        gt_ids = [g.id for g in gts]
        for pred, gt_ious in zip(preds, ious):
            pred_ious[pred.id] = list(zip(gt_ids, gt_ious))

    return cats, pred_ious, iscrowd


def _compute_matches(
    cats, pred_ious, iou_thresh, iscrowd, eval_key, id_key, iou_key
):
    matches = []

    # Match preds to GT, highest confidence first
    for cat, objects in cats.items():
        gt_map = {gt.id: gt for gt in objects["gts"]}

        # Match each prediction to the highest available IoU ground truth
        for pred in objects["preds"]:
            if pred.id in pred_ious:
                best_match = None
                best_match_iou = iou_thresh
                for gt_id, iou in pred_ious[pred.id]:
                    gt = gt_map[gt_id]
                    gt_iscrowd = iscrowd(gt)

                    # Only iscrowd GTs can have multiple matches
                    if gt[id_key] != _NO_MATCH_ID and not gt_iscrowd:
                        continue

                    # If matching classwise=False
                    # Only objects with the same class can match a crowd
                    if gt_iscrowd and gt.label != pred.label:
                        continue

                    # Crowds are last in order of gts
                    # If we already matched a non-crowd and are on a crowd,
                    # then break
                    if (
                        best_match
                        and not iscrowd(gt_map[best_match])
                        and gt_iscrowd
                    ):
                        break

                    if iou < best_match_iou:
                        continue

                    best_match_iou = iou
                    best_match = gt_id

                if best_match:
                    gt = gt_map[best_match]
                    tag = "tp" if gt.label == pred.label else "fp"
                    gt[eval_key] = tag
                    gt[id_key] = pred.id
                    gt[iou_key] = best_match_iou
                    pred[eval_key] = tag
                    pred[id_key] = best_match
                    pred[iou_key] = best_match_iou
                    matches.append(
                        (
                            gt.label,
                            pred.label,
                            best_match_iou,
                            pred.confidence,
                            iscrowd(gt),
                        )
                    )
                else:
                    pred[eval_key] = "fp"
                    matches.append(
                        (None, pred.label, None, pred.confidence, None)
                    )

            elif pred.label == cat:
                pred[eval_key] = "fp"
                matches.append((None, pred.label, None, pred.confidence, None))

        # Leftover GTs are false negatives
        for gt in objects["gts"]:
            if gt[id_key] == _NO_MATCH_ID:
                gt[eval_key] = "fn"
                matches.append((gt.label, None, None, None, iscrowd(gt)))

    return matches


def _compute_iou(preds, gts, iscrowd):
    ious = np.zeros((len(preds), len(gts)))
    for j, gt in enumerate(gts):
        gx, gy, gw, gh = gt.bounding_box
        gt_area = gh * gw
        gt_crowd = iscrowd(gt)
        for i, pred in enumerate(preds):
            px, py, pw, ph = pred.bounding_box

            # Width of intersection
            w = min(px + pw, gx + gw) - max(px, gx)
            if w <= 0:
                continue

            # Height of intersection
            h = min(py + ph, gy + gh) - max(py, gy)
            if h <= 0:
                continue

            pred_area = ph * pw
            inter = h * w
            union = pred_area if gt_crowd else pred_area + gt_area - inter
            ious[i, j] = inter / union

    return ious


def _make_iscrowd_fcn(iscrowd_attr):
    def _iscrowd(detection):
        if iscrowd_attr in detection.attributes:
            return bool(detection.attributes[iscrowd_attr].value)

        try:
            return bool(detection[iscrowd_attr])
        except KeyError:
            return False

    return _iscrowd
