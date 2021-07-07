"""
Evaluation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou

se = fou.lazy_import("shapely.errors")
so = fou.lazy_import("shapely.ops")


def make_iscrowd_fcn(iscrowd_attr):
    """Returns a boolean function that determines whether a
    :class:`fiftyone.core.labels.Label` is a crowd by checking for an attribute
    with the given name.

    Args:
        iscrowd_attr: the name of the crowd attribute

    Returns:
        a boolean function
    """

    def _iscrowd(label):
        try:
            return bool(label[iscrowd_attr])
        except KeyError:
            # @todo remove Attribute usage
            if iscrowd_attr in label.attributes:
                return bool(label.attributes[iscrowd_attr].value)

            return False

    return _iscrowd


def compute_ious(preds, gts, iscrowd=None, use_masks=False, tolerance=None):
    """Computes the pairwise IoUs between the predicted and ground truth
    objects.

    Args:
        preds: a list of predicted :class:`fiftyone.core.labels.Detection` or
            :class:`fiftyone.core.labels.Polyline` instances
        gt_field: a list of ground truth
            :class:`fiftyone.core.labels.Detection` or
            :class:`fiftyone.core.labels.Polyline` instances
        iscrowd (None): an optional boolean function that determines whether a
            ground truth object is a crowd. If provided, the area of the
            predicted object is used as the "union" area for IoU calculations
            involving crowd objects
        use_masks (False): whether to compute IoUs using the instances masks in
            the ``mask`` attribute of the provided objects, which must be
            :class:`fiftyone.core.labels.Detection` instances
        tolerance (None): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels

    Returns:
        a ``num_preds x num_gts`` array of IoUs
    """
    if not preds or not gts:
        return np.zeros((len(preds), len(gts)))

    if isinstance(preds[0], fol.Polyline):
        return _compute_polyline_ious(preds, gts, iscrowd=iscrowd)

    if use_masks:
        return _compute_mask_ious(
            preds, gts, iscrowd=iscrowd, tolerance=tolerance
        )

    return _compute_bbox_ious(preds, gts, iscrowd=iscrowd)


def _compute_bbox_ious(preds, gts, iscrowd=None):
    ious = np.zeros((len(preds), len(gts)))
    for j, gt in enumerate(gts):
        gx, gy, gw, gh = gt.bounding_box
        gt_area = gh * gw
        gt_crowd = iscrowd(gt) if iscrowd is not None else False

        for i, pred in enumerate(preds):
            px, py, pw, ph = pred.bounding_box
            pred_area = ph * pw

            # Width of intersection
            w = min(px + pw, gx + gw) - max(px, gx)
            if w <= 0:
                continue

            # Height of intersection
            h = min(py + ph, gy + gh) - max(py, gy)
            if h <= 0:
                continue

            inter = h * w
            union = pred_area if gt_crowd else pred_area + gt_area - inter
            ious[i, j] = min(inter / union, 1)

    return ious


def _compute_polyline_ious(preds, gts, iscrowd=None, gt_crowds=None):
    num_pred = len(preds)
    pred_polys = _to_shapely(preds)
    pred_areas = [pred_poly.area for pred_poly in pred_polys]

    num_gt = len(gts)
    gt_polys = _to_shapely(gts)
    gt_areas = [gt_poly.area for gt_poly in gt_polys]

    if iscrowd is not None:
        gt_crowds = [iscrowd(gt) for gt in gts]
    elif gt_crowds is None:
        gt_crowds = [False] * num_gt

    ious = np.zeros((num_pred, num_gt))
    for j, (gt_poly, gt_area, gt_crowd) in enumerate(
        zip(gt_polys, gt_areas, gt_crowds)
    ):
        for i, (pred_poly, pred_area) in enumerate(
            zip(pred_polys, pred_areas)
        ):
            try:
                inter = gt_poly.intersection(pred_poly).area
            except se.TopologicalError as e:
                raise ValueError(
                    "Failed to compute intersection of predicted object "
                    "'%s' and ground truth object '%s'. See above for "
                    "details" % (preds[i].id, gts[j].id)
                ) from e

            if gt_crowd:
                union = pred_area
            else:
                union = pred_area + gt_area - inter

            ious[i, j] = min(inter / union, 1)

    return ious


def _compute_mask_ious(preds, gts, iscrowd=None, tolerance=None):
    # @todo when tolerance is None, consider using dense masks rather than polygonal approximations?
    if tolerance is None:
        tolerance = 2

    pred_polys = _to_polylines(preds, tolerance=tolerance)
    gt_polys = _to_polylines(gts, tolerance=tolerance)

    if iscrowd is not None:
        gt_crowds = [iscrowd(gt) for gt in gts]
    else:
        gt_crowds = [False] * len(gts)

    return _compute_polyline_ious(pred_polys, gt_polys, gt_crowds=gt_crowds)


def _to_polylines(detections, tolerance=None):
    polylines = []
    for detection in detections:
        polyline = detection.to_polyline(tolerance=tolerance)
        polyline._id = detection._id  # keep same ID
        polylines.append(polyline)

    return polylines


def _to_shapely(polylines):
    polys = []
    for polyline in polylines:
        poly = polyline.to_shapely()

        # Cleanup invalid (eg overlapping) geometries
        # https://shapely.readthedocs.io/en/stable/manual.html#shapely.ops.unary_union
        poly = so.unary_union(poly)

        polys.append(poly)

    return polys
