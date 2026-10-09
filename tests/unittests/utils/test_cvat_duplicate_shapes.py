"""
Tests for `fiftyone.utils.cvat.CVATAnnotationAPI._add_label_to_results()`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from bson import ObjectId

import fiftyone.core.labels as fol
import fiftyone.utils.cvat as fouc


class DuplicateLabelIdTests(unittest.TestCase):
    def test_duplicate_label_id_is_regenerated(self):
        shared_id = str(ObjectId())
        det1 = fol.Detection(label="car", bounding_box=[0, 0, 0.1, 0.1])
        det1.id = shared_id
        det2 = fol.Detection(label="car", bounding_box=[0.2, 0.2, 0.1, 0.1])
        det2.id = shared_id

        results = {}
        fouc.CVATAnnotationAPI._add_label_to_results(
            None, results, "detections", det1
        )
        fouc.CVATAnnotationAPI._add_label_to_results(
            None, results, "detections", det2
        )

        self.assertEqual(len(results), 2)
        ids = set(results.keys())
        self.assertTrue(all(ObjectId.is_valid(_id) for _id in ids))
        self.assertEqual(len(ids), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
