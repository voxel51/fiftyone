"""
Intersection over union (IoU) utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import contextlib
import logging

import numpy as np

import eta.core.numutils as etan
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov

sg = fou.lazy_import("shapely.geometry")
so = fou.lazy_import("shapely.ops")


def compute_ious(
    preds,
    gts,
    iscrowd=None,
    classwise=False,
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
        gts: a list of ground truth :class:`fiftyone.core.labels.Detection` or
            :class:`fiftyone.core.labels.Polyline` instances
        iscrowd (None): an optional name of a boolean attribute or boolean
            function to apply to each label that determines whether a ground
            truth object is a crowd. If provided, the area of the predicted
            object is used as the "union" area for IoU calculations involving
            crowd objects
        classwise (False): whether to consider objects with different ``label``
            values as always non-overlapping (True) or to compute IoUs for all
            objects regardless of label (False)
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

    if etau.is_str(iscrowd):
        iscrowd = lambda l: bool(l.get_attribute_value(iscrowd, False))

    if isinstance(preds[0], fol.Polyline):
        if use_boxes:
            return _compute_bbox_ious(
                preds, gts, iscrowd=iscrowd, classwise=classwise
            )

        return _compute_polyline_ious(
            preds, gts, error_level, iscrowd=iscrowd, classwise=classwise
        )

    if use_masks:
        # @todo when tolerance is None, consider using dense masks rather than
        # polygonal approximations?
        if tolerance is None:
            tolerance = 2

        return _compute_mask_ious(
            preds,
            gts,
            tolerance,
            error_level,
            iscrowd=iscrowd,
            classwise=classwise,
        )

    return _compute_bbox_ious(preds, gts, iscrowd=iscrowd, classwise=classwise)


def compute_segment_ious(preds, gts):
    """Computes the pairwise IoUs between the predicted and ground truth
    temporal detections.

    Args:
        preds: a list of predicted
            :class:`fiftyone.core.labels.TemporalDetection` instances
        gts: a list of ground truth
            :class:`fiftyone.core.labels.TemporalDetection` instances

    Returns:
        a ``num_preds x num_gts`` array of segment IoUs
    """
    if not preds or not gts:
        return np.zeros((len(preds), len(gts)))

    return _compute_segment_ious(preds, gts)


def compute_max_ious(
    sample_collection,
    label_field,
    other_field=None,
    iou_attr="max_iou",
    id_attr=None,
    **kwargs,
):
    """Populates an attribute on each label in the given spatial field(s) that
    records the max IoU between the object and another object in the same
    sample/frame.

    If ``other_field`` is provided, IoUs are computed between objects in
    ``label_field`` and ``other_field``.

    If no ``other_field`` is provided, IoUs are computed between objects in
    ``label_field`` alone, excluding the object itself.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        label_field: a label field of type
            :class:`fiftyone.core.labels.Detections` or
            :class:`fiftyone.core.labels.Polylines`
        other_field (None): another label field of type
            :class:`fiftyone.core.labels.Detections` or
            :class:`fiftyone.core.labels.Polylines`
        iou_attr ("max_iou"): the label attribute in which to store the max IoU
        id_attr (None): an optional attribute in which to store the label ID of
            the maximum overlapping label
        **kwargs: optional keyword arguments for :func:`compute_ious`
    """
    if other_field is None:
        other_field = label_field

    fov.validate_collection_label_fields(
        sample_collection,
        (label_field, other_field),
        (fol.Detections, fol.Polylines),
        same_type=True,
    )

    _label_field, is_frame_field = sample_collection._handle_frame_field(
        label_field
    )
    _other_field, _ = sample_collection._handle_frame_field(other_field)

    if other_field != label_field:
        view = sample_collection.select_fields([label_field, other_field])
    else:
        view = sample_collection.select_fields(label_field)

    max_ious1 = []
    max_ious2 = []
    label_ids1 = []
    label_ids2 = []

    for sample in view.iter_samples(progress=True):
        if is_frame_field:
            _max_ious1 = []
            _max_ious2 = []
            _label_ids1 = []
            _label_ids2 = []
            for frame in sample.frames.values():
                iou1, iou2, id1, id2 = _compute_max_ious(
                    frame, _label_field, _other_field, **kwargs
                )
                _max_ious1.append(iou1)
                _max_ious2.append(iou2)
                _label_ids1.append(id1)
                _label_ids2.append(id2)

            max_ious1.append(_max_ious1)
            max_ious2.append(_max_ious2)
            label_ids1.append(_label_ids1)
            label_ids2.append(_label_ids2)
        else:
            iou1, iou2, id1, id2 = _compute_max_ious(
                sample, _label_field, _other_field, **kwargs
            )
            max_ious1.append(iou1)
            max_ious2.append(iou2)
            label_ids1.append(id1)
            label_ids2.append(id2)

    _, iou_path1 = sample_collection._get_label_field_path(
        label_field, iou_attr
    )

    sample_collection.set_values(iou_path1, max_ious1)

    if id_attr is not None:
        _, id_path1 = sample_collection._get_label_field_path(
            label_field, id_attr
        )

        sample_collection.set_values(id_path1, label_ids1)

    if other_field != label_field:
        _, iou_path2 = sample_collection._get_label_field_path(
            other_field, iou_attr
        )

        sample_collection.set_values(iou_path2, max_ious2)

        if id_attr is not None:
            _, id_path2 = sample_collection._get_label_field_path(
                other_field, id_attr
            )

            sample_collection.set_values(id_path2, label_ids2)


def find_duplicates(
    sample_collection, label_field, iou_thresh=0.999, method="simple", **kwargs
):
    """Returns IDs of duplicate labels in the given field of the collection, as
    defined as labels with an IoU greater than a chosen threshold with another
    label in the field.

    The following duplicate removal methods are supported:

    -   ``method="simple"``: mark the latter label in every pair of labels
        whose IoU exceeds the threshold. This may remove more labels than the
        greedy method

    -   ``method="greedy"``: apply a greedy method to mark the fewest number of
        labels as duplicate such that no non-duplicate labels have IoU greater
        than the specified threshold. This method is more computationally
        expensive than the simple method

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        label_field: a label field of type
            :class:`fiftyone.core.labels.Detections` or
            :class:`fiftyone.core.labels.Polylines`
        iou_thresh (0.999): the IoU threshold to use to determine whether
            labels are duplicates
        method ("simple"): the duplicate removal method to use. The supported
            values are ``("simple", "greedy")``
        **kwargs: optional keyword arguments for :func:`compute_ious`

    Returns:
        a list of IDs of duplicate labels
    """
    fov.validate_collection_label_fields(
        sample_collection, label_field, (fol.Detections, fol.Polylines)
    )

    _label_field, is_frame_field = sample_collection._handle_frame_field(
        label_field
    )

    view = sample_collection.select_fields(label_field)

    dup_ids = []

    for sample in view.iter_samples(progress=True):
        if is_frame_field:
            for frame in sample.frames.values():
                _dup_ids = _find_duplicates(
                    frame, _label_field, iou_thresh, method, **kwargs
                )
                dup_ids.extend(_dup_ids)
        else:
            _dup_ids = _find_duplicates(
                sample, _label_field, iou_thresh, method, **kwargs
            )
            dup_ids.extend(_dup_ids)

    return dup_ids


def _compute_max_ious(doc, field1, field2, **kwargs):
    if field1 != field2:
        labels1 = _get_labels(doc, field1)
        labels2 = _get_labels(doc, field2)

        ious = compute_ious(labels1, labels2, **kwargs)

        return _extract_max_ious(ious, labels1, labels2)

    labels = _get_labels(doc, field1)

    if labels is None:
        return None, None, None, None

    n = len(labels)

    if n < 2:
        return [None] * n, [None] * n, [None] * n, [None] * n

    ious = compute_ious(labels, labels, **kwargs)
    np.fill_diagonal(ious, -1)  # exclude self

    return _extract_max_ious(ious, labels, labels)


def _get_labels(doc, field):
    labels = doc[field]

    if labels is None:
        return None

    return labels[labels._LABEL_LIST_FIELD]


def _extract_max_ious(ious, labels1, labels2):
    if labels1 is None and labels2 is None:
        return None, None, None, None

    m, n = ious.shape

    if labels2:
        inds1 = ious.argmax(axis=1)
        max1 = list(ious[range(m), inds1])
        ids1 = [labels2[i].id for i in inds1]
    else:
        max1 = [None] * m
        ids1 = [None] * m

    if labels1:
        inds2 = ious.argmax(axis=0)
        max2 = list(ious[inds2, range(n)])
        ids2 = [labels1[i].id for i in inds2]
    else:
        max2 = [None] * n
        ids2 = [None] * n

    return max1, max2, ids1, ids2


def _find_duplicates(doc, field, iou_thresh, method, **kwargs):
    labels = _get_labels(doc, field)

    if labels is None:
        return []

    ious = compute_ious(labels, labels, **kwargs)

    if method == "simple":
        dup_inds = _find_duplicates_simple(ious, iou_thresh)
    elif method == "greedy":
        dup_inds = _find_duplicates_greedy(ious, iou_thresh)
    else:
        raise ValueError("Unsupported method '%s'" % method)

    return [labels[i].id for i in dup_inds]


def _find_duplicates_simple(ious, iou_thresh):
    # Delete the *latter* index in *every* pair of duplicate pairs
    A = np.triu(ious, k=1) > iou_thresh
    _, j = np.nonzero(A)
    return np.unique(j)


def _find_duplicates_greedy(ious, iou_thresh):
    # Choose the largest subset of indices s.t. no two are within `iou_thresh`
    A = np.triu(ious, k=1) > iou_thresh

    dup_inds = []
    while True:
        i, j = np.nonzero(A)
        if j.size == 0:
            break

        # Remove most common value
        k = np.argmax(np.bincount(np.concatenate((i, j))))
        dup_inds.append(k)
        A[k, :] = False
        A[:, k] = False

    return sorted(dup_inds)


def _compute_bbox_ious(preds, gts, iscrowd=None, classwise=False):
    is_symmetric = preds is gts

    if iscrowd is not None:
        gt_crowds = [iscrowd(gt) for gt in gts]
    else:
        gt_crowds = [False] * len(gts)

    if isinstance(preds[0], fol.Polyline):
        preds = _polylines_to_detections(preds)

        if is_symmetric:
            gts = preds
        else:
            gts = _polylines_to_detections(gts)

    ious = np.zeros((len(preds), len(gts)))

    for j, (gt, gt_crowd) in enumerate(zip(gts, gt_crowds)):
        gx, gy, gw, gh = gt.bounding_box
        gt_area = gh * gw

        for i, pred in enumerate(preds):
            if is_symmetric and i < j:
                iou = ious[j, i]
            elif is_symmetric and i == j:
                iou = 1
            elif classwise and pred.label != gt.label:
                continue
            else:
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

                iou = min(etan.safe_divide(inter, union), 1)

            ious[i, j] = iou

    return ious


def _compute_polyline_ious(
    preds, gts, error_level, iscrowd=None, classwise=False, gt_crowds=None
):
    is_symmetric = preds is gts

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
        pred_labels = [pred.label for pred in preds]
        pred_areas = [pred_poly.area for pred_poly in pred_polys]

        if is_symmetric:
            num_gt = num_pred
            gt_polys = pred_polys
            gt_labels = pred_labels
            gt_areas = pred_areas
        else:
            num_gt = len(gts)
            gt_polys = _polylines_to_shapely(gts, error_level)
            gt_labels = [gt.label for gt in gts]
            gt_areas = [gt_poly.area for gt_poly in gt_polys]

        if iscrowd is not None:
            gt_crowds = [iscrowd(gt) for gt in gts]
        elif gt_crowds is None:
            gt_crowds = [False] * num_gt

        ious = np.zeros((num_pred, num_gt))

        for j, (gt_poly, gt_label, gt_area, gt_crowd) in enumerate(
            zip(gt_polys, gt_labels, gt_areas, gt_crowds)
        ):
            for i, (pred_poly, pred_label, pred_area) in enumerate(
                zip(pred_polys, pred_labels, pred_areas)
            ):
                if is_symmetric and i < j:
                    iou = ious[j, i]
                elif is_symmetric and i == j:
                    iou = 1
                elif classwise and pred_label != gt_label:
                    continue
                else:
                    try:
                        inter = gt_poly.intersection(pred_poly).area
                    except Exception as e:
                        inter = 0.0
                        fou.handle_error(
                            ValueError(
                                "Failed to compute intersection of predicted "
                                "object '%s' and ground truth object '%s'"
                                % (preds[i].id, gts[j].id)
                            ),
                            error_level,
                            base_error=e,
                        )

                    if gt_crowd:
                        union = pred_area
                    else:
                        union = pred_area + gt_area - inter

                    iou = min(etan.safe_divide(inter, union), 1)

                ious[i, j] = iou

        return ious


def _compute_mask_ious(
    preds, gts, tolerance, error_level, iscrowd=None, classwise=False
):
    is_symmetric = preds is gts

    with contextlib.ExitStack() as context:
        # We're ignoring errors, so suppress shapely logging that occurs when
        # invalid geometries are encountered
        if error_level > 1:
            # pylint: disable=no-member
            context.enter_context(
                fou.LoggingLevel(logging.CRITICAL, logger="shapely")
            )

        pred_polys = _masks_to_polylines(preds, tolerance, error_level)

        if is_symmetric:
            gt_polys = pred_polys
        else:
            gt_polys = _masks_to_polylines(gts, tolerance, error_level)

    if iscrowd is not None:
        gt_crowds = [iscrowd(gt) for gt in gts]
    else:
        gt_crowds = [False] * len(gts)

    return _compute_polyline_ious(
        pred_polys,
        gt_polys,
        error_level,
        classwise=classwise,
        gt_crowds=gt_crowds,
    )


def _compute_segment_ious(preds, gts):
    is_symmetric = preds is gts

    ious = np.zeros((len(preds), len(gts)))
    for j, gt in enumerate(gts):
        gst, get = gt.support
        gt_len = get - gst

        for i, pred in enumerate(preds):
            if is_symmetric and i < j:
                iou = ious[j, i]
            elif is_symmetric and i == j:
                iou = 1
            else:
                pst, pet = pred.support
                pred_len = pet - pst

                if pred_len == 0 and gt_len == 0:
                    iou = float(pet == get)
                else:
                    # Length of temporal intersection
                    inter = min(get, pet) - max(gst, pst)
                    if inter <= 0:
                        continue

                    union = pred_len + gt_len - inter
                    iou = min(etan.safe_divide(inter, union), 1)

            ious[i, j] = iou

    return ious


def _polylines_to_detections(polylines):
    detections = []
    for polyline in polylines:
        detection = polyline.to_detection()

        detection.id = polyline.id  # keep same ID
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

        polyline.id = detection.id  # keep same ID
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
