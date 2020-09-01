"""
COCO-style detection evaluation.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import logging

import numpy as np

import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


IOU_THRESHOLDS = [round(0.5 + 0.05 * i, 2) for i in range(10)]
_IOU_THRESHOLD_STRS = [str(iou).replace(".", "_") for iou in IOU_THRESHOLDS]


def evaluate_detections(
    samples, pred_field, gt_field="ground_truth", save_iou=0.75
):
    """Evaluates the predicted detections in the given samples with respect to
    the specified ground truth detections for each of the following
    Intersection over Union (IoU) thresholds::

        [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]

    It should be noted that if a :class:`fiftyone.core.labels.Detection` in the
    ground truth field has a boolean attribute called `iscrowd`, then this
    detection will be matched to multiple predictions and result in them all
    being true positives, as per the evaluation strategy used by the COCO
    authors.

    Dictionaries are added to each predicted/ground truth
    :class:`fiftyone.core.labels.Detections` instance in the fields listed
    below; these fields tabulate the true positive (TP), false positive (FP),
    and false negative (FN) counts for the sample at each IoU::

        Ground truth:   detections.<pred_field>_eval
        Predictions:    detections.<gt_field>_eval

    Dictionaries are also added to each individual
    :class:`fiftyone.core.labels.Detection` instance in the fields listed
    below; these fields tabulate the IDs of the matching ground
    truth/prediction for the detection at each IoU::

        Ground truth:   detection.<pred_field>_eval
        Predictions:    detection.<gt_field>_eval

    In addition, true positive (TP), false positive (FP), and false negative
    (FN) counts at the specified ``save_iou`` are saved in the following
    top-level fields of each sample::

        TP: sample.tp_iou_<save_iou>
        FP: sample.fp_iou_<save_iou>
        FN: sample.fn_iou_<save_iou>

    where ``<save_iou> = str(save_iou).replace(".", "_")``.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances.
            For example, this may be a :class:`fiftyone.core.dataset.Dataset`
            or a :class:`fiftyone.core.view.DatasetView`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Detections` to evaluate
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Detections`
        save_iou (0.75): an IoU value for which to save per-sample TP/FP/FN
            counts as top-level sample fields
    """
    gt_key = "%s_eval" % pred_field
    pred_key = "%s_eval" % gt_field
    eval_id = 0

    try:
        save_iou_ind = IOU_THRESHOLDS.index(save_iou)
        save_iou_str = _IOU_THRESHOLD_STRS[save_iou_ind]
    except ValueError:
        logger.info(
            "IoU %f is not in the list of available IoU thresholds: %s",
            save_iou,
            IOU_THRESHOLDS,
        )
        save_iou_str = None

    logger.info("Evaluating detections...")
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            preds = sample[pred_field]
            gts = sample[gt_field]

            # Sort preds and gt detections by category label
            sample_cats = {}
            for det in preds.detections:
                det[pred_key] = {}
                det[pred_key]["ious"] = {}
                det[pred_key]["matches"] = {
                    iou_str: {"gt_id": -1, "iou": -1}
                    for iou_str in _IOU_THRESHOLD_STRS
                }
                det[pred_key]["pred_id"] = eval_id
                eval_id += 1
                if det.label not in sample_cats:
                    sample_cats[det.label] = {}
                    sample_cats[det.label]["preds"] = []
                    sample_cats[det.label]["gts"] = []
                sample_cats[det.label]["preds"].append(det)

            for det in gts.detections:
                det[gt_key] = {}
                det[gt_key]["matches"] = {
                    iou_str: {"pred_id": -1, "iou": -1}
                    for iou_str in _IOU_THRESHOLD_STRS
                }

                det[gt_key]["gt_id"] = eval_id
                eval_id += 1
                if det.label not in sample_cats:
                    sample_cats[det.label] = {}
                    sample_cats[det.label]["preds"] = []
                    sample_cats[det.label]["gts"] = []
                sample_cats[det.label]["gts"].append(det)

            # Compute IoU for every detection and gt
            for cat, dets in sample_cats.items():
                gts = dets["gts"]
                preds = dets["preds"]

                inds = np.argsort(
                    [-(p.confidence or 0.0) for p in preds], kind="mergesort"
                )
                preds = [preds[i] for i in inds]
                sample_cats[cat]["preds"] = preds

                gt_ids = [g[gt_key]["gt_id"] for g in gts]

                gt_boxes = [list(g.bounding_box) for g in gts]
                pred_boxes = [list(p.bounding_box) for p in preds]

                iscrowd = [False] * len(gt_boxes)
                for gind, g in enumerate(gts):
                    if "iscrowd" in g.attributes:
                        iscrowd[gind] = bool(g.attributes["iscrowd"].value)

                # Get the IoU of every prediction with every ground truth
                # shape = [num_preds, num_gts]
                ious = _compute_iou(pred_boxes, gt_boxes, iscrowd)

                for pind, gt_ious in enumerate(ious):
                    preds[pind][pred_key]["ious"][cat] = list(
                        zip(gt_ids, gt_ious)
                    )

            #
            # Starting with highest confidence prediction, match all with gts
            # Store true and false positives
            #
            # Reference implementation:
            # https://github.com/cocodataset/cocoapi/blob/8c9bcc3cf640524c4c20a9c40e89cb6a2f2fa0e9/PythonAPI/pycocotools/cocoeval.py#L273
            #
            result_dict = {
                "true_positives": {},
                "false_positives": {},
                "false_negatives": {},
            }

            for iou_ind, iou_thresh in enumerate(IOU_THRESHOLDS):
                iou_str = _IOU_THRESHOLD_STRS[iou_ind]
                true_positives = 0
                false_positives = 0
                for cat, dets in sample_cats.items():
                    gt_by_id = {g[gt_key]["gt_id"]: g for g in dets["gts"]}

                    # Note: predictions were sorted by confidence in the
                    # previous step
                    preds = dets["preds"]

                    # Match each prediction to the highest IoU ground truth
                    # available
                    for pred in preds:
                        if cat in pred[pred_key]["ious"]:
                            best_match = -1
                            best_match_iou = min([iou_thresh, 1 - 1e-10])
                            for gt_id, iou in pred[pred_key]["ious"][cat]:
                                gt = gt_by_id[gt_id]
                                curr_gt_match = gt[gt_key]["matches"][iou_str][
                                    "pred_id"
                                ]

                                if "iscrowd" in gt.attributes:
                                    iscrowd = bool(
                                        gt.attributes["iscrowd"].value
                                    )
                                else:
                                    iscrowd = False

                                # Cannot match two preds to the same gt unless
                                # the gt is a crowd
                                if curr_gt_match > -1 and not iscrowd:
                                    continue

                                # Ignore gts with an IoU lower than what was
                                # already found
                                if iou < best_match_iou:
                                    continue

                                best_match_iou = iou
                                best_match = gt_id

                            if best_match > -1:
                                # If the prediction was matched, store the eval
                                # id of the pred in the gt and of the gt in the
                                # pred
                                gt_to_store = gt_by_id[best_match][gt_key]
                                gt_to_store["matches"][iou_str] = {
                                    "pred_id": pred[pred_key]["pred_id"],
                                    "iou": best_match_iou,
                                }
                                pred[pred_key]["matches"][iou_str] = {
                                    "gt_id": best_match,
                                    "iou": best_match_iou,
                                }
                                true_positives += 1
                            else:
                                false_positives += 1

                        elif pred.label == cat:
                            false_positives += 1

                result_dict["true_positives"][iou_str] = true_positives
                result_dict["false_positives"][iou_str] = false_positives
                false_negatives = len(
                    [
                        g
                        for g in dets["gts"]
                        if g[gt_key]["matches"][iou_str]["pred_id"] == -1
                    ]
                )

                result_dict["false_negatives"][iou_str] = false_negatives

                if iou_str == save_iou_str:
                    sample["tp_iou_%s" % save_iou_str] = true_positives
                    sample["fp_iou_%s" % save_iou_str] = false_positives
                    sample["fn_iou_%s" % save_iou_str] = false_negatives

            sample[pred_field][pred_key] = result_dict

            # @todo compute sample-wise AP

            sample.save()


def save_tp_fp_fn_counts(samples, pred_field, gt_field, iou):
    """Saves the true positive (TP), false positive (FP), and false negative
    (FN) counts at the given IoU level in top-level fields of each sample.

    The counts are stored in the following fields::

        TP: sample.tp_iou_<iou>
        FP: sample.fp_iou_<iou>
        FN: sample.fn_iou_<iou>

    where ``<iou> = str(iou).replace(".", "_")``.

    The samples must have been previously evaluated by passing them to
    :meth:`evaluate_detections`.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances.
            For example, this may be a :class:`fiftyone.core.dataset.Dataset`
            or a :class:`fiftyone.core.view.DatasetView`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Detections` that were evaluated
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Detections`
        iou: the IoU value for which to save the TP/FP/FN counts
    """
    pred_key = "%s_eval" % gt_field
    save_iou_str = str(iou).replace(".", "_")

    try:
        iou_ind = IOU_THRESHOLDS.index(iou)
        iou_str = _IOU_THRESHOLD_STRS[iou_ind]
    except ValueError:
        logger.info(
            "IoU %f is not an available IoU threshold: %s", iou, IOU_THRESHOLDS
        )
        return

    logger.info("Saving TP/FP/FN counts for IoU %f...", iou)
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            result_dict = sample[pred_field][pred_key]
            true_positives = result_dict["true_positives"][iou_str]
            false_positives = result_dict["false_positives"][iou_str]
            false_negatives = result_dict["false_negatives"][iou_str]

            sample["tp_iou_%s" % save_iou_str] = true_positives
            sample["fp_iou_%s" % save_iou_str] = false_positives
            sample["fn_iou_%s" % save_iou_str] = false_negatives

            sample.save()


def _compute_iou(pred_boxes, gt_boxes, iscrowd):
    """Computes IoUs for predicted and ground truth bounding boxes for a single
    image. Bounding boxes should be in the format::

        [top-left-x, top-left-y, width, height]

    An intersection with a ground truth crowd object is always set to the area
    of the predicted bounding box.

    Args:
        pred_boxes: a list of predicted bounding box coordinates
        gt_boxes: a list of ground truth bounding box coordinates
        iscrowd: a boolean list corresponding to each ground truth box
            indicating whether it represents a crowd

    Returns:
        an array of IoU values computed for each provided predicted and ground
        truth box
    """
    ious = np.zeros((len(pred_boxes), len(gt_boxes)))
    for g, gt_box in enumerate(gt_boxes):
        gx, gy, gw, gh = gt_box
        crowd = iscrowd[g]
        g_area = gh * gw
        for p, pred_box in enumerate(pred_boxes):
            px, py, pw, ph = pred_box

            # Width of intersection
            w = min(px + pw, gx + gw) - max(px, gx)
            if w <= 0:
                continue

            # Height of intersection
            h = min(py + ph, gy + gh) - max(py, gy)
            if h <= 0:
                continue

            p_area = ph * pw
            inter = h * w
            union = p_area if crowd else p_area + g_area - inter
            ious[p, g] = inter / union

    return ious
