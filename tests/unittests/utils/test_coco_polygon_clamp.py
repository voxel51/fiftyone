import unittest.mock as mock

import numpy as np
import fiftyone.core.labels as fol


def _all_xy_within(segmentation, xmin, ymin, xmax, ymax, eps=1e-6):
    for poly in segmentation:
        xs = poly[0::2]
        ys = poly[1::2]
        if any(x < xmin - eps or x > xmax + eps for x in xs):
            return False
        if any(y < ymin - eps or y > ymax + eps for y in ys):
            return False
    return True


def test_mask_to_polygons_clamps_to_bbox_bounds():
    from fiftyone.utils.coco import _mask_to_polygons

    mask = np.ones((2, 2), dtype=bool)
    bounds = (0.0, 0.0, 1.0, 1.0)

    seg = _mask_to_polygons(mask, tolerance=None, bbox_bounds=bounds)

    assert len(seg) > 0
    assert _all_xy_within(seg, *bounds)


def test_mask_to_polygons_respects_rounded_bbox_bounds_edgecase():
    from fiftyone.utils.coco import _mask_to_polygons

    mask = np.ones((3, 3), dtype=bool)

    full_bounds = (0.0, 0.0, 2.7, 2.7)
    rounded_bounds = (0.0, 0.0, 2.0, 2.0)

    seg_full = _mask_to_polygons(mask, tolerance=None, bbox_bounds=full_bounds)
    assert not _all_xy_within(seg_full, *rounded_bounds)

    seg_rounded = _mask_to_polygons(
        mask, tolerance=None, bbox_bounds=rounded_bounds
    )
    assert len(seg_rounded) > 0
    assert _all_xy_within(seg_rounded, *rounded_bounds)


def test_instance_to_coco_segmentation_auto_bbox_bounds_clamps_vertices():
    from fiftyone.utils.coco import _instance_to_coco_segmentation

    det = fol.Detection(label="obj", bounding_box=[0.25, 0.25, 0.5, 0.5])
    frame_size = (10, 10)

    full_mask = np.ones((10, 10), dtype=bool)

    with mock.patch(
        "fiftyone.utils.coco.etai.render_instance_image",
        return_value=full_mask,
    ):
        seg = _instance_to_coco_segmentation(det, frame_size, bbox_bounds=None)

    xmin, ymin, xmax, ymax = (2.5, 2.5, 7.5, 7.5)

    assert len(seg) > 0
    for poly in seg:
        xs = poly[0::2]
        ys = poly[1::2]
        assert all(xmin <= x <= xmax for x in xs)
        assert all(ymin <= y <= ymax for y in ys)


def test_polyline_to_coco_segmentation_preserves_float_and_clamps_to_image():
    from fiftyone.utils.coco import _polyline_to_coco_segmentation

    class DummyPolyline:
        def __init__(self, points):
            self.points = points

        def get_attribute_value(self, key, default=None):
            return None

    width, height = 1000, 1000
    polyline = DummyPolyline(
        points=[[(0.75365, 0.5), (1.0001, 0.6), (-0.1, 0.2)]]
    )

    seg = _polyline_to_coco_segmentation(polyline, (width, height))

    assert len(seg) == 1
    poly = seg[0]

    xs = poly[0::2]
    ys = poly[1::2]
    assert all(0.0 <= x <= float(width) for x in xs)
    assert all(0.0 <= y <= float(height) for y in ys)
    assert any(isinstance(v, float) for v in poly)
