"""
FiftyOne Label-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from bson import ObjectId
import numpy as np

import fiftyone as fo

from decorators import drop_datasets


class LabelTests(unittest.TestCase):
    @drop_datasets
    def test_id(self):
        regression = fo.Regression(value=51)
        self.assertIsInstance(regression.id, str)
        self.assertIsInstance(regression._id, ObjectId)

        detection = fo.Detection(label="cat", bounding_box=[0, 0, 1, 1])
        self.assertIsInstance(detection.id, str)
        self.assertIsInstance(detection._id, ObjectId)

        classification = fo.Classification(label="cat")
        self.assertIsInstance(classification.id, str)
        self.assertIsInstance(classification._id, ObjectId)

        polyline = fo.Polyline(label="cat", points=[])
        self.assertIsInstance(polyline.id, str)
        self.assertIsInstance(polyline._id, ObjectId)

        keypoint = fo.Keypoint(label="cat", points=[])
        self.assertIsInstance(keypoint.id, str)
        self.assertIsInstance(keypoint._id, ObjectId)

        segmentation = fo.Segmentation(
            mask=np.random.randint(255, size=(4, 4), dtype=np.uint8)
        )
        self.assertIsInstance(segmentation.id, str)
        self.assertIsInstance(segmentation._id, ObjectId)

        heatmap = fo.Heatmap(mask=np.random.random(size=(4, 4)))
        self.assertIsInstance(heatmap.id, str)
        self.assertIsInstance(heatmap._id, ObjectId)

        temporal_detection = fo.TemporalDetection(label="cat", support=[1, 2])
        self.assertIsInstance(temporal_detection.id, str)
        self.assertIsInstance(temporal_detection._id, ObjectId)

        geolocation = fo.GeoLocation(point=(0, 0))
        self.assertIsInstance(geolocation.id, str)
        self.assertIsInstance(geolocation._id, ObjectId)

        geolocations = fo.GeoLocations(points=[(0, 0)])
        self.assertIsInstance(geolocations.id, str)
        self.assertIsInstance(geolocations._id, ObjectId)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
