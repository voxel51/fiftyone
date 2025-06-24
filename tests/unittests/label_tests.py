"""
FiftyOne Label-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from bson import Binary, ObjectId
import numpy as np
import numpy.testing as nptest

import fiftyone as fo
import fiftyone.core.labels as focl
import fiftyone.utils.labels as foul
from fiftyone import ViewField as F

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

        # check both int and RGB
        for target, ndim in ((128, 2), ("#ff6d04", 3)):
            mask_targets = {target: label}

            seg1 = detections.to_segmentation(
                frame_size=frame_size, mask_targets=mask_targets
            )
            seg2 = detection.to_segmentation(
                frame_size=frame_size, target=target
            )
            seg3 = polylines.to_segmentation(
                frame_size=frame_size, mask_targets=mask_targets
            )
            seg4 = polyline.to_segmentation(
                frame_size=frame_size, target=target
            )

            self.assertEqual(seg1.mask.ndim, ndim)
            self.assertEqual(seg2.mask.ndim, ndim)
            self.assertEqual(seg3.mask.ndim, ndim)
            self.assertEqual(seg4.mask.ndim, ndim)

            dets1 = seg1.to_detections(
                mask_targets=mask_targets, mask_types="thing"
            )
            dets2 = seg2.to_detections(
                mask_targets=mask_targets, mask_types="stuff"
            )
            poly3 = seg3.to_polylines(
                mask_targets=mask_targets,
                mask_types="thing",
                tolerance=2,
            )
            poly4 = seg4.to_polylines(
                mask_targets=mask_targets,
                mask_types="stuff",
                tolerance=2,
            )

            self.assertEqual(len(dets1.detections), 2)
            self.assertEqual(len(dets2.detections), 1)
            self.assertEqual(len(poly3.polylines), 2)
            self.assertEqual(len(poly4.polylines), 1)

            # check bounding boxes
            self.assertEqual(
                dets1.detections[0].bounding_box, [0.1, 0.1, 0.3, 0.3]
            )
            self.assertEqual(
                dets1.detections[1].bounding_box, [0.6, 0.6, 0.3, 0.3]
            )

            self.assertEqual(
                dets2.detections[0].bounding_box, [0.1, 0.1, 0.3, 0.3]
            )

            # check polylines
            #
            # polyline -> detection -> polyline does not always return
            # the exact same values because of interpolation, so it's
            # not possible in general to check for exact
            # equality.
            def poly_bounds(p):
                a = np.array(p["points"]).squeeze()
                ymin, xmin = a.min(axis=0)
                ymax, xmax = a.max(axis=0)
                return (xmin, xmax, ymin, ymax)

            nptest.assert_almost_equal(
                poly_bounds(poly3.polylines[0]),
                poly_bounds(polylines.polylines[0]),
                decimal=1,
            )
            nptest.assert_almost_equal(
                poly_bounds(poly3.polylines[1]),
                poly_bounds(polylines.polylines[1]),
                decimal=1,
            )
            nptest.assert_almost_equal(
                poly_bounds(poly4.polylines[0]),
                poly_bounds(polylines.polylines[0]),
                decimal=1,
            )

    @drop_datasets
    def test_parse_stuff_instance(self):
        mask = np.ones((3, 3), dtype=bool)
        offset = (0, 0)
        frame_size = (6, 6)
        bbox, instance_mask = focl._parse_stuff_instance(
            mask, offset, frame_size
        )
        self.assertEqual(bbox, [0.0, 0.0, 0.5, 0.5])
        nptest.assert_array_equal(instance_mask, mask)

    @drop_datasets
    def test_parse_thing_instances(self):
        # test on multiple disconnected objects with overlapping
        # bounding boxes
        mask = np.eye(5, dtype=bool)
        mask[0, -1] = True
        offset = (0, 0)
        frame_size = (10, 10)
        results = focl._parse_thing_instances(mask, offset, frame_size)
        self.assertEqual(len(results), 2)

        bbox, instance_mask = max(results, key=lambda x: x[1].size)
        self.assertEqual(bbox, [0, 0, 0.5, 0.5])
        expected_mask = np.eye(5, dtype=bool)
        nptest.assert_array_equal(instance_mask, expected_mask)

        bbox, instance_mask = min(results, key=lambda x: x[1].size)
        self.assertEqual(bbox, [0.4, 0, 0.1, 0.1])
        expected_mask = np.eye(1, dtype=bool)
        nptest.assert_array_equal(instance_mask, expected_mask)

    @drop_datasets
    def test_transform_mask(self):
        # int to int
        mask = np.arange(9).reshape((3, 3))
        targets_map = dict((i, i + 1) for i in range(1, 9))
        int_to_int = focl._transform_mask(mask, targets_map)
        nptest.assert_array_equal(
            int_to_int[int_to_int != 0], mask[mask != 0] + 1
        )

        # int to rgb
        targets_map = dict((i, focl._int_to_hex(i)) for i in range(1, 9))
        int_to_rgb = focl._transform_mask(mask, targets_map)
        self.assertEqual(int_to_rgb.shape, (3, 3, 3))
        nptest.assert_array_equal(int_to_rgb[:, :, 0], np.zeros_like(mask))
        nptest.assert_array_equal(int_to_rgb[:, :, 1], np.zeros_like(mask))
        nptest.assert_array_equal(int_to_rgb[:, :, 2], mask)

        # rgb back to int
        targets_map = dict((focl._int_to_hex(i), i) for i in range(1, 9))
        rgb_to_int = focl._transform_mask(int_to_rgb, targets_map)
        nptest.assert_array_equal(rgb_to_int, mask)

        # rgb to rgb
        targets_map = dict(
            (focl._int_to_hex(i), focl._int_to_hex(0)) for i in range(1, 9)
        )
        rgb_to_rgb = focl._transform_mask(int_to_rgb, targets_map)
        nptest.assert_array_equal(rgb_to_rgb, np.zeros((3, 3, 3), dtype=int))

    @drop_datasets
    def test_view_stages_with_instance_ids(self):
        cat1 = fo.Instance()
        cat2 = fo.Instance()
        cat3 = fo.Instance()
        dog1 = fo.Instance()
        dog2 = fo.Instance()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", instance=cat1),
                    fo.Detection(label="cat", instance=cat2),
                    fo.Detection(label="dog", instance=dog1),
                    fo.Detection(label="none"),
                ]
            )
        )
        sample1.frames[2] = fo.Frame()
        sample1.frames[3] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", instance=cat1),
                    fo.Detection(label="cat", instance=cat2),
                    fo.Detection(label="none"),
                    fo.Detection(label="dog", instance=dog1),
                ]
            )
        )
        sample1.frames[4] = fo.Frame(ground_truth=fo.Detections())
        sample1.frames[5] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", instance=cat1),
                    fo.Detection(label="cat", instance=cat3),
                    fo.Detection(label="none"),
                    fo.Detection(label="dog", instance=dog2),
                ]
            )
        )
        sample1.frames[6] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog", instance=dog2),
                ]
            )
        )

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()

        sample3 = fo.Sample(filepath="video3.mp4")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        instances = dataset.count_values(
            "frames.ground_truth.detections.instance._id"
        )

        self.assertDictEqual(
            instances,
            {
                cat1._id: 3,
                cat2._id: 2,
                cat3._id: 1,
                dog1._id: 2,
                dog2._id: 2,
                None: 3,
            },
        )

        view = dataset.select_labels(
            instance_ids=cat1.id, fields="frames.ground_truth"
        )
        instances = view.count_values(
            "frames.ground_truth.detections.instance._id"
        )

        self.assertEqual(len(view), 1)
        self.assertDictEqual(instances, {cat1._id: 3})

        view = dataset.match_labels(
            instance_ids=cat1.id, fields="frames.ground_truth"
        )

        self.assertEqual(len(view), 1)
        self.assertEqual(view.count("frames.ground_truth.detections"), 13)

        view = dataset.exclude_labels(
            instance_ids=cat1.id,
            fields="frames.ground_truth",
            omit_empty=False,
        )
        instances = view.count_values(
            "frames.ground_truth.detections.instance._id"
        )

        self.assertEqual(len(view), 3)
        self.assertTrue(cat1._id not in instances)

        dataset.delete_labels(
            instance_ids=cat1.id, fields="frames.ground_truth"
        )
        instances = dataset.count_values(
            "frames.ground_truth.detections.instance._id"
        )

        self.assertEqual(len(dataset), 3)
        self.assertTrue(cat1._id not in instances)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 10)


class LabelUtilsTests(unittest.TestCase):
    @drop_datasets
    def test_label_to_instance_video(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", index=1),
                    fo.Detection(label="cat", index=2),
                    fo.Detection(label="dog", index=1),
                    fo.Detection(label="none"),
                ]
            )
        )
        sample.frames[2] = fo.Frame()
        sample.frames[3] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", index=1),
                    fo.Detection(label="cat", index=2),
                    fo.Detection(label="none"),
                    fo.Detection(label="dog", index=1),
                ]
            )
        )
        sample.frames[4] = fo.Frame(ground_truth=fo.Detections())
        sample.frames[5] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", index=1),
                    fo.Detection(label="cat", index=3),
                    fo.Detection(label="none"),
                    fo.Detection(label="dog", index=2),
                ]
            )
        )
        sample.frames[6] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog", index=2),
                ]
            )
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        foul.index_to_instance(
            dataset, "frames.ground_truth", clear_index=True
        )

        instances = dataset.count_values(
            "frames.ground_truth.detections.instance._id"
        )
        indexes = dataset.count_values("frames.ground_truth.detections.index")

        cat1 = sample.frames[1].ground_truth.detections[0].instance._id
        cat2 = sample.frames[1].ground_truth.detections[1].instance._id
        cat3 = sample.frames[5].ground_truth.detections[1].instance._id
        dog1 = sample.frames[1].ground_truth.detections[2].instance._id
        dog2 = sample.frames[5].ground_truth.detections[3].instance._id

        self.assertDictEqual(
            instances, {cat1: 3, cat2: 2, cat3: 1, dog1: 2, dog2: 2, None: 3}
        )
        self.assertDictEqual(indexes, {None: 13})

    @drop_datasets
    def test_label_to_instance_group(self):
        group1 = fo.Group()
        left_sample1 = fo.Sample(
            filepath="left-image1.jpg",
            group=group1.element("left"),
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", index=1),
                    fo.Detection(label="cat", index=2),
                    fo.Detection(label="dog", index=1),
                    fo.Detection(label="none"),
                ]
            ),
        )
        right_sample1 = fo.Sample(
            filepath="right-image1.jpg",
            group=group1.element("right"),
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", index=1),
                    fo.Detection(label="dog", index=1),
                    fo.Detection(label="none"),
                    fo.Detection(label="dog", index=2),
                ]
            ),
        )

        group2 = fo.Group()
        left_sample2 = fo.Sample(
            filepath="left-image2.jpg",
            group=group2.element("left"),
        )
        right_sample2 = fo.Sample(
            filepath="right-image2.jpg",
            group=group2.element("right"),
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", index=1),
                    fo.Detection(label="dog", index=1),
                    fo.Detection(label="none"),
                ]
            ),
        )

        group3 = fo.Group()
        left_sample3 = fo.Sample(
            filepath="left-image3.jpg",
            group=group3.element("left"),
            ground_truth=fo.Detections(),
        )
        right_sample3 = fo.Sample(
            filepath="right-image3.jpg",
            group=group3.element("right"),
        )

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                left_sample1,
                right_sample1,
                left_sample2,
                right_sample2,
                left_sample3,
                right_sample3,
            ]
        )

        foul.index_to_instance(dataset, "ground_truth", clear_index=True)

        view = dataset.select_group_slices()
        instances = view.count_values("ground_truth.detections.instance._id")
        indexes = view.count_values("ground_truth.detections.index")

        cat1 = left_sample1.ground_truth.detections[0].instance._id
        cat2 = left_sample1.ground_truth.detections[1].instance._id
        cat3 = right_sample2.ground_truth.detections[0].instance._id
        dog1 = left_sample1.ground_truth.detections[2].instance._id
        dog2 = right_sample1.ground_truth.detections[3].instance._id
        dog3 = right_sample2.ground_truth.detections[1].instance._id

        self.assertDictEqual(
            instances,
            {cat1: 2, cat2: 1, cat3: 1, dog1: 2, dog2: 1, dog3: 1, None: 3},
        )
        self.assertDictEqual(indexes, {None: 11})

    @drop_datasets
    def test_perform_nms(self):
        detections = [
            fo.Detection(
                label="cat", bounding_box=[0, 0, 0.30, 0.30], confidence=0.9
            ),
            fo.Detection(
                label="cat", bounding_box=[0, 0, 0.29, 0.29], confidence=1
            ),
            fo.Detection(
                label="dog", bounding_box=[0, 0, 0.30, 0.30], confidence=0.4
            ),
            fo.Detection(
                label="dog", bounding_box=[0, 0, 0.29, 0.29], confidence=None
            ),
        ]

        id1 = detections[0].id
        id2 = detections[1].id
        id3 = detections[2].id
        id4 = detections[3].id

        sample1 = fo.Sample(
            filepath="image1.jpg",
            predictions=fo.Detections(detections=detections),
        )
        sample2 = fo.Sample(filepath="image2.jpg", predictions=fo.Detections())
        sample3 = fo.Sample(filepath="image3.jpg")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        foul.perform_nms(
            dataset, "predictions", out_field="nms1", iou_thresh=0.5
        )
        ids1 = dataset.values("nms1.detections.id", unwind=True)
        self.assertListEqual(ids1, [id2, id3])

        foul.perform_nms(
            dataset,
            "predictions",
            out_field="nms2",
            classwise=False,
            iou_thresh=0.5,
        )
        ids2 = dataset.values("nms2.detections.id", unwind=True)
        self.assertListEqual(ids2, [id2])

        foul.perform_nms(
            dataset,
            "predictions",
            out_field="nms3",
            iou_thresh=0.5,
            confidence_thresh=0.5,
        )
        ids3 = dataset.values("nms3.detections.id", unwind=True)
        self.assertListEqual(ids3, [id2])


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
