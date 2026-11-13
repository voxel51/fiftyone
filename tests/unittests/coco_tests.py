"""
FiftyOne COCO utilities unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone.utils.coco as fouc


class COCODatasetTests(unittest.TestCase):
    def test_merge_keypoint_annotations(self):
        d = {
            "categories": [
                {"id": 1, "name": "person"},
                {"id": 2, "name": "cat"},
            ],
            "annotations": [
                {"id": 1, "category_id": 1, "bbox": [1, 2, 3, 4]},
                {"id": 2, "category_id": 2, "bbox": [5, 6, 7, 8]},
            ],
        }
        keypoints_d = {
            "categories": [
                {
                    "id": 1,
                    "name": "person",
                    "keypoints": ["nose", "left_eye"],
                    "skeleton": [[1, 2]],
                }
            ],
            "annotations": [
                {
                    "id": 1,
                    "category_id": 1,
                    "keypoints": [10, 20, 2, 30, 40, 1],
                    "num_keypoints": 2,
                }
            ],
        }

        fouc._merge_coco_keypoints(d, keypoints_d)

        person = d["annotations"][0]
        self.assertEqual(person["bbox"], [1, 2, 3, 4])
        self.assertEqual(person["keypoints"], [10, 20, 2, 30, 40, 1])
        self.assertEqual(person["num_keypoints"], 2)
        self.assertNotIn("keypoints", d["annotations"][1])

        person_category = d["categories"][0]
        self.assertEqual(person_category["keypoints"], ["nose", "left_eye"])
        self.assertEqual(person_category["skeleton"], [[1, 2]])
        self.assertNotIn("keypoints", d["categories"][1])


if __name__ == "__main__":
    unittest.main(verbosity=2)
