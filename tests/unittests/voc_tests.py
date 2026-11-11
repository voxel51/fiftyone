"""
FiftyOne VOC utilities unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone.utils.voc as fouv


def _corners(box):
    return box.xmin, box.ymin, box.xmax, box.ymax


class VOCBoundingBoxTests(unittest.TestCase):
    def test_from_detection_format_rounds_float_error(self):
        # 29 / 100 * 100 == 28.999999999999996, which int() truncates to 28
        frame_size = (100, 100)
        bounding_box = [29 / 100, 57 / 100, 29 / 100, 14 / 100]

        box = fouv.VOCBoundingBox.from_detection_format(
            bounding_box, frame_size
        )

        self.assertEqual(_corners(box), (29, 57, 58, 71))

    def test_from_detection_format_crowd_box(self):
        frame_size = (100, 100)
        bounding_box = [60 / 100, 10 / 100, 30 / 100, 30 / 100]

        box = fouv.VOCBoundingBox.from_detection_format(
            bounding_box, frame_size
        )

        self.assertEqual(_corners(box), (60, 10, 90, 40))

    def test_integer_boxes_round_trip(self):
        frame_size = (640, 480)
        for corners in [(29, 57, 58, 71), (0, 0, 640, 480), (1, 3, 333, 479)]:
            box = fouv.VOCBoundingBox(*corners)
            bounding_box = box.to_detection_format(frame_size)

            box2 = fouv.VOCBoundingBox.from_detection_format(
                bounding_box, frame_size
            )

            self.assertEqual(_corners(box2), corners)

    def test_from_bndbox_dict_rounds_fractional_coordinates(self):
        d = {"xmin": "28.6", "ymin": "57.0", "xmax": "57.9", "ymax": "70.4"}

        box = fouv.VOCBoundingBox.from_bndbox_dict(d)

        self.assertEqual(_corners(box), (29, 57, 58, 70))
        self.assertTrue(all(isinstance(c, int) for c in _corners(box)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
