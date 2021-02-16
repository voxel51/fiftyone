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

import pycocotools.mask as maskUtils

import eta.core.utils as etau

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
        iou (None): the IoU threshold to use to determine matches
        classwise (None): whether to only match objects with the same class
            label (True) or allow matches between classes (False)
        iscrowd ("iscrowd"): the name of the crowd attribute
        iou_threshs ([0.5::0.05::0.95]): a list of IoU thresholds to use when
            computing mAP and PR curves
        maxDets (100): the maximum number of detections to evaluate per image
    """

    def __init__(
        self, iscrowd="iscrowd", iou_threshs=None, maxDets=100, **kwargs
    ):
        super().__init__(**kwargs)
        self.iscrowd = iscrowd
        self.iou_threshs = iou_threshs
        if not self.iou_threshs:
            self.iou_threshs = [x / 100 for x in range(50, 100, 5)]
        self.maxDets = maxDets

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

    def evaluate_image(
        self, sample_or_frame, gt_field, pred_field, eval_key=None
    ):
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
            pred_field: the name of the field containing the predicted
                :class:`fiftyone.core.labels.Detections` instances
            gt_field: the name of the field containing the ground truth
                :class:`fiftyone.core.labels.Detections` instances
            eval_key (None): an evaluation key for this evaluation

        Returns:
            a list of matched ``(gt_label, pred_label, iou, pred_confidence)``
            tuples
        """
        gts = sample_or_frame[gt_field]
        preds = sample_or_frame[pred_field]

        if eval_key is None:
            # Don't save results on user's copy of the data
            eval_key = "eval"
            gts = gts.copy()
            preds = preds.copy()

        return _coco_evaluation_single_iou(gts, preds, eval_key, self.config)

    def evaluate_samples(
        self,
        samples,
        gt_field,
        pred_field,
        matches=None,
        classes=None,
        missing="none",
    ):
        """Generates aggregate results on the dataset.
        
        Performs COCO-style evaluation to compute AP on samples.

        Predicted objects are matched to ground truth objects in descending
        order of confidence, over a sweep of IoU values [0.5::0.05::0.95].

        The ``self.config.classwise`` parameter controls whether to only match
        objects with the same class label (True) or allow matches between
        classes (False).

        If a ground truth object has its ``self.config.iscrowd`` attribute set,
        then the object can have multiple true positive predictions matched to
        it.

        Args:
            samples: a :class:`fiftyone.core.SampleCollection`
            gt_field: the name of the field containing the ground truth
                :class:`fiftyone.core.labels.Detections` instances
            pred_field: the name of the field containing the predicted
                :class:`fiftyone.core.labels.Detections` instances
            matches: (None) a list of matched ``(gt_label, pred_label, iou, pred_confidence)``
                tuples
            classes (None): the list of possible classes. If not provided, the
                observed ground truth/predicted labels are used for results
                purposes
            missing ("none"): a missing label string. Any unmatched objects are
                given this label for results purposes


        Returns:
            a :class:`COCODetectionResults` 
        """
        iou_threshs = list(self.config.iou_threshs)

        save_matches = False
        if not matches:
            save_matches = True
            matches = []

        thresh_matches = {t: {} for t in iou_threshs}
        if not classes:
            classes = []
        logger.info("Computing mAP...")
        with fou.ProgressBar() as pb:
            for sample in pb(samples):
                gts = sample[gt_field].copy()
                preds = sample[pred_field].copy()

                sample_matches = _coco_evaluation_iou_sweep(
                    gts, preds, self.config
                )

                if save_matches:
                    matches += sample_matches[0.5]

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

        precision = -np.ones((len(iou_threshs), len(classes), 101))
        recall = np.linspace(0, 1, 101)
        for t in thresh_matches.keys():
            for c in thresh_matches[t].keys():
                # Adapted from pycocotools
                # https://github.com/cocodataset/cocoapi/blob/master/PythonAPI/pycocotools/cocoeval.py
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

        results = COCODetectionResults(
            precision,
            recall,
            matches=matches,
            classes=classes,
            missing=missing,
        )

        return results


_NO_MATCH_ID = ""
_NO_MATCH_IOU = -1


def _coco_evaluation_single_iou(gts, preds, eval_key, config):
    id_key = "%s_id" % eval_key
    iou_key = "%s_iou" % eval_key
    iscrowd = _make_iscrowd_fcn(config.iscrowd)
    iou_thresh = min(config.iou, 1 - 1e-10)

    cats, pred_ious = _coco_evaluation_setup(
        gts, preds, [id_key], iou_key, config
    )

    matches = [
        m[:4]
        for m in _compute_matches(
            cats,
            pred_ious,
            iou_thresh,
            iscrowd,
            eval_key=eval_key,
            id_key=id_key,
            iou_key=iou_key,
        )
    ]

    return matches


def _coco_evaluation_iou_sweep(gts, preds, config):
    iou_threshs = config.iou_threshs
    id_keys = ["eval_id_%s" % str(i).replace(".", "_") for i in iou_threshs]
    iou_key = "eval_iou"
    iscrowd = _make_iscrowd_fcn(config.iscrowd)

    # Perform classwise matching over 10 IoUs [0.5::0.05::0.95]

    cats, pred_ious = _coco_evaluation_setup(
        gts, preds, id_keys, iou_key, config
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


def _coco_evaluation_setup(gts, preds, id_keys, iou_key, config):
    iscrowd = _make_iscrowd_fcn(config.iscrowd)
    classwise = config.classwise
    maxDets = config.maxDets

    # Organize preds and GT by category
    cats = defaultdict(lambda: defaultdict(list))
    for det in preds.detections:
        for id_key in id_keys:
            det[id_key] = _NO_MATCH_ID
        det[iou_key] = _NO_MATCH_IOU

        label = det.label if classwise else "all"
        cats[label]["preds"].append(det)

    for det in gts.detections:
        for id_key in id_keys:
            det[id_key] = _NO_MATCH_ID
        det[iou_key] = _NO_MATCH_IOU

        label = det.label if classwise else "all"
        cats[label]["gts"].append(det)

    # Compute IoUs within each category
    pred_ious = {}
    for objects in cats.values():
        gts = objects["gts"]
        preds = objects["preds"]

        # Highest confidence predictions first
        preds = sorted(preds, key=lambda p: p.confidence or -1, reverse=True)[
            :maxDets
        ]
        objects["preds"] = preds

        # Sort ground truth so crowds are last
        gts_crowd = []
        gts_no_crowd = []
        for g in gts:
            if iscrowd(g):
                gts_crowd.append(g)
            else:
                gts_no_crowd.append(g)

        gts = gts_no_crowd + gts_crowd

        # Compute ``num_preds x num_gts`` IoUs
        ious = _compute_iou(preds, gts, iscrowd)

        gt_ids = [g.id for g in gts]
        for pred, gt_ious in zip(preds, ious):
            pred_ious[pred.id] = list(zip(gt_ids, gt_ious))

    return cats, pred_ious


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
                    # Only iscrowd GTs can have multiple matches
                    gt = gt_map[gt_id]
                    if gt[id_key] != _NO_MATCH_ID and not iscrowd(gt):
                        continue

                    # Crowds are last in order of gts
                    # If we already matched a non-crowd and are on a crowd,
                    # then break
                    if (
                        best_match
                        and not iscrowd(gt_map[best_match])
                        and iscrowd(gt)
                    ):
                        break

                    if iou < best_match_iou:
                        continue

                    best_match_iou = iou
                    best_match = gt_id

                if best_match:
                    gt = gt_map[best_match]
                    gt[id_key] = pred.id
                    gt[iou_key] = best_match_iou
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
                    if gt.label == pred.label:
                        gt[eval_key] = "tp"
                        pred[eval_key] = "tp"

                    else:
                        # If classwise = False, matched gt and pred could have
                        # different labels
                        gt[eval_key] = "fp"
                        pred[eval_key] = "fp"

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


class COCODetectionResults(DetectionResults):
    """Class that stores the results of a COCO detection evaluation.

    This differs from standard detection evaluation by adding COCO-style
    calculated mAP and PR curves.

    Args:
        matches: a list of ``(gt_label, pred_label, iou, pred_confidence)``
            matches. Either label can be ``None`` to indicate an unmatched
            object
        precision: a Numpy array of shape ``(IoU thresholds,
            classes, len(recall))`` containing precision curves over a range of
            recall scores for every class and IoU threshold 
        recall: a 1D array containing recall values related to the given
            precision
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used
        missing ("none"): a missing label string. Any unmatched objects are
            given this label for evaluation purposes
    """

    def __init__(
        self, precision, recall, matches, classes=None, missing="none",
    ):
        super().__init__(matches, classes=classes, missing=missing)
        self.precision = precision
        self.recall = recall
        self.classwise_AP = self._compute_classwise_mAP(self.precision)

    def _compute_classwise_mAP(self, precision):
        classwise_AP = np.mean(precision, axis=(0, 2))
        return classwise_AP

    def plot_pr_curves(self, classes=None, ax=None, block=False, **kwargs):
        """Plot precision-recall (PR) curves for COCO detection results.

        Args:
            classes (None): the classes to generate plots for, by default will
                plot the top 3 AP class
            average ("micro"): the averaging strategy to use when computing
                average precision
            ax (None): an optional matplotlib axis to plot in
            block (False): whether to block execution when the plot is
                displayed via ``matplotlib.pyplot.show(block=block)``
            **kwargs: optional keyword arguments for
                ``sklearn.metrics.PrecisionRecallDisplay.plot(**kwargs)``

        Returns:
            the matplotlib axis containing the plots
        """
        if not classes:
            print(
                "No classes specified, plotting PR curve of the 3 highest AP classes"
            )
            max_class_inds = np.argsort(self.classwise_AP)[::-1][:3]
            classes = list(np.array(self.classes)[max_class_inds])

        for c in classes:
            class_ind = self.classes.index(c)
            precision = np.mean(self.precision[:, class_ind], axis=0)
            recall = self.recall
            avg_precision = np.mean(precision)
            display = skm.PrecisionRecallDisplay(
                precision=precision, recall=recall
            )
            label = "AP = %.2f, class = %s" % (avg_precision, c)
            display.plot(ax=ax, label=label, **kwargs)
            ax = display.ax_
        plt.show(block=block)

        return ax

    def mAP(self, classes=None):
        """Computes mAP for provided classes.

        mAP is the average of classwise AP as computed in pycocotools.
        https://github.com/cocodataset/cocoapi/blob/master/PythonAPI/pycocotools/cocoeval.py

        Args:
            classes (None): an optional list of classes for which to compute
                mAP

        Returns:
            mAP floating point value 
        """
        if classes != None:
            class_inds = [self.classes.index(c) for c in classes]
            classwise_AP = np.array(self.classwise_AP)[class_inds]
        else:
            classwise_AP = np.array(self.classwise_AP)

        existing_classes = classwise_AP > -1

        if len(existing_classes) == 0:
            mAP = -1
        else:
            mAP = np.mean(classwise_AP[existing_classes])

        return mAP
