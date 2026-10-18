"""
FiftyOne utilities unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone.utils.voc as fouv


class VOCBoundingBoxTests(unittest.TestCase):
    def test_from_detection_format_rounds(self):
        # 0.29 * 100 == 28.999999999999996, which must not truncate to 28
        box = fouv.VOCBoundingBox.from_detection_format(
            [0.29, 0.57, 0.29, 0.14], (100, 100)
        )
        self.assertEqual(
            (box.xmin, box.ymin, box.xmax, box.ymax), (29, 57, 58, 71)
        )

    def test_detection_format_round_trip(self):
        frame_size = (100, 100)
        for xyxy in [(29, 57, 58, 71), (60, 10, 90, 40)]:
            x1, y1, x2, y2 = xyxy
            bounding_box = [
                x1 / 100,
                y1 / 100,
                (x2 - x1) / 100,
                (y2 - y1) / 100,
            ]
            box = fouv.VOCBoundingBox.from_detection_format(
                bounding_box, frame_size
            )
            self.assertEqual((box.xmin, box.ymin, box.xmax, box.ymax), xyxy)


if __name__ == "__main__":
    unittest.main()
