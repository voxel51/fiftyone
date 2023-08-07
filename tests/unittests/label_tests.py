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


F = fo.ViewField


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

        self.assertTrue(detection.has_field("label"))
        self.assertTrue(detection.has_field("foo"))
        self.assertFalse(detection.has_field("spam"))

        self.assertIsNone(detection.get_field("label"))
        self.assertEqual(detection.get_field("foo"), "bar")

        detection.set_field("label", "cat")
        detection.set_field("foo", "baz")
        detection.set_field("spam", "eggs")

        self.assertEqual(detection.get_field("label"), "cat")
        self.assertEqual(detection.get_field("foo"), "baz")
        self.assertEqual(detection.get_field("spam"), "eggs")

        # pylint: disable=no-member
        self.assertEqual(detection.label, "cat")
        self.assertEqual(detection.foo, "baz")
        self.assertEqual(detection.spam, "eggs")

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
            classifications=fo.Classifications(
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

        label_id = dynamic_doc["classifications"].classifications[0].id
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
        self.assertTrue(
            label_id == dynamic.classifications.classifications[0].id
        )
        self.assertFalse("classification" in dynamic)

    @drop_datasets
    def test_dynamic_label_tags(self):
        sample1 = fo.Sample(
            filepath="image1.jpg",
            dynamic=fo.DynamicEmbeddedDocument(
                classification=fo.Classification(label="hi"),
                classifications=fo.Classifications(
                    classifications=[
                        fo.Classification(label="spam"),
                        fo.Classification(label="eggs"),
                    ]
                ),
            ),
        )

        sample2 = fo.Sample(filepath="image2.jpg")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2], dynamic=True)

        label_fields = set(dataset._get_label_fields())

        self.assertSetEqual(
            label_fields,
            {
                "dynamic.classification",
                "dynamic.classifications",
            },
        )

        self.assertDictEqual(dataset.count_label_tags(), {})

        dataset.tag_labels("test")

        self.assertDictEqual(dataset.count_label_tags(), {"test": 3})

        dataset.untag_labels("test")

        self.assertDictEqual(dataset.count_label_tags(), {})

        dataset.tag_labels("test", label_fields="dynamic.classifications")

        self.assertDictEqual(dataset.count_label_tags(), {"test": 2})
        self.assertDictEqual(
            dataset.count_label_tags(label_fields="dynamic.classifications"),
            {"test": 2},
        )

        dataset.untag_labels("test", label_fields="dynamic.classifications")

        self.assertDictEqual(dataset.count_label_tags(), {})
        self.assertDictEqual(
            dataset.count_label_tags(label_fields="dynamic.classifications"),
            {},
        )

    @drop_datasets
    def test_dynamic_frame_label_fields(self):
        dynamic_doc = fo.DynamicEmbeddedDocument(
            classification=fo.Classification(label="label"),
            classifications=fo.Classifications(
                classifications=[fo.Classification(label="label")]
            ),
        )
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1]["dynamic"] = dynamic_doc

        dataset = fo.Dataset()
        dataset.add_sample(sample)
        dataset.add_dynamic_frame_fields()

        label_id = dynamic_doc["classification"].id
        view = dataset.select_labels(
            [
                {
                    "label_id": label_id,
                    "sample_id": sample.id,
                    "frame_number": 1,
                    "field": "frames.dynamic.classification",
                }
            ]
        )
        dynamic = view.first().frames[1].dynamic
        self.assertTrue(label_id == dynamic.classification.id)
        self.assertFalse("classifications" in dynamic)

        view = dataset.filter_labels(
            "frames.dynamic.classification", F("label") == "label"
        )
        dynamic = view.first().frames[1].dynamic
        self.assertTrue(label_id == dynamic.classification.id)

        label_id = dynamic_doc["classifications"].classifications[0].id
        view = dataset.select_labels(
            [
                {
                    "label_id": label_id,
                    "sample_id": sample.id,
                    "frame_number": 1,
                    "field": "frames.dynamic.classifications",
                }
            ]
        )
        dynamic = view.first().frames[1].dynamic
        self.assertTrue(
            label_id == dynamic.classifications.classifications[0].id
        )
        self.assertFalse("classification" in dynamic)

        view = dataset.filter_labels(
            "frames.dynamic.classifications", F("label") == "label"
        )
        dynamic = view.first().frames[1].dynamic
        self.assertTrue(
            label_id == dynamic.classifications.classifications[0].id
        )

    @drop_datasets
    def test_dynamic_frame_label_tags(self):
        sample1 = fo.Sample(
            filepath="video1.mp4",
        )
        sample1.frames[1]["dynamic"] = fo.DynamicEmbeddedDocument(
            classification=fo.Classification(label="hi"),
            classifications=fo.Classifications(
                classifications=[
                    fo.Classification(label="spam"),
                    fo.Classification(label="eggs"),
                ]
            ),
        )
        # test with empty documents
        sample1.frames[2]["dynamic"] = fo.DynamicEmbeddedDocument()

        sample2 = fo.Sample(filepath="video2.mp4")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2], dynamic=True)

        label_fields = set(dataset._get_label_fields())

        self.assertSetEqual(
            label_fields,
            {
                "frames.dynamic.classification",
                "frames.dynamic.classifications",
            },
        )

        self.assertDictEqual(dataset.count_label_tags(), {})

        dataset.tag_labels("test")
        self.assertDictEqual(dataset.count_label_tags(), {"test": 3})
        self.assertDictEqual(
            dataset.count_label_tags(
                label_fields="frames.dynamic.classification"
            ),
            {"test": 1},
        )
        self.assertDictEqual(
            dataset.count_label_tags(
                label_fields="frames.dynamic.classifications"
            ),
            {"test": 2},
        )

        dataset.untag_labels("test")
        self.assertDictEqual(dataset.count_label_tags(), {})

        dataset.tag_labels(
            "test", label_fields="frames.dynamic.classification"
        )
        self.assertDictEqual(dataset.count_label_tags(), {"test": 1})
        self.assertDictEqual(
            dataset.count_label_tags(
                label_fields="frames.dynamic.classification"
            ),
            {"test": 1},
        )

        dataset.untag_labels("test")
        self.assertDictEqual(dataset.count_label_tags(), {})

        dataset.tag_labels(
            "test", label_fields="frames.dynamic.classifications"
        )
        self.assertDictEqual(dataset.count_label_tags(), {"test": 2})
        self.assertDictEqual(
            dataset.count_label_tags(
                label_fields="frames.dynamic.classifications"
            ),
            {"test": 2},
        )

        dataset.untag_labels(
            "test", label_fields="frames.dynamic.classifications"
        )
        self.assertDictEqual(dataset.count_label_tags(), {})
        self.assertDictEqual(
            dataset.count_label_tags(
                label_fields="frames.dynamic.classifications"
            ),
            {},
        )

    @drop_datasets
    def test_label_conversion(self):
        label = "triangle"
        frame_size = (640, 480)

        polylines = fo.Polylines(
            polylines=[
                fo.Polyline(
                    label=label,
                    points=[[(0.1, 0.1), (0.1, 0.4), (0.4, 0.4)]],
                    closed=True,
                    filled=True,
                ),
                fo.Polyline(
                    label=label,
                    points=[[(0.6, 0.6), (0.9, 0.6), (0.9, 0.9)]],
                    closed=True,
                    filled=True,
                ),
            ]
        )

        detections = polylines.to_detections(frame_size=frame_size)
        detection = detections.detections[0]
        polyline = polylines.polylines[0]

        #
        # Grayscale
        #

        target = 128
        mask_targets = {target: label}

        seg1 = detections.to_segmentation(
            frame_size=frame_size, mask_targets=mask_targets
        )
        seg2 = detection.to_segmentation(frame_size=frame_size, target=target)
        seg3 = polylines.to_segmentation(
            frame_size=frame_size, mask_targets=mask_targets
        )
        seg4 = polyline.to_segmentation(frame_size=frame_size, target=target)

        self.assertEqual(seg1.mask.ndim, 2)
        self.assertEqual(seg2.mask.ndim, 2)
        self.assertEqual(seg3.mask.ndim, 2)
        self.assertEqual(seg4.mask.ndim, 2)

        dets1 = seg1.to_detections(
            mask_targets=mask_targets, mask_types="thing"
        )
        dets2 = seg2.to_detections(
            mask_targets=mask_targets, mask_types="stuff"
        )
        poly3 = seg3.to_polylines(
            mask_targets=mask_targets, mask_types="thing"
        )
        poly4 = seg4.to_polylines(
            mask_targets=mask_targets, mask_types="stuff"
        )

        self.assertEqual(len(dets1.detections), 2)
        self.assertEqual(len(dets2.detections), 1)
        self.assertEqual(len(poly3.polylines), 2)
        self.assertEqual(len(poly4.polylines), 1)

        #
        # Color
        #

        target = "#ff6d04"
        mask_targets = {target: label}

        seg1 = detections.to_segmentation(
            frame_size=frame_size, mask_targets=mask_targets
        )
        seg2 = detection.to_segmentation(frame_size=frame_size, target=target)
        seg3 = polylines.to_segmentation(
            frame_size=frame_size, mask_targets=mask_targets
        )
        seg4 = polyline.to_segmentation(frame_size=frame_size, target=target)

        self.assertEqual(seg1.mask.ndim, 3)
        self.assertEqual(seg2.mask.ndim, 3)
        self.assertEqual(seg3.mask.ndim, 3)
        self.assertEqual(seg4.mask.ndim, 3)

        dets1 = seg1.to_detections(
            mask_targets=mask_targets, mask_types="thing"
        )
        dets2 = seg2.to_detections(
            mask_targets=mask_targets, mask_types="stuff"
        )
        poly3 = seg3.to_polylines(
            mask_targets=mask_targets, mask_types="thing"
        )
        poly4 = seg4.to_polylines(
            mask_targets=mask_targets, mask_types="stuff"
        )

        self.assertEqual(len(dets1.detections), 2)
        self.assertEqual(len(dets2.detections), 1)
        self.assertEqual(len(poly3.polylines), 2)
        self.assertEqual(len(poly4.polylines), 1)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
