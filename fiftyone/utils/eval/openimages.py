"""
Open Images-style detection evaluation.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.plots as fop
import fiftyone.utils.iou as foui

from .detection import (
    DetectionEvaluation,
    DetectionEvaluationConfig,
    DetectionResults,
)


class OpenImagesEvaluationConfig(DetectionEvaluationConfig):
    """Open Images-style evaluation config.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polylines`, or
            :class:`fiftyone.core.labels.Keypoints`
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polylines`, or
            :class:`fiftyone.core.labels.Keypoints`
        iou (None): the IoU threshold to use to determine matches
        classwise (None): whether to only match objects with the same class
            label (True) or allow matches between classes (False)
        iscrowd ("IsGroupOf"): the name of the crowd attribute
        use_masks (False): whether to compute IoUs using the instances masks in
            the ``mask`` attribute of the provided objects, which must be
            :class:`fiftyone.core.labels.Detection` instances
        use_boxes (False): whether to compute IoUs using the bounding boxes
            of the provided :class:`fiftyone.core.labels.Polyline` instances
            rather than using their actual geometries
        tolerance (None): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels. By
            default, IoUs are computed directly on the dense pixel masks
        max_preds (None): the maximum number of predicted objects to evaluate
            when computing mAP and PR curves
        error_level (1): the error level to use when manipulating instance
            masks or polylines. Valid values are:

            -   0: raise geometric errors that are encountered
            -   1: log warnings if geometric errors are encountered
            -   2: ignore geometric errors

            If ``error_level > 0``, any calculation that raises a geometric
            error will default to an IoU of 0
        hierarchy (None): an optional dict containing a hierarchy of classes for
            evaluation following the structure
            ``{"LabelName": label, "Subcategory": [{...}, ...]}``
        pos_label_field (None): the name of a field containing image-level
            :class:`fiftyone.core.labels.Classifications` that specify which
            classes should be evaluated in the image
        neg_label_field (None): the name of a field containing image-level
            :class:`fiftyone.core.labels.Classifications` that specify which
            classes should not be evaluated in the image
        expand_gt_hierarchy (True): whether to expand ground truth objects and
            labels according to the provided ``hierarchy``
        expand_pred_hierarchy (False): whether to expand predicted objects and
            labels according to the provided ``hierarchy``
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
    """

    def __init__(
        self,
        pred_field,
        gt_field,
        iou=None,
        classwise=None,
        iscrowd="IsGroupOf",
        use_masks=False,
        use_boxes=False,
        tolerance=None,
        max_preds=None,
        error_level=1,
        hierarchy=None,
        pos_label_field=None,
        neg_label_field=None,
        expand_gt_hierarchy=True,
        expand_pred_hierarchy=False,
        custom_metrics=None,
        **kwargs
    ):
        super().__init__(
            pred_field,
            gt_field,
            iou=iou,
            classwise=classwise,
            custom_metrics=custom_metrics,
            **kwargs,
        )

        self.iscrowd = iscrowd
        self.use_masks = use_masks
        self.use_boxes = use_boxes
        self.tolerance = tolerance
        self.max_preds = max_preds
        self.error_level = error_level
        self.hierarchy = hierarchy
        self.pos_label_field = pos_label_field
        self.neg_label_field = neg_label_field
        self.expand_gt_hierarchy = expand_gt_hierarchy
        self.expand_pred_hierarchy = expand_pred_hierarchy

        if expand_pred_hierarchy:
            if not hierarchy:
                self.expand_pred_hierarchy = False

            # If expand pred hierarchy is true, so is expand hierarchy
            self.expand_gt_hierarchy = self.expand_pred_hierarchy

        if expand_gt_hierarchy and not hierarchy:
            self.expand_gt_hierarchy = False

        if self.expand_gt_hierarchy or self.expand_pred_hierarchy:
            (
                self._hierarchy_keyed_parent,
                self._hierarchy_keyed_child,
                _,
            ) = _build_plain_hierarchy(self.hierarchy, skip_root=True)

    @property
    def method(self):
        return "open-images"

    @property
    def requires_additional_fields(self):
        return True


class OpenImagesEvaluation(DetectionEvaluation):
    """Open Images-style evaluation.

    Args:
        config: a :class:`OpenImagesEvaluationConfig`
    """

    def __init__(self, config):
        super().__init__(config)

        if config.iou is None:
            raise ValueError(
                "You must specify an `iou` threshold in order to run "
                "Open Images evaluation"
            )

        if config.classwise is None:
            raise ValueError(
                "You must specify a `classwise` value in order to run "
                "Open Images evaluation"
            )

    def evaluate(self, sample_or_frame, eval_key=None):
        """Performs Open Images-style evaluation on the given image.

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
            sample_or_frame: a :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.frame.Frame`
            eval_key (None): the evaluation key for this evaluation

        Returns:
            a list of matched
            ``(gt_label, pred_label, iou, pred_confidence, gt_id, pred_id)``
            tuples
        """
        gts = sample_or_frame[self.gt_field]
        preds = sample_or_frame[self.pred_field]

        pos_labs = None
        if self.config.pos_label_field:
            pos_labs = sample_or_frame[self.config.pos_label_field]
            if pos_labs is None:
                pos_labs = []
            else:
                pos_labs = [c.label for c in pos_labs.classifications]
                if self.config.expand_gt_hierarchy:
                    pos_labs = _expand_label_hierarchy(pos_labs, self.config)

        neg_labs = None
        if self.config.neg_label_field:
            neg_labs = sample_or_frame[self.config.neg_label_field]
            if neg_labs is None:
                neg_labs = []
            else:
                neg_labs = [c.label for c in neg_labs.classifications]
                if self.config.expand_gt_hierarchy:
                    neg_labs = _expand_label_hierarchy(
                        neg_labs, self.config, expand_child=False
                    )

        if eval_key is None:
            # Don't save results on user's data
            eval_key = "eval"
            gts = _copy_labels(gts)
            preds = _copy_labels(preds)

        return _open_images_evaluation_single_iou(
            gts,
            preds,
            eval_key,
            self.config,
            pos_labs,
            neg_labs,
        )

    def generate_results(
        self,
        samples,
        matches,
        eval_key=None,
        classes=None,
        missing=None,
        progress=None,
    ):
        """Generates aggregate evaluation results for the samples.

        This method generates precision and recall curves for the configured
        IoU at ``self.config.iou``.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            matches: a list of
                ``(gt_label, pred_label, iou, pred_confidence, gt_id, pred_id)``
                matches. Either label can be ``None`` to indicate an unmatched
                object
            eval_key (None): the evaluation key for this evaluation
            classes (None): the list of possible classes. If not provided, the
                observed ground truth/predicted labels are used for results
                purposes
            missing (None): a missing label string. Any unmatched objects are
                given this label for results purposes
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`OpenImagesDetectionResults`
        """
        precision, recall, thresholds, classes = _compute_pr_curves(
            matches, classes=classes
        )

        return OpenImagesDetectionResults(
            samples,
            self.config,
            eval_key,
            matches,
            precision,
            recall,
            classes,
            thresholds=thresholds,
            missing=missing,
            backend=self,
        )


class OpenImagesDetectionResults(DetectionResults):
    """Class that stores the results of an Open Images detection evaluation.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`OpenImagesEvaluationConfig` used
        eval_key: the evaluation key
        matches: a list of
            ``(gt_label, pred_label, iou, pred_confidence, gt_id, pred_id)``
            matches. Either label can be ``None`` to indicate an unmatched
            object
        precision: a dict of per-class precision values
        recall: a dict of per-class recall values
        classes: the list of possible classes
        thresholds (None): an optional dict of per-class decision thresholds
        missing (None): a missing label string. Any unmatched objects are
            given this label for evaluation purposes
        custom_metrics (None): an optional dict of custom metrics
        backend (None): a :class:`OpenImagesEvaluation` backend
    """

    def __init__(
        self,
        samples,
        config,
        eval_key,
        matches,
        precision,
        recall,
        classes,
        thresholds=None,
        missing=None,
        custom_metrics=None,
        backend=None,
    ):
        super().__init__(
            samples,
            config,
            eval_key,
            matches,
            classes=classes,
            missing=missing,
            custom_metrics=custom_metrics,
            backend=backend,
        )

        self.precision = precision
        self.recall = recall
        self.thresholds = thresholds

        self._classwise_AP = {}
        for c in classes:
            if c in precision and c in recall:
                ap = _compute_AP(precision[c], recall[c])
            else:
                ap = -1

            self._classwise_AP[c] = ap

    def plot_pr_curves(
        self, classes=None, num_points=101, backend="plotly", **kwargs
    ):
        """Plots precision-recall (PR) curves for the detection results.

        Args:
            classes (None): a list of classes to generate curves for. By
                default, the top 3 AP classes will be plotted
            num_points (101): the number of linearly spaced recall values to
                plot
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
        if classes is not None:
            self._validate_classes(classes)
        else:
            classwise_AP = [(ap, c) for c, ap in self._classwise_AP.items()]
            classes = [c for ap, c in sorted(classwise_AP)[-3:]]

        precisions = []
        recall = None

        has_thresholds = self.thresholds is not None
        thresholds = [] if has_thresholds else None

        for c in classes:
            p = self.precision.get(c, None)
            r = self.recall.get(c, None)
            if has_thresholds:
                t = self.thresholds.get(c, None)
            else:
                t = None

            pre, rec, thr = _interpolate_pr(
                p, r, thresholds=t, num_points=num_points
            )

            precisions.append(pre)

            if recall is None:
                recall = rec

            if has_thresholds:
                thresholds.append(thr)

        return fop.plot_pr_curves(
            precisions,
            recall,
            classes,
            thresholds=thresholds,
            backend=backend,
            **kwargs,
        )

    def mAP(self, classes=None):
        """Computes Open Images-style mean average precision (mAP) for the
        specified classes.

        See `this page <https://storage.googleapis.com/openimages/web/evaluation.html>`_
        for more details about Open Images-style mAP.

        Args:
            classes (None): a list of classes for which to compute mAP

        Returns:
            the mAP in ``[0, 1]``
        """
        if classes is not None:
            self._validate_classes(classes)
            classwise_AP = [self._classwise_AP[c] for c in classes]
        else:
            classwise_AP = list(self._classwise_AP.values())

        classwise_AP = np.array(classwise_AP)
        classwise_AP = classwise_AP[classwise_AP > -1]
        if classwise_AP.size == 0:
            return -1

        return np.mean(classwise_AP)

    def _validate_classes(self, classes):
        missing_classes = set(classes) - set(self.classes)
        if missing_classes:
            raise ValueError("Classes %s not found" % missing_classes)

    @classmethod
    def _from_dict(cls, d, samples, config, eval_key, **kwargs):
        precision = d["precision"]
        recall = d["recall"]
        thresholds = d.get("thresholds", None)
        return super()._from_dict(
            d,
            samples,
            config,
            eval_key,
            precision=precision,
            recall=recall,
            thresholds=thresholds,
            **kwargs,
        )


_NO_MATCH_ID = ""
_NO_MATCH_IOU = None


def _expand_label_hierarchy(labels, config, expand_child=True):
    keyed_nodes = config._hierarchy_keyed_parent
    if expand_child:
        keyed_nodes = config._hierarchy_keyed_child

    additional_labs = []
    for lab in labels:
        if lab in keyed_nodes:
            additional_labs += list(keyed_nodes[lab])

    return list(set(labels + additional_labs))


def _expand_detection_hierarchy(cats, obj, config, label_type):
    keyed_children = config._hierarchy_keyed_child
    for parent in keyed_children[obj.label]:
        new_obj = obj.copy()
        new_obj.id = obj.id  # we need ID to stay the same
        new_obj.label = parent
        cats[parent][label_type].append(new_obj)


def _open_images_evaluation_single_iou(
    gts, preds, eval_key, config, pos_labs, neg_labs
):
    iou_thresh = min(config.iou, 1 - 1e-10)
    id_key = "%s_id" % eval_key
    iou_key = "%s_iou" % eval_key

    cats, pred_ious, iscrowd = _open_images_evaluation_setup(
        gts,
        preds,
        id_key,
        iou_key,
        config,
        pos_labs,
        neg_labs,
        max_preds=config.max_preds,
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


def _open_images_evaluation_setup(
    gts, preds, id_key, iou_key, config, pos_labs, neg_labs, max_preds=None
):
    if pos_labs is None:
        relevant_labs = neg_labs
    elif neg_labs is None:
        relevant_labs = pos_labs
    else:
        relevant_labs = list(set(pos_labs + neg_labs))

    iscrowd = lambda l: bool(l.get_attribute_value(config.iscrowd, False))
    classwise = config.classwise

    iou_kwargs = dict(iscrowd=iscrowd, error_level=config.error_level)

    if config.use_masks:
        iou_kwargs.update(use_masks=True, tolerance=config.tolerance)

    if config.use_boxes:
        iou_kwargs.update(use_boxes=True)

    # Organize ground truth and predictions by category

    cats = defaultdict(lambda: defaultdict(list))

    if gts is not None:
        for obj in gts[gts._LABEL_LIST_FIELD]:
            if relevant_labs is None or obj.label in relevant_labs:
                obj[iou_key] = _NO_MATCH_IOU
                obj[id_key] = _NO_MATCH_ID

                label = obj.label if classwise else "all"
                cats[label]["gts"].append(obj)

                if config.expand_gt_hierarchy and label != "all":
                    _expand_detection_hierarchy(cats, obj, config, "gts")

    if preds is not None:
        for obj in preds[preds._LABEL_LIST_FIELD]:
            if relevant_labs is None or obj.label in relevant_labs:
                obj[iou_key] = _NO_MATCH_IOU
                obj[id_key] = _NO_MATCH_ID

                label = obj.label if classwise else "all"
                cats[label]["preds"].append(obj)

                if config.expand_pred_hierarchy and label != "all":
                    _expand_detection_hierarchy(cats, obj, config, "preds")

    if isinstance(preds, fol.Keypoints):
        sort_key = lambda p: np.nanmean(p.confidence) if p.confidence else -1
    else:
        sort_key = lambda p: p.confidence or -1

    # Compute IoUs within each category
    pred_ious = {}
    for objects in cats.values():
        gts = objects["gts"]
        preds = objects["preds"]

        # Highest confidence predictions first
        preds = sorted(preds, key=sort_key, reverse=True)

        if max_preds is not None:
            preds = preds[:max_preds]

        objects["preds"] = preds

        # Sort ground truth so crowds are last
        gts = sorted(gts, key=iscrowd)

        # Compute ``num_preds x num_gts`` IoUs
        ious = foui.compute_ious(preds, gts, sparse=True, **iou_kwargs)
        pred_ious.update(ious)

    return cats, pred_ious, iscrowd


def _compute_matches(
    cats, pred_ious, iou_thresh, iscrowd, eval_key, id_key, iou_key
):
    matches = []

    # For efficient rounding
    p_round = 10**10

    # Match preds to GT, highest confidence first
    for cat, objects in cats.items():
        gt_map = {gt.id: gt for gt in objects["gts"]}

        # Match each prediction to the highest available IoU ground truth
        for pred in objects["preds"]:
            if isinstance(pred, fol.Keypoint):
                pred_conf = (
                    np.nanmean(pred.confidence) if pred.confidence else None
                )
            else:
                pred_conf = pred.confidence

            if pred.id in pred_ious:
                best_match = None
                best_match_iou = iou_thresh
                highest_already_matched_iou = iou_thresh
                for gt_id, iou in pred_ious[pred.id]:
                    iou = int(iou * p_round + 0.5) / p_round
                    gt = gt_map[gt_id]
                    gt_iscrowd = iscrowd(gt)

                    # Only iscrowd GTs can have multiple matches
                    if gt[id_key] != _NO_MATCH_ID and not gt_iscrowd:
                        if iou > highest_already_matched_iou:
                            highest_already_matched_iou = iou
                            if iou > best_match_iou:
                                best_match = None
                                best_match_iou = iou_thresh

                        continue

                    # If matching classwise=False
                    # Only objects with the same class can match a crowd
                    if gt_iscrowd and gt.label != pred.label:
                        continue

                    # Crowds are last in order of GTs
                    # If we already matched a non-crowd and are on a crowd,
                    # then break
                    if (
                        best_match
                        and not iscrowd(gt_map[best_match])
                        and gt_iscrowd
                    ):
                        break

                    # If you already perfectly matched a GT
                    # then there is no reason to continue looking
                    # if you match multiple crowds with iou=1, choose the first
                    if best_match_iou == 1:
                        break

                    if iou < best_match_iou:
                        continue

                    best_match_iou = iou
                    best_match = gt_id

                if highest_already_matched_iou > best_match_iou:
                    if best_match is not None and not iscrowd(
                        gt_map[best_match]
                    ):
                        # Note: This differs from COCO in that Open Images
                        # objects are only matched with the highest IoU GT or a
                        # crowd. An object will not be matched with a secondary
                        # highest IoU GT if the highest IoU GT was already
                        # matched with a different object

                        best_match = None

                if best_match:
                    gt = gt_map[best_match]

                    # For crowd GTs, record info for first (highest confidence)
                    # matching prediction on the GT object
                    if gt[id_key] == _NO_MATCH_ID:
                        record_match = True

                        gt[eval_key] = "tp" if gt.label == pred.label else "fn"
                        gt[id_key] = pred.id
                        gt[iou_key] = best_match_iou
                    else:
                        # In Open Images-style evaluation, only the first match
                        # for a crowd GT is recorded in `matches`
                        record_match = False

                    pred[eval_key] = "tp" if gt.label == pred.label else "fp"
                    pred[id_key] = best_match
                    pred[iou_key] = best_match_iou

                    if record_match:
                        matches.append(
                            (
                                gt.label,
                                pred.label,
                                best_match_iou,
                                pred_conf,
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
                            pred_conf,
                            None,
                            pred.id,
                        )
                    )
            elif pred.label == cat:
                pred[eval_key] = "fp"
                matches.append(
                    (None, pred.label, None, pred_conf, None, pred.id)
                )

        # Leftover GTs are false negatives
        for gt in objects["gts"]:
            if gt[id_key] == _NO_MATCH_ID:
                gt[eval_key] = "fn"
                matches.append((gt.label, None, None, None, gt.id, None))

    return matches


def _compute_pr_curves(matches, classes=None):
    if classes is None:
        _classes = set()

    class_matches = {}

    # For crowds, GTs are only counted once
    counted_gts = []

    # Sort matches
    for m in matches:
        # m = (gt_label, pred_label, iou, confidence, gt.id, pred.id)
        if classes is None:
            _classes.add(m[0])
            _classes.add(m[1])

        c = m[0] if m[0] is not None else m[1]

        if c not in class_matches:
            class_matches[c] = {
                "tp": [],
                "fp": [],
                "num_gt": 0,
            }

        if m[0] == m[1]:
            class_matches[c]["tp"].append(m)
        elif m[1]:
            class_matches[c]["fp"].append(m)

        if m[0] and m[4] not in counted_gts:
            class_matches[c]["num_gt"] += 1
            counted_gts.append(m[4])

    if classes is None:
        _classes.discard(None)
        classes = sorted(_classes)

    # Compute precision-recall array
    precision = {}
    recall = {}
    thresholds = {}
    for c in class_matches.keys():
        tp = class_matches[c]["tp"]
        fp = class_matches[c]["fp"]
        num_gt = class_matches[c]["num_gt"]
        if num_gt == 0:
            continue

        tp_fp = np.array([1] * len(tp) + [0] * len(fp))
        confs = np.array([p[3] for p in tp] + [p[3] for p in fp])

        inds = np.argsort(-confs)
        tp_fp = tp_fp[inds]
        confs = confs[inds]

        tp_sum = np.cumsum(tp_fp).astype(dtype=float)
        total = np.arange(1, len(tp_fp) + 1).astype(dtype=float)

        pre = tp_sum / total
        rec = tp_sum / num_gt

        pre0 = pre[0] if pre.size > 0 else 1
        conf0 = max(1, confs[0]) if confs.size > 0 else 1

        pre = np.concatenate([[pre0], pre, [0]])
        confs = np.concatenate([[conf0], confs, [0]])
        rec = np.concatenate([[0], rec, [1]])

        # Ensure precision is nondecreasing
        for i in range(len(pre) - 1, 0, -1):
            if pre[i] > pre[i - 1]:
                pre[i - 1] = pre[i]

        precision[c] = pre
        recall[c] = rec
        thresholds[c] = confs

    return precision, recall, thresholds, classes


def _compute_AP(precision, recall):
    recall = np.asarray(recall)
    precision = np.asarray(precision)
    inds = np.where(recall[1:] != recall[:-1])[0] + 1
    return np.sum((recall[inds] - recall[inds - 1]) * precision[inds])


def _interpolate_pr(precision, recall, thresholds=None, num_points=101):
    has_thresholds = thresholds is not None

    pre = np.zeros(num_points)
    thr = np.zeros(num_points) if has_thresholds else None
    rec = np.linspace(0, 1, num_points)

    if precision is None or recall is None:
        return pre, rec, thr

    # Ensure precision is nondecreasing
    precision = precision.copy()
    for i in range(len(precision) - 1, 0, -1):
        if precision[i] > precision[i - 1]:
            precision[i - 1] = precision[i]

    inds = np.searchsorted(recall, rec, side="left")

    try:
        for ri, pi in enumerate(inds):
            pre[ri] = precision[pi]
            if has_thresholds:
                thr[ri] = thresholds[pi]
    except:
        pass

    return pre, rec, thr


def _copy_labels(labels):
    if labels is None:
        return None

    field = labels._LABEL_LIST_FIELD
    _labels = labels.copy()

    # We need the IDs to stay the same
    for _label, label in zip(_labels[field], labels[field]):
        _label.id = label.id

    return _labels


# Parse hierarchy, code from:
# https://github.com/tensorflow/models/blob/ec48284d0db7a67ab48a9bc13dc29c643ce0f197/research/object_detection/dataset_tools/oid_hierarchical_labels_expansion.py#L77
def _update_dict(initial_dict, update):
    """Updates dictionary with update content

    Args:
        initial_dict: initial dictionary
        update: updated dictionary
    """
    for key, value_list in update.items():
        if key in initial_dict:
            initial_dict[key].update(value_list)
        else:
            initial_dict[key] = set(value_list)


def _build_plain_hierarchy(hierarchy, skip_root=False):
    """Expands tree hierarchy representation to parent-child dictionary.

    Args:
        hierarchy: labels hierarchy
        skip_root (False): if true skips root from the processing (done for the case when all
            classes under hierarchy are collected under virtual node)

    Returns:
        a tuple of:

        -   ``keyed_parent``: dictionary of parent - all its children nodes
        -   ``keyed_child``: dictionary of children - all its parent node
        -   ``children``: all children of the current node
    """
    all_children = set([])
    all_keyed_parent = {}
    all_keyed_child = {}

    if "Subcategory" in hierarchy:
        for node in hierarchy["Subcategory"]:
            keyed_parent, keyed_child, children = _build_plain_hierarchy(node)

            # Update is not done through dict.update() since some children have
            # multiple parents in the hierarchy
            _update_dict(all_keyed_parent, keyed_parent)
            _update_dict(all_keyed_child, keyed_child)
            all_children.update(children)

    if not skip_root:
        all_keyed_parent[hierarchy["LabelName"]] = deepcopy(all_children)
        all_children.add(hierarchy["LabelName"])
        for child, _ in all_keyed_child.items():
            all_keyed_child[child].add(hierarchy["LabelName"])

        all_keyed_child[hierarchy["LabelName"]] = set([])

    return all_keyed_parent, all_keyed_child, all_children
