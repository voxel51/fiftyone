"""
FiftyOne detection evaluation using pycocotools.

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
import pycocotools.mask as maskUtils

import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


IOU_THRESHOLDS = np.linspace(.5, 0.95, int(np.round((0.95 - .5) / .05)) + 1,
        endpoint=True)
IOU_THRESHOLD_STR = [str(iou).replace('.','_') for iou in IOU_THRESHOLDS]

def evaluate_detections(samples, pred_field, gt_field):
    """Iterates through each sample and matches predicted detections to ground
    truth detections. True and false positive counts for each IoU threshold are
    stored in every Detection object.

    Args:
        samples: an iterator of samples like a 
            :class:`fiftyone.core.dataset.Dataset` or
            :class:`fiftyone.core.view.DatasetView`  
        pred_field: a string indicating the field name in each sample containing
            predicted detections
        gt_field: a string indicating the field name in each sample containing
            ground truth detections
    """
    gt_key = "%s_eval" % pred_field
    pred_key = "%s_eval" % gt_field
    eval_id = 0
    
    logger.info("Evaluating detections for each sample")
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            preds = sample[pred_field]
            gts = sample[gt_field]
    
            # sort preds and gt detections by category label 
            sample_cats = {}
            for det in preds.detections:
                det[pred_key] = {}
                det[pred_key]["ious"] = {}
                det[pred_key]["matches"] = {
                        iou_str: {"gt_id": -1, "iou": -1} \
                            for iou_str in IOU_THRESHOLD_STR
                    } 
                det[pred_key]["eval_id"] = eval_id
                eval_id += 1
                if det.label not in sample_cats:
                    sample_cats[det.label] = {}
                    sample_cats[det.label]["preds"] = [det]
                    sample_cats[det.label]["gts"] = []
                sample_cats[det.label]["preds"].append(det)
    
            for det in gts.detections:
                det[gt_key] = {}
                det[gt_key]["matches"] = {
                        iou_str: {"pred_id": -1, "iou": -1} \
                            for iou_str in IOU_THRESHOLD_STR
                    } 

                det[gt_key]["eval_id"] = eval_id
                eval_id += 1
                if det.label not in sample_cats:
                    sample_cats[det.label] = {}
                    sample_cats[det.label]["preds"] = []
                    sample_cats[det.label]["gts"] = [det]
                sample_cats[det.label]["gts"].append(det)
    
            # Compute IoU for every detection and gt
            for cat, dets in sample_cats.items():
                gts = dets["gts"]
                preds = dets["preds"]
    
                inds = np.argsort([-p["confidence"] for p in preds],
                    kind='mergesort')
                preds = [preds[i] for i in inds]
                sample_cats[cat]["preds"] = preds
    
                gt_eval_ids = [g[gt_key]["eval_id"] for g in gts]

    
                gt_boxes = [list(g.bounding_box) for g in gts]
                pred_boxes = [list(p.bounding_box) for p in preds]
                
                iscrowd = [0]*len(gt_boxes)
                for gind, g in enumerate(gts):
                    if "iscrowd" in g.attributes:
                        iscrowd[gind] = g.attributes["iscrowd"].value
    
                # Get the iou of every prediction with every ground truth
                # Shape = [num_preds, num_gts]
                ious = maskUtils.iou(pred_boxes, gt_boxes, iscrowd)
    
                for pind, gt_ious in enumerate(ious):
                    preds[pind][pred_key]["ious"][cat] = list(zip(gt_eval_ids, gt_ious))
    
            # Starting with highest confidence prediction, match all with gts
            # Store true and false positives
            # This follows:
            # https://github.com/cocodataset/cocoapi/blob/8c9bcc3cf640524c4c20a9c40e89cb6a2f2fa0e9/PythonAPI/pycocotools/cocoeval.py#L273
            result_dict = {
                    "true_positives": {},
                    "false_positives": {},
                    "false_negatives": {}
                }

            for iou_ind, iou_thresh in enumerate(IOU_THRESHOLDS):
                iou_str = IOU_THRESHOLD_STR[iou_ind]
                true_positives = 0
                false_positives = 0
                for cat, dets in sample_cats.items():
                    gt_by_id = {g[gt_key]["eval_id"]: g for g in
                        dets["gts"]}
    
                    # Note: predictions were sorted by confidence in the previous 
                    # step
                    preds = dets["preds"]
                    
                    # Match each prediction to the highest IoU ground truth
                    # available
                    for pred in preds:
                        if cat in pred[pred_key]["ious"]:
                            best_match = -1
                            best_match_iou = min([iou_thresh, 1-1e-10])
                            for eval_id, iou in pred[pred_key]["ious"][cat]:
                                gt = gt_by_id[eval_id]
                                curr_gt_match = \
                                    gt[gt_key]["matches"][iou_str]["gt_id"]

                                if "iscrowd" in gt.attributes:
                                    iscrowd = int(gt.attributes["iscrowd"].value)
                                else:
                                    iscrowd = 0
    
                                # Cannot match two preds to the same gt unless
                                # the gt is a crowd
                                if curr_gt_match > -1 and not iscrowd:
                                    continue
    
                                # Ignore gts with an IoU lower than what was 
                                # already found
                                if iou < best_match_iou:
                                    continue
    
                                best_match_iou = iou
                                best_match = eval_id
    
                            if best_match > -1:
                                # If the prediction was matched, store the eval
                                # id of the pred in the gt and of the gt in the
                                # pred
                                gt_by_id[best_match][gt_key]["matches"][iou_str] = {
                                        "pred_id": pred[pred_key]["eval_id"],
                                        "iou": best_match_iou
                                    }
                                pred[pred_key]["matches"][iou_str] = {
                                        "gt_id": best_match, 
                                        "iou": best_match_iou
                                    }
                                true_positives += 1
                            else:
                                false_positives += 1
    
                result_dict["true_positives"][iou_str] = \
                    true_positives
                result_dict["false_positives"][iou_str] = \
                    false_positives
                false_negatives = len( 
                        [g for g in dets["gts"] 
                            if g[gt_key]["matches"][iou_str]["gt_id"] \
                                == -1]
                    )
    
                result_dict["false_negatives"][iou_str] = \
                    false_negatives

                # Add the top level fields for tps, fps, and fns of the most
                # recent evaluation for the ease of searching samples
                if iou_thresh == 0.75:
                    sample["tp_iou75"] = true_positives
                    sample["fp_iou75"] = false_positives
                    sample["fn_iou75"] = false_negatives

            sample[pred_field][pred_key] = result_dict

            # TODO: Compute sample-wise AP

            sample.save()
