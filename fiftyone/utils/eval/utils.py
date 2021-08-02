"""
Evaluation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import contextlib
import logging

import numpy as np

import eta.core.numutils as etan

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou

sg = fou.lazy_import("shapely.geometry")
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
    return lambda label: bool(label.get_attribute_value(iscrowd_attr, False))


def compute_ious(
    preds,
    gts,
    iscrowd=None,
    use_masks=False,
    use_boxes=False,
    tolerance=None,
    error_level=1,
):
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
        use_boxes (False): whether to compute IoUs using the bounding boxes
            of the provided :class:`fiftyone.core.labels.Polyline` instances
            rather than using their actual geometries
        tolerance (None): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
        error_level (1): the error level to use when manipulating instance
            masks or polylines. Valid values are:

            -   0: raise geometric errors that are encountered
            -   1: log warnings if geometric errors are encountered
            -   2: ignore geometric errors

            If ``error_level > 0``, any calculation that raises a geometric
            error will default to an IoU of 0

    Returns:
        a ``num_preds x num_gts`` array of IoUs
    """
    if not preds or not gts:
        return np.zeros((len(preds), len(gts)))

    if isinstance(preds[0], fol.Polyline):
        if use_boxes:
            return _compute_bbox_ious(preds, gts, iscrowd=iscrowd)

        return _compute_polyline_ious(preds, gts, error_level, iscrowd=iscrowd)

    if use_masks:
        # @todo when tolerance is None, consider using dense masks rather than
        # polygonal approximations?
        if tolerance is None:
            tolerance = 2

        return _compute_mask_ious(
            preds, gts, tolerance, error_level, iscrowd=iscrowd,
        )

    return _compute_bbox_ious(preds, gts, iscrowd=iscrowd)


def _compute_bbox_ious(preds, gts, iscrowd=None):
    num_pred = len(preds)
    num_gt = len(gts)

    if iscrowd is not None:
        gt_crowds = [iscrowd(gt) for gt in gts]
    else:
        gt_crowds = [False] * num_gt

    if isinstance(preds[0], fol.Polyline):
        preds = _polylines_to_detections(preds)
        gts = _polylines_to_detections(gts)

    ious = np.zeros((len(preds), len(gts)))
    for j, (gt, gt_crowd) in enumerate(zip(gts, gt_crowds)):
        gx, gy, gw, gh = gt.bounding_box
        gt_area = gh * gw

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

            if gt_crowd:
                union = pred_area
            else:
                union = pred_area + gt_area - inter

            ious[i, j] = min(etan.safe_divide(inter, union), 1)

    return ious


def _compute_polyline_ious(
    preds, gts, error_level, iscrowd=None, gt_crowds=None
):
    with contextlib.ExitStack() as context:
        # We're ignoring errors, so suppress shapely logging that occurs when
        # invalid geometries are encountered
        if error_level > 1:
            # pylint: disable=no-member
            context.enter_context(
                fou.LoggingLevel(logging.CRITICAL, logger="shapely")
            )

        num_pred = len(preds)
        pred_polys = _polylines_to_shapely(preds, error_level)
        pred_areas = [pred_poly.area for pred_poly in pred_polys]

        num_gt = len(gts)
        gt_polys = _polylines_to_shapely(gts, error_level)
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
                except Exception as e:
                    inter = 0.0
                    fou.handle_error(
                        ValueError(
                            "Failed to compute intersection of predicted object "
                            "'%s' and ground truth object '%s'"
                            % (preds[i].id, gts[j].id)
                        ),
                        error_level,
                        base_error=e,
                    )

                if gt_crowd:
                    union = pred_area
                else:
                    union = pred_area + gt_area - inter

                ious[i, j] = min(etan.safe_divide(inter, union), 1)

        return ious


def _compute_mask_ious(preds, gts, tolerance, error_level, iscrowd=None):
    with contextlib.ExitStack() as context:
        # We're ignoring errors, so suppress shapely logging that occurs when
        # invalid geometries are encountered
        if error_level > 1:
            # pylint: disable=no-member
            context.enter_context(
                fou.LoggingLevel(logging.CRITICAL, logger="shapely")
            )

        pred_polys = _masks_to_polylines(preds, tolerance, error_level)
        gt_polys = _masks_to_polylines(gts, tolerance, error_level)

    if iscrowd is not None:
        gt_crowds = [iscrowd(gt) for gt in gts]
    else:
        gt_crowds = [False] * len(gts)

    return _compute_polyline_ious(
        pred_polys, gt_polys, error_level, gt_crowds=gt_crowds
    )


def _polylines_to_detections(polylines):
    detections = []
    for polyline in polylines:
        detection = polyline.to_detection()

        detection._id = polyline._id  # keep same ID
        detections.append(detection)

    return detections


def _masks_to_polylines(detections, tolerance, error_level):
    polylines = []
    for detection in detections:
        try:
            polyline = detection.to_polyline(tolerance=tolerance)
        except Exception as e:
            polyline = fol.Polyline()
            fou.handle_error(
                ValueError(
                    "Failed to convert instance mask for object '%s' to "
                    "polygons" % detection.id
                ),
                error_level,
                base_error=e,
            )

        polyline._id = detection._id  # keep same ID
        polylines.append(polyline)

    return polylines


def _polylines_to_shapely(polylines, error_level):
    polys = []
    for polyline in polylines:
        try:
            poly = polyline.to_shapely()

            # Cleanup invalid (eg overlapping or self-intersecting) geometries
            # https://shapely.readthedocs.io/en/stable/manual.html#shapely.ops.unary_union
            # https://shapely.readthedocs.io/en/stable/manual.html#object.buffer
            poly = so.unary_union(poly).buffer(0)
        except Exception as e:
            poly = sg.Polygon()
            fou.handle_error(
                ValueError(
                    "Failed to convert polygon for object '%s' to Shapely "
                    "format" % polyline.id
                ),
                error_level,
                base_error=e,
            )

        polys.append(poly)

    return polys
