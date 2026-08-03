"""
FiftyOne Cityscapes utils unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os
import tempfile
import unittest

import fiftyone.utils.cityscapes as fouc


class CityscapesPersonAttributesTests(unittest.TestCase):
    """Tests that extra CityPersons attributes are loaded onto the person
    detections, controlled by the ``extra_attrs`` argument (#2196).
    """

    def setUp(self):
        self._tmp_dir = tempfile.TemporaryDirectory()
        objects = [
            {
                "label": "pedestrian",
                "bbox": [10, 20, 30, 40],
                "bboxVis": [12, 22, 20, 30],
                "instanceId": 26000,
            }
        ]
        self._json_path = os.path.join(self._tmp_dir.name, "bbox.json")
        with open(self._json_path, "w") as f:
            json.dump(
                {"imgWidth": 100, "imgHeight": 200, "objects": objects}, f
            )

    def tearDown(self):
        self._tmp_dir.cleanup()

    def _parse(self, **kwargs):
        return fouc._parse_bbox_file(self._json_path, **kwargs).detections[0]

    def test_core_fields_are_always_parsed(self):
        detection = self._parse(extra_attrs=False)
        self.assertEqual(detection.label, "pedestrian")
        self.assertEqual(detection.bounding_box, [0.1, 0.1, 0.3, 0.2])

    def test_true_loads_all_extra_attributes(self):
        detection = self._parse(extra_attrs=True)
        self.assertEqual(detection["bboxVis"], [12, 22, 20, 30])
        self.assertEqual(detection["instanceId"], 26000)

    def test_false_loads_no_extra_attributes(self):
        detection = self._parse(extra_attrs=False)
        self.assertFalse(detection.has_field("bboxVis"))
        self.assertFalse(detection.has_field("instanceId"))

    def test_single_name_loads_one_attribute(self):
        detection = self._parse(extra_attrs="bboxVis")
        self.assertEqual(detection["bboxVis"], [12, 22, 20, 30])
        self.assertFalse(detection.has_field("instanceId"))

    def test_list_loads_specified_attributes(self):
        detection = self._parse(extra_attrs=["instanceId"])
        self.assertEqual(detection["instanceId"], 26000)
        self.assertFalse(detection.has_field("bboxVis"))

    def test_unknown_requested_attribute_is_skipped(self):
        detection = self._parse(extra_attrs=["does_not_exist"])
        self.assertFalse(detection.has_field("does_not_exist"))

    def test_empty_objects_returns_empty_detections(self):
        path = os.path.join(self._tmp_dir.name, "empty.json")
        with open(path, "w") as f:
            json.dump({"imgWidth": 100, "imgHeight": 200, "objects": []}, f)

        detections = fouc._parse_bbox_file(path).detections
        self.assertEqual(len(detections), 0)

    def test_multiple_objects_are_all_parsed(self):
        path = os.path.join(self._tmp_dir.name, "multi.json")
        objects = [
            {
                "label": "pedestrian",
                "bbox": [10, 20, 30, 40],
                "bboxVis": [12, 22, 20, 30],
                "instanceId": 26000,
            },
            {
                "label": "rider",
                "bbox": [50, 60, 10, 20],
                "bboxVis": [51, 61, 8, 18],
                "instanceId": 27000,
            },
        ]
        with open(path, "w") as f:
            json.dump(
                {"imgWidth": 100, "imgHeight": 200, "objects": objects}, f
            )

        detections = fouc._parse_bbox_file(path).detections
        self.assertEqual(len(detections), 2)
        self.assertEqual(detections[0].label, "pedestrian")
        self.assertEqual(detections[1].label, "rider")
        self.assertEqual(detections[1]["instanceId"], 27000)


if __name__ == "__main__":
    unittest.main()
