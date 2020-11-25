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

import fiftyone.core.media as fom
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


def evaluate_detections(
    samples,
    pred_field,
    gt_field="ground_truth",
    iou=0.75,
    classwise=True,
    save_sample_fields=True,
):
    """Evaluates the predicted detections in the given samples with respect to
    the specified ground truth detections using the specified Intersection over
    Union (IoU) threshold to determine matches.

    This method uses COCO-style evaluation. In particular, this means that if a
    :class:`fiftyone.core.labels.Detection` in the ground truth field has a
    boolean attribute called ``iscrowd``, then this detection can have multiple
    true positive predictions matched to it.

    Dictionaries are added to each predicted/ground truth
    :class:`fiftyone.core.labels.Detections` instance in the fields listed
    below; these fields tabulate the true positive (TP), false positive (FP),
    and false negative (FN) counts for the sample at the specified IoU::

        Ground truth:   detections.<pred_field>_eval
        Predictions:    detections.<gt_field>_eval

    Dictionaries are also added to each individual
    :class:`fiftyone.core.labels.Detection` instance in the fields listed
    below; these fields tabulate the IDs of the matching ground
    truth/prediction for the detection at the specified IoU::

        Ground truth:   detection.<pred_field>_eval
        Predictions:    detection.<gt_field>_eval

    In addition, if ``save_sample_fields == True``, true positive (TP), false
    positive (FP), and false negative (FN) counts at the specified IoU are
    saved in the following top-level fields of each sample::

        TP: sample.tp_iou_<iou>
        FP: sample.fp_iou_<iou>
        FN: sample.fn_iou_<iou>

    where ``<iou> = str(iou).replace(".", "_")``.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances.
            For example, this may be a :class:`fiftyone.core.dataset.Dataset`
            or a :class:`fiftyone.core.view.DatasetView`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Detections` to evaluate
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Detections`
        iou (0.75): an IoU value for which to compute
            per-detection and per-image TP/FP/FN
        classwise (True): whether to match objects within the same class (True)
            or between classes (False)
        save_sample_fields (True): whether to save TP, FP, and FN counts at the
            sample-level
    """
    gt_key = "%s_eval" % pred_field
    pred_key = "%s_eval" % gt_field
    eval_id = 0

    iou_str = str(iou).replace(".", "_")

    logger.info("Evaluating detections...")
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            # Get image(s) to process
            if sample.media_type == fom.VIDEO:
                images = sample.frames.values()
                has_frames = True
            else:
                images = [sample]
                has_frames = False

            # Initialize sample result dict tp, fp, fn = 0 for each IoU
            sample_result_dict = {
                "true_positives": 0,
                "false_positives": 0,
                "false_negatives": 0,
            }

            for image in images:
                preds = image[pred_field]
                gts = image[gt_field]

                # Sort preds and gt detections by category label
                image_cats = {}
                for det in preds.detections:
                    if pred_key not in det:
                        det[pred_key] = {}

                    if "matches" not in det[pred_key]:
                        det[pred_key]["matches"] = {
                            iou_str: {"gt_id": -1, "iou": -1}
                        }

                    else:
                        matches = dict(det[pred_key]["matches"])
                        matches[iou_str] = {"gt_id": -1, "iou": -1}
                        det[pred_key]["matches"] = matches

                    if classwise:
                        label = det.label
                    else:
                        label = "all"

                    if label not in image_cats:
                        image_cats[label] = {}
                        image_cats[label]["preds"] = []
                        image_cats[label]["gts"] = []

                    image_cats[label]["preds"].append(det)

                for det in gts.detections:
                    if gt_key not in det:
                        det[gt_key] = {}

                    if "matches" not in det[gt_key]:
                        det[gt_key]["matches"] = {
                            iou_str: {"pred_id": -1, "iou": -1}
                        }

                    else:
                        matches = dict(det[gt_key]["matches"])
                        matches[iou_str] = {"pred_id": -1, "iou": -1}
                        det[gt_key]["matches"] = matches

                    if classwise:
                        label = det.label
                    else:
                        label = "all"

                    if label not in image_cats:
                        image_cats[label] = {}
                        image_cats[label]["preds"] = []
                        image_cats[label]["gts"] = []

                    image_cats[label]["gts"].append(det)

                # Compute IoU for every detection and gt
                pred_ious = {}

                for cat, dets in image_cats.items():
                    gts = dets["gts"]
                    preds = dets["preds"]

                    inds = np.argsort(
                        [-(p.confidence or 0.0) for p in preds],
                        kind="mergesort",
                    )
                    preds = [preds[i] for i in inds]
                    image_cats[cat]["preds"] = preds

                    gt_ids = [g.id for g in gts]

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
                        pred_ious[preds[pind].id] = list(zip(gt_ids, gt_ious))

                #
                # Starting with highest confidence prediction, match all with
                # GTs. Store true and false positives
                #
                # Reference implementation:
                # https://github.com/cocodataset/cocoapi/blob/8c9bcc3cf640524c4c20a9c40e89cb6a2f2fa0e9/PythonAPI/pycocotools/cocoeval.py#L273
                #
                true_pos = 0
                false_pos = 0
                for cat, dets in image_cats.items():
                    gt_by_id = {g.id: g for g in dets["gts"]}

                    # Note: predictions were sorted by confidence in the
                    # previous step
                    preds = dets["preds"]

                    # Match each prediction to the highest IoU ground truth
                    # available
                    for pred in preds:
                        if pred.id in pred_ious:
                            best_match = -1
                            best_match_iou = min([iou, 1 - 1e-10])
                            for gt_id, det_iou in pred_ious[pred.id]:
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
                                if curr_gt_match != -1 and not iscrowd:
                                    continue

                                # Ignore gts with an IoU lower than what was
                                # already found
                                if det_iou < best_match_iou:
                                    continue

                                best_match_iou = det_iou
                                best_match = gt_id

                            if best_match != -1:
                                # If the prediction was matched, store the eval
                                # id of the pred in the gt and of the gt in the
                                # pred
                                gt_to_store = gt_by_id[best_match][gt_key]
                                gt_to_store["matches"][iou_str] = {
                                    "pred_id": pred.id,
                                    "iou": best_match_iou,
                                }
                                pred[pred_key]["matches"][iou_str] = {
                                    "gt_id": best_match,
                                    "iou": best_match_iou,
                                }
                                true_pos += 1
                            else:
                                false_pos += 1

                        elif pred.label == cat:
                            false_pos += 1

                sample_result_dict["true_positives"] += true_pos
                sample_result_dict["false_positives"] += false_pos
                false_neg = len(
                    [
                        g
                        for g in dets["gts"]
                        if g[gt_key]["matches"][iou_str]["pred_id"] == -1
                    ]
                )

                sample_result_dict["false_negatives"] += false_neg

                if save_sample_fields:
                    image["tp_iou_%s" % iou_str] = true_pos
                    image["fp_iou_%s" % iou_str] = false_pos
                    image["fn_iou_%s" % iou_str] = false_neg

            if has_frames and save_sample_fields:
                sample["tp_iou_%s" % iou_str] = sample_result_dict[
                    "true_positives"
                ]
                sample["fp_iou_%s" % iou_str] = sample_result_dict[
                    "false_positives"
                ]
                sample["fn_iou_%s" % iou_str] = sample_result_dict[
                    "false_negatives"
                ]

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
