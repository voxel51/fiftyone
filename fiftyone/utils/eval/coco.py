"""
COCO-style detection evaluation.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict

import numpy as np

import eta.core.utils as etau

from .detection import DetectionEvaluation, DetectionEvaluationConfig


class COCOEvaluationConfig(DetectionEvaluationConfig):
    """COCO-style evaluation config.

    Args:
        iou (None): the IoU threshold to use to determine matches
        classwise (None): whether to only match objects with the same class
            label (True) or allow matches between classes (False)
        iscrowd ("iscrowd"): the name of the crowd attribute
        iou_threshs([0.5::0.05::0.95]): 10 IoU thresholds used to compute mAP
    """

    def __init__(self, iscrowd="iscrowd", **kwargs):
        super().__init__(**kwargs)
        self.iscrowd = iscrowd
        self.iou_threshs = np.arange(0.5, 1, 0.05)

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
            sample_or_frame: a :class:`fiftyone.core.Sample` or
                :class:`fiftyone.core.frame.Frame`
            pred_field: the name of the field containing the predicted
                :class:`fiftyone.core.labels.Detections` instances
            gt_field: the name of the field containing the ground truth
                :class:`fiftyone.core.labels.Detections` instances
            matches: (None) a list of matched ``(gt_label, pred_label, iou, pred_confidence)``
                tuples
            classes (None): the list of possible classes. If not provided, the
                observed ground truth/predicted labels are used for results
                purposes
            missing ("none"): a missing label string. Any unmatched objects are
                given this label for results purposes


        Returns:
            a list of matched ``(gt_label, pred_label, iou, pred_confidence)``
            tuples
        """
        iou_threshs = list(self.config.iou_threshs)
        matches = {t: {} for t in iou_threshs}
        if not classes:
            classes = []
        for sample in samples:
            gts = sample[gt_field].copy()
            preds = sample[pred_field].copy()

            sample_matches = _coco_evaluation_iou_sweep(
                gts, preds, self.config
            )
            for t, ms in sample_matches.items():
                for m in ms:
                    # m = (gt_label, pred_label, iou, confidence)
                    c = m[0] if m[0] != None else m[1]
                    if c not in classes:
                        classes.append(c)
                    if c not in matches[t]:
                        matches[t][c] = {"tp": [], "fp": [], "num_gt": 0}
                    if m[0] == m[1]:
                        matches[t][c]["tp"].append(m)
                    elif m[1]:
                        matches[t][c]["fp"].append(m)
                    if m[0]:
                        matches[t][c]["num_gt"] += 1

        import matplotlib.pyplot as plt

        precision = -np.ones((len(matches.keys()), len(classes), 101))
        for t in matches.keys():
            for c in matches[t].keys():
                # Adapted from pycocotools
                # https://github.com/cocodataset/cocoapi/blob/master/PythonAPI/pycocotools/cocoeval.py
                tp = matches[t][c]["tp"]
                fp = matches[t][c]["fp"]
                num_gt = matches[t][c]["num_gt"]
                if num_gt == 0:
                    continue

                tp_fp = [1] * len(tp) + [0] * len(fp)
                confs = [p[3] for p in tp] + [p[3] for p in fp]
                inds = np.argsort(-np.array(confs), kind="mergesort")
                tp_fp = np.array(tp_fp)[inds][:100]
                tp_sum = np.cumsum(tp_fp).astype(dtype=np.float)
                total = np.arange(1, len(tp_fp) + 1).astype(dtype=np.float)

                pre = tp_sum / total
                rec = tp_sum / num_gt

                q = np.zeros((101,))
                for i in range(len(pre) - 1, 0, -1):
                    if pre[i] > pre[i - 1]:
                        pre[i - 1] = pre[i]
                inds = np.searchsorted(
                    rec, np.linspace(0, 1, 101), side="left"
                )
                try:
                    for ri, pi in enumerate(inds):
                        q[ri] = pre[pi]
                except:
                    pass
                # plt.plot(q, np.linspace(0,1,101))
                # plt.title(c+"_"+str(t))
                # plt.show()
                precision[iou_threshs.index(t)][classes.index(c)] = q

        if len(precision[precision > -1]) == 0:
            mAP = -1
        else:
            mAP = np.mean(precision[precision > -1])

        print(mAP)
        import pdb

        pdb.set_trace()


_NO_MATCH_ID = ""
_NO_MATCH_IOU = -1


def _coco_evaluation_single_iou(gts, preds, eval_key, config):
    id_key = "%s_id" % eval_key
    iou_key = "%s_iou" % eval_key
    iscrowd = _make_iscrowd_fcn(config.iscrowd)
    iou_thresh = min(config.iou, 1 - 1e-10)

    cats, pred_ious = _coco_evaluation_setup(
        gts, preds, id_key, iou_key, config
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

    return matches


def _coco_evaluation_iou_sweep(gts, preds, config):
    id_key = "eval_id"
    iou_key = "eval_iou"
    iscrowd = _make_iscrowd_fcn(config.iscrowd)

    # Perform classwise matching over 10 IoUs [0.5::0.05::0.95]

    cats, pred_ious = _coco_evaluation_setup(
        gts, preds, id_key, iou_key, config
    )

    iou_threshs = config.iou_threshs

    matches = {
        i: _compute_matches(
            cats,
            pred_ious,
            i,
            iscrowd,
            eval_key="eval",
            id_key=id_key,
            iou_key=iou_key,
        )
        for i in iou_threshs
    }

    return matches


def _coco_evaluation_setup(gts, preds, id_key, iou_key, config):
    iscrowd = _make_iscrowd_fcn(config.iscrowd)
    classwise = config.classwise

    # Organize preds and GT by category
    cats = defaultdict(lambda: defaultdict(list))
    for det in preds.detections:
        det[id_key] = _NO_MATCH_ID
        det[iou_key] = _NO_MATCH_IOU

        label = det.label if classwise else "all"
        cats[label]["preds"].append(det)

    for det in gts.detections:
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
        preds = sorted(preds, key=lambda p: p.confidence or -1, reverse=True)
        objects["preds"] = preds

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
                        (gt.label, pred.label, best_match_iou, pred.confidence)
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
                    matches.append((None, pred.label, None, pred.confidence))

            elif pred.label == cat:
                pred[eval_key] = "fp"
                matches.append((None, pred.label, None, pred.confidence))

        # Leftover GTs are false negatives
        for gt in objects["gts"]:
            if gt[id_key] == _NO_MATCH_ID:
                gt[eval_key] = "fn"
                matches.append((gt.label, None, None, None))

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
