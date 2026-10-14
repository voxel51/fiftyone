"""
CVAT utility unit tests (no server required).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import math
import unittest

import fiftyone as fo
import fiftyone.utils.cvat as fouc


class CVATRotationTests(unittest.TestCase):
    def test_track_interpolation_carries_rotation(self):
        # keyframes at frames 0 and 10 rotated 0 and 90 degrees: frame 5 must
        # be 45 degrees, not the left keyframe's 0
        shape0 = {
            "frame": 0,
            "type": "rectangle",
            "points": [0.0, 0.0, 10.0, 10.0],
            "rotation": 0.0,
            "keyframe": True,
            "outside": False,
            "attributes": [],
        }
        shape1 = {**shape0, "frame": 10, "rotation": 90.0}

        shapes = fouc._get_interpolated_shapes([shape0, shape1])
        by_frame = {s["frame"]: s for s in shapes}

        self.assertAlmostEqual(by_frame[5]["rotation"], 45.0)
        self.assertAlmostEqual(by_frame[1]["rotation"], 9.0)

    def test_track_interpolation_shortest_angular_path(self):
        # 350 -> 10 degrees goes through 0, not backwards through 180
        shape0 = {
            "frame": 0,
            "type": "rectangle",
            "points": [0.0, 0.0, 10.0, 10.0],
            "rotation": 350.0,
            "keyframe": True,
            "outside": False,
            "attributes": [],
        }
        shape1 = {**shape0, "frame": 4, "rotation": 10.0}

        shapes = fouc._get_interpolated_shapes([shape0, shape1])
        by_frame = {s["frame"]: s for s in shapes}

        self.assertAlmostEqual(by_frame[1]["rotation"], 355.0)
        self.assertAlmostEqual(by_frame[2]["rotation"], 0.0)
        self.assertAlmostEqual(by_frame[3]["rotation"], 5.0)

    def test_track_interpolation_180_tie_turns_clockwise(self):
        # exactly opposite keyframes: CVAT resolves the tie as +180, so a
        # quarter of the way from 0 is 45 (not 315), and from 180 it is 225
        base = {
            "frame": 0,
            "type": "rectangle",
            "points": [0.0, 0.0, 10.0, 10.0],
            "keyframe": True,
            "outside": False,
            "attributes": [],
        }
        for r0, r1, expected in [(0.0, 180.0, 45.0), (180.0, 0.0, 225.0)]:
            shapes = fouc._get_interpolated_shapes(
                [
                    {**base, "rotation": r0},
                    {**base, "frame": 4, "rotation": r1},
                ]
            )
            by_frame = {s["frame"]: s for s in shapes}
            self.assertAlmostEqual(by_frame[1]["rotation"], expected)

    def test_convert_rotations_to_radians_attributes_dict(self):
        # legacy storage: ``label.attributes["rotation"].value``
        dataset = fo.Dataset()
        det = fo.Detection(label="a", bounding_box=[0.1, 0.1, 0.2, 0.2])
        det.attributes["rotation"] = fo.NumericAttribute(value=45.0)
        dataset.add_sample(
            fo.Sample(
                filepath="/tmp/x.jpg", gt=fo.Detections(detections=[det])
            )
        )

        num = fouc.convert_rotations_to_radians(dataset, "gt")

        self.assertEqual(num, 1)
        value = (
            dataset.first().gt.detections[0].get_attribute_value("rotation")
        )
        self.assertAlmostEqual(value, math.radians(45))

    def test_convert_rotations_to_radians(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="/tmp/x.jpg",
                gt=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="a",
                            bounding_box=[0.1, 0.1, 0.2, 0.2],
                            rotation=90.0,
                        ),
                        fo.Detection(
                            label="b", bounding_box=[0.3, 0.3, 0.2, 0.2]
                        ),
                    ]
                ),
            )
        )

        num = fouc.convert_rotations_to_radians(dataset, "gt")

        self.assertEqual(num, 1)
        rotations = dataset.values("gt.detections.rotation", unwind=True)
        self.assertAlmostEqual(rotations[0], math.radians(90))
        self.assertIsNone(rotations[1])


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
