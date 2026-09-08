"""
FiftyOne Cityscapes utilities unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import os
import tempfile
import unittest

import fiftyone.utils.cityscapes as fouc


class CityscapesBboxParsingTests(unittest.TestCase):
    def _write_anno(self, objects):
        d = {"imgHeight": 1024, "imgWidth": 2048, "objects": objects}
        tmp_dir = tempfile.mkdtemp()
        json_path = os.path.join(tmp_dir, "anno_gtBboxCityPersons.json")
        with open(json_path, "w") as f:
            json.dump(d, f)

        return json_path

    def test_parse_bbox_file_with_visibility(self):
        # Matches the `gtBboxCityPersons` annotation format used by the
        # official cityscapesScripts `CsBbox2d` parser
        json_path = self._write_anno(
            [
                {
                    "label": "pedestrian",
                    "bbox": [100, 200, 40, 80],
                    "bboxVis": [110, 210, 20, 60],
                    "instanceId": 24000,
                }
            ]
        )

        detections = fouc._parse_bbox_file(json_path)

        self.assertEqual(len(detections.detections), 1)
        detection = detections.detections[0]

        self.assertEqual(detection.label, "pedestrian")
        self.assertEqual(
            detection.bounding_box,
            [100 / 2048, 200 / 1024, 40 / 2048, 80 / 1024],
        )
        self.assertEqual(detection.cityscapes_instance_id, 24000)
        self.assertEqual(
            detection.visible_bounding_box,
            [110 / 2048, 210 / 1024, 20 / 2048, 60 / 1024],
        )
        self.assertAlmostEqual(
            detection.visibility_ratio, (20 * 60) / (40 * 80)
        )

    def test_parse_bbox_file_without_visibility(self):
        # Older/other annotation files may lack `bboxVis`/`instanceId`;
        # parsing should degrade gracefully rather than erroring
        json_path = self._write_anno(
            [{"label": "rider", "bbox": [0, 0, 10, 10]}]
        )

        detections = fouc._parse_bbox_file(json_path)

        self.assertEqual(len(detections.detections), 1)
        detection = detections.detections[0]

        self.assertEqual(detection.label, "rider")
        self.assertFalse(detection.has_field("cityscapes_instance_id"))
        self.assertFalse(detection.has_field("visible_bounding_box"))
        self.assertFalse(detection.has_field("visibility_ratio"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
