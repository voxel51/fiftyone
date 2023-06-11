"""
FiftyOne Label-related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from bson import Binary, ObjectId
import numpy as np

import fiftyone as fo

from decorators import drop_datasets


class LabelTests(unittest.TestCase):
    @drop_datasets
    def test_id(self):
        labels = {
            "regression": fo.Regression(value=51),
            "detection": fo.Detection(label="cat", bounding_box=[0, 0, 1, 1]),
            "classification": fo.Classification(label="cat"),
            "polyline": fo.Polyline(label="cat", points=[]),
            "keypoint": fo.Keypoint(label="cat", points=[]),
            "segmentation": fo.Segmentation(
                mask=np.random.randint(255, size=(4, 4), dtype=np.uint8)
            ),
            "heatmap": fo.Heatmap(map=np.random.random(size=(4, 4))),
            "temporal_detection": fo.TemporalDetection(
                label="cat", support=[1, 2]
            ),
            "geolocation": fo.GeoLocation(point=(0, 0)),
            "geolocations": fo.GeoLocations(point=[(0, 0)]),
        }

        for label in labels.values():
            self.assertIsInstance(label.id, str)
            self.assertIsInstance(label._id, ObjectId)

        sample = fo.Sample(filepath="image.jpg", **labels)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        sample_view = dataset.view().first()

        for field in labels.keys():
            label = sample_view[field]
            self.assertIsInstance(label.id, str)
            self.assertIsInstance(label._id, ObjectId)

    @drop_datasets
    def test_dynamic_fields(self):
        detection = fo.Detection(
            foo="bar",
            embedding=np.random.randn(4),
            custom_id=ObjectId(),
        )

        d = detection.to_dict()

        self.assertIsInstance(d["_id"], ObjectId)
        self.assertIsInstance(d["foo"], str)
        self.assertIsInstance(d["embedding"], Binary)
        self.assertIsInstance(d["_custom_id"], ObjectId)

        detection2 = fo.Detection.from_dict(d)

        self.assertEqual(detection2.id, detection.id)
        self.assertEqual(detection2["foo"], detection["foo"])
        self.assertIsInstance(detection2["embedding"], np.ndarray)
        self.assertEqual(detection2["custom_id"], detection["custom_id"])

        d = detection.to_dict(extended=True)

        self.assertIsInstance(d["_id"], dict)
        self.assertIsInstance(d["foo"], str)
        self.assertIsInstance(d["embedding"], dict)
        self.assertIsInstance(d["_custom_id"], dict)

        detection2 = fo.Detection.from_dict(d, extended=True)

        self.assertEqual(detection2.id, detection.id)
        self.assertEqual(detection2["foo"], detection["foo"])
        self.assertIsInstance(detection2.embedding, np.ndarray)
        self.assertEqual(detection2["custom_id"], detection["custom_id"])

    @drop_datasets
    def test_dynamic_label_fields(self):
        dynamic_doc = fo.DynamicEmbeddedDocument(
            classification=fo.Classification(label="label"),
            classifications=[fo.Classification(label="label")],
            more_classifications=fo.Classifications(
                classifications=[fo.Classification(label="label")]
            ),
        )
        sample = fo.Sample(filepath="image.jpg", dynamic=dynamic_doc)

        dataset = fo.Dataset()
        dataset.add_sample(sample)
        dataset.add_dynamic_sample_fields()

        label_id = dynamic_doc["classification"].id
        view = dataset.select_labels(
            [
                {
                    "label_id": label_id,
                    "sample_id": sample.id,
                    "field": "dynamic.classification",
                }
            ]
        )
        dynamic = view.first().dynamic
        self.assertTrue(label_id == dynamic.classification.id)
        self.assertFalse("classifications" in dynamic)
        self.assertFalse("more_classifications" in dynamic)

        label_id = dynamic_doc["classifications"][0].id
        view = dataset.select_labels(
            [
                {
                    "label_id": label_id,
                    "sample_id": sample.id,
                    "field": "dynamic.classifications",
                }
            ]
        )
        dynamic = view.first().dynamic

        self.assertTrue(label_id == dynamic.classifications[0].id)
        self.assertFalse("classification" in dynamic)
        self.assertFalse("more_classifications" in dynamic)

        label_id = dynamic_doc["more_classifications"].classifications[0].id
        view = dataset.select_labels(
            [
                {
                    "label_id": label_id,
                    "sample_id": sample.id,
                    "field": "dynamic.more_classifications",
                }
            ]
        )
        dynamic = view.first().dynamic
        self.assertTrue(
            label_id == dynamic.more_classifications.classifications[0].id
        )
        self.assertFalse("classification" in dynamic)
        self.assertFalse("classifications" in dynamic)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
