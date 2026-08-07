"""
FiftyOne CVAT utilities unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import numpy as np

import fiftyone as fo
from fiftyone.utils.cvat import (
    CVATShape,
    _abs_points_to_rotated_box,
    _rotated_box_to_abs_points,
)


def _assert_corners_equal(test, corners1, corners2, tol=1e-3):
    test.assertEqual(len(corners1), len(corners2))
    remaining = [np.asarray(c) for c in corners2]
    for corner in corners1:
        dists = [np.linalg.norm(np.asarray(corner) - c) for c in remaining]
        idx = int(np.argmin(dists))
        test.assertLess(dists[idx], tol)
        remaining.pop(idx)


def _make_cvat_shape(points, rotation=None, frame_size=(400, 300)):
    label_dict = {
        "label_id": 1,
        "id": 100,
        "attributes": [],
        "points": points,
    }
    if rotation is not None:
        label_dict["rotation"] = rotation

    width, height = frame_size
    return CVATShape(
        label_dict,
        {1: "vehicle"},
        {1: {}},
        {},
        {"width": width, "height": height},
    )


class RotatedBoxHelperTests(unittest.TestCase):
    def test_axis_aligned_box(self):
        corners = [(10, 20), (110, 20), (110, 70), (10, 70)]
        box_params = _abs_points_to_rotated_box(corners)

        self.assertIsNotNone(box_params)
        xtl, ytl, xbr, ybr, rotation = box_params
        self.assertAlmostEqual(xtl, 10)
        self.assertAlmostEqual(ytl, 20)
        self.assertAlmostEqual(xbr, 110)
        self.assertAlmostEqual(ybr, 70)
        self.assertAlmostEqual(rotation, 0)

    def test_round_trip(self):
        for rotation in (0, 15, 45, 90, 135, 222.5, 359):
            with self.subTest(rotation=rotation):
                corners = _rotated_box_to_abs_points(
                    100, 200, 300, 260, rotation
                )
                box_params = _abs_points_to_rotated_box(corners)

                self.assertIsNotNone(box_params)
                xtl, ytl, xbr, ybr, _rotation = box_params
                self.assertAlmostEqual(xtl, 100)
                self.assertAlmostEqual(ytl, 200)
                self.assertAlmostEqual(xbr, 300)
                self.assertAlmostEqual(ybr, 260)
                self.assertAlmostEqual(_rotation, rotation % 360)

    def test_corner_order_invariance(self):
        corners = _rotated_box_to_abs_points(100, 200, 300, 260, 30)

        for shift in range(4):
            for _corners in (
                corners[shift:] + corners[:shift],
                list(reversed(corners[shift:] + corners[:shift])),
            ):
                with self.subTest(corners=_corners):
                    box_params = _abs_points_to_rotated_box(_corners)
                    self.assertIsNotNone(box_params)
                    _assert_corners_equal(
                        self,
                        _rotated_box_to_abs_points(*box_params),
                        corners,
                    )

    def test_non_rectangles_rejected(self):
        # Trapezoid
        self.assertIsNone(
            _abs_points_to_rotated_box([(0, 0), (100, 0), (90, 50), (0, 50)])
        )

        # Wrong number of points
        self.assertIsNone(
            _abs_points_to_rotated_box([(0, 0), (100, 0), (50, 50)])
        )
        self.assertIsNone(
            _abs_points_to_rotated_box(
                [(0, 0), (100, 0), (100, 50), (50, 60), (0, 50)]
            )
        )

        # Degenerate
        self.assertIsNone(
            _abs_points_to_rotated_box([(5, 5), (5, 5), (5, 5), (5, 5)])
        )


class CVATShapeRotatedBoxTests(unittest.TestCase):
    def test_rectangle_to_rotated_box_polyline(self):
        shape = _make_cvat_shape([100, 100, 200, 150], rotation=30)
        polyline = shape.to_rotated_box_polyline(filled=True)

        self.assertTrue(polyline.closed)
        self.assertTrue(polyline.filled)
        self.assertEqual(polyline.label, "vehicle")
        self.assertEqual(len(polyline.points), 1)
        self.assertEqual(len(polyline.points[0]), 4)

        # The rotation must be consumed as geometry, not stored as a label
        # attribute
        self.assertIsNone(polyline.get_attribute_value("rotation", None))

        abs_points = [(x * 400, y * 300) for x, y in polyline.points[0]]
        expected = _rotated_box_to_abs_points(100, 100, 200, 150, 30)
        _assert_corners_equal(self, abs_points, expected)

    def test_unrotated_rectangle_to_polyline(self):
        shape = _make_cvat_shape([100, 100, 200, 150])
        polyline = shape.to_rotated_box_polyline()

        self.assertTrue(polyline.closed)
        self.assertFalse(polyline.filled)

        abs_points = [(x * 400, y * 300) for x, y in polyline.points[0]]
        expected = [(100, 100), (200, 100), (200, 150), (100, 150)]
        _assert_corners_equal(self, abs_points, expected)

    def test_upload_download_round_trip(self):
        frame_size = (400, 300)
        width, height = frame_size

        orig_abs_points = _rotated_box_to_abs_points(120, 80, 280, 160, 42)
        rel_points = [(x / width, y / height) for x, y in orig_abs_points]

        # Upload-side conversion
        float_abs_points = [(x * width, y * height) for x, y in rel_points]
        box_params = _abs_points_to_rotated_box(float_abs_points)
        self.assertIsNotNone(box_params)

        xtl, ytl, xbr, ybr, rotation = box_params

        # Download-side conversion
        shape = _make_cvat_shape(
            [xtl, ytl, xbr, ybr], rotation=rotation, frame_size=frame_size
        )
        polyline = shape.to_rotated_box_polyline()

        abs_points = [(x * width, y * height) for x, y in polyline.points[0]]
        _assert_corners_equal(self, abs_points, orig_abs_points)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
