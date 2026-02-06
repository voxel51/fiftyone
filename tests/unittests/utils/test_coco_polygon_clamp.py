import numpy as np

from fiftyone.utils.coco import _mask_to_polygons


def _iter_segmentation_xy(segmentation):
    # segmentation: list of polygons, each polygon is [x1,y1,x2,y2,...]
    for poly in segmentation:
        for i in range(0, len(poly), 2):
            yield poly[i], poly[i + 1]


def _assert_polygons_within_bounds(segmentation, bounds, eps=1e-6):
    xmin, ymin, xmax, ymax = bounds
    for x, y in _iter_segmentation_xy(segmentation):
        assert xmin - eps <= x <= xmax + eps, f"x={x} out of [{xmin}, {xmax}]"
        assert ymin - eps <= y <= ymax + eps, f"y={y} out of [{ymin}, {ymax}]"


def test_mask_to_polygons_clamps_vertices_to_bbox_bounds_regression_2847():
    """
    Regression test for #2847.

    skimage.measure.find_contours(mask, 0.5) yields sub-pixel vertices.
    A full-True mask can produce vertices at -0.5 and (N-0.5), which can drift
    outside float COCO bbox bounds unless clamped.
    """
    mask = np.ones((2, 2), dtype=bool)

    # Intentionally tight bounds that would be violated without clamping
    bbox_bounds = (0.0, 0.0, 1.0, 1.0)

    segmentation = _mask_to_polygons(
        mask, tolerance=None, bbox_bounds=bbox_bounds
    )

    assert len(segmentation) > 0

    # Should be valid after fix; would fail before fix
    _assert_polygons_within_bounds(segmentation, bbox_bounds)


def test_mask_to_polygons_respects_rounded_bbox_bounds_num_decimals_edgecase():
    """
    Mirrors CodeRabbit's concern: if bbox is rounded (num_decimals),
    clamping must use the rounded bbox bounds.

    This test ensures passing a smaller 'rounded' bbox_bounds still clamps
    all vertices inside it.
    """
    mask = np.ones((3, 3), dtype=bool)

    # Pretend the "real" bbox xmax/ymax would have been 2.7,
    # but the exported bbox was rounded down to 2.0
    rounded_bbox_bounds = (0.0, 0.0, 2.0, 2.0)

    segmentation = _mask_to_polygons(
        mask, tolerance=None, bbox_bounds=rounded_bbox_bounds
    )

    assert len(segmentation) > 0

    _assert_polygons_within_bounds(segmentation, rounded_bbox_bounds)
