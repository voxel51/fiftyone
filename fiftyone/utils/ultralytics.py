"""
Utilities for working with
`Ultralytics <https://github.com/ultralytics/ultralytics>`_.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.utils.torch as fout


def to_detections(results, confidence_thresh=None):
    """Converts ``ultralytics.YOLO`` boxes to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes

    Returns:
        a single or list of :class:`fiftyone.core.labels.Detections`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_detections(r, confidence_thresh=confidence_thresh) for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_detections(result, confidence_thresh=None):
    if result.boxes is None:
        return None

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    boxes = result.boxes.xywhn.detach().cpu().numpy().astype(float)
    confs = result.boxes.conf.detach().cpu().numpy().astype(float)

    detections = []
    for cls, box, conf in zip(classes, boxes, confs):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        label = result.names[cls]
        xc, yc, w, h = box

        detection = fol.Detection(
            label=label,
            bounding_box=[xc - 0.5 * w, yc - 0.5 * h, w, h],
            confidence=conf,
        )
        detections.append(detection)

    return fol.Detections(detections=detections)


def to_instances(results, confidence_thresh=None):
    """Converts ``ultralytics.YOLO`` instance segmentations to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes

    Returns:
        a single or list of :class:`fiftyone.core.labels.Detections`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_instances(r, confidence_thresh=confidence_thresh) for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_instances(result, confidence_thresh=None):
    if result.masks is None:
        return None

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    boxes = result.boxes.xywhn.detach().cpu().numpy().astype(float)
    bounds = np.rint(result.boxes.xyxy.detach().cpu().numpy()).astype(int)
    masks = result.masks.data.detach().cpu().numpy() > 0.5
    confs = result.boxes.conf.detach().cpu().numpy().astype(float)

    detections = []
    for cls, box, bound, mask, conf in zip(
        classes, boxes, bounds, masks, confs
    ):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        label = result.names[cls]
        xc, yc, w, h = box
        x1, y1, x2, y2 = bound

        detection = fol.Detection(
            label=label,
            bounding_box=[xc - 0.5 * w, yc - 0.5 * h, w, h],
            mask=mask[y1:y2, x1:x2],
            confidence=conf,
        )
        detections.append(detection)

    return fol.Detections(detections=detections)


def to_polylines(results, confidence_thresh=None, tolerance=2, filled=True):
    """Converts ``ultralytics.YOLO`` instance segmentations to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes
        tolerance (2): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
        filled (True): whether the polyline should be filled

    Returns:
        a single or list of :class:`fiftyone.core.labels.Polylines`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_polylines(
            r, tolerance, filled, confidence_thresh=confidence_thresh
        )
        for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_polylines(result, tolerance, filled, confidence_thresh=None):
    if result.masks is None:
        return None

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    confs = result.boxes.conf.detach().cpu().numpy().astype(float)

    if tolerance > 1:
        masks = result.masks.data.detach().cpu().numpy() > 0.5
        points = itertools.repeat(None)
    else:
        masks = itertools.repeat(None)
        points = result.masks.xyn

    polylines = []
    for cls, mask, _points, conf in zip(classes, masks, points, confs):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        if _points is None:
            _points = fol._get_polygons(mask, tolerance)
        else:
            _points = [_points.astype(float)]

        label = result.names[cls]

        polyline = fol.Polyline(
            label=label,
            points=_points,
            confidence=conf,
            closed=True,
            filled=filled,
        )
        polylines.append(polyline)

    return fol.Polylines(polylines=polylines)


def to_keypoints(results, confidence_thresh=None):
    """Converts ``ultralytics.YOLO`` keypoints to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter keypoints

    Returns:
        a single or list of :class:`fiftyone.core.labels.Keypoints`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_keypoints(r, confidence_thresh=confidence_thresh) for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_keypoints(result, confidence_thresh=None):
    if result.keypoints is None:
        return None

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    points = result.keypoints.xyn.detach().cpu().numpy().astype(float)
    if result.keypoints.conf is not None:
        confs = result.keypoints.conf.detach().cpu().numpy().astype(float)
    else:
        confs = itertools.repeat(None)

    keypoints = []
    for cls, _points, _confs in zip(classes, points, confs):
        if confidence_thresh is not None:
            _points[_confs < confidence_thresh] = np.nan

        label = result.names[cls]
        _confidence = _confs.tolist() if _confs is not None else None

        keypoint = fol.Keypoint(
            label=label,
            points=_points.tolist(),
            confidence=_confidence,
        )
        keypoints.append(keypoint)

    return fol.Keypoints(keypoints=keypoints)


class UltralyticsOutputProcessor(fout.OutputProcessor):
    """Converts Ultralytics PyTorch Hub model outputs to FiftyOne format."""

    def __call__(self, result, frame_size, confidence_thresh=None):
        batch = []
        for df in result.pandas().xywhn:
            if confidence_thresh is not None:
                df = df[df["confidence"] >= confidence_thresh]

            batch.append(self._to_detections(df))

        return batch

    def _to_detections(self, df):
        return fol.Detections(
            detections=[
                fol.Detection(
                    label=row.name,
                    bounding_box=[
                        row.xcenter - 0.5 * row.width,
                        row.ycenter - 0.5 * row.height,
                        row.width,
                        row.height,
                    ],
                    confidence=row.confidence,
                )
                for row in df.itertuples()
            ]
        )
