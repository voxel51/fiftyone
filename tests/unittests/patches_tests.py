"""
FiftyOne patches-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
from datetime import datetime

from bson import ObjectId
import unittest

import fiftyone as fo
import fiftyone.core.patches as fop
from fiftyone import ViewField as F

from decorators import drop_datasets


class PatchesTests(unittest.TestCase):
    @drop_datasets
    def test_to_patches(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="image1.png",
            tags=["sample1"],
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                    fo.Detection(label="squirrel"),
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                    fo.Detection(label="squirrel"),
                ]
            ),
        )

        sample2 = fo.Sample(
            filepath="image2.png",
            tags=["sample2"],
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            ),
        )

        dataset.add_samples([sample1, sample2])

        view = dataset.to_patches("ground_truth")

        self.assertSetEqual(
            set(view.get_field_schema().keys()),
            {
                "id",
                "filepath",
                "tags",
                "metadata",
                "created_at",
                "last_modified_at",
                "sample_id",
                "ground_truth",
            },
        )

        self.assertEqual(
            view.get_field("metadata").document_type,
            fo.ImageMetadata,
        )

        self.assertListEqual(
            view.distinct("dataset_id"),
            [str(view._dataset._doc.id)],
        )

        self.assertSetEqual(
            set(view.select_fields().get_field_schema().keys()),
            {
                "id",
                "filepath",
                "tags",
                "metadata",
                "created_at",
                "last_modified_at",
                "sample_id",
            },
        )

        with self.assertRaises(ValueError):
            view.exclude_fields("sample_id")  # can't exclude default field

        index_info = view.get_index_information()
        indexes = view.list_indexes()
        default_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "sample_id",
        }

        self.assertSetEqual(set(index_info.keys()), default_indexes)
        self.assertSetEqual(set(indexes), default_indexes)

        with self.assertRaises(ValueError):
            view.drop_index("id")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("filepath")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("sample_id")  # can't drop default index

        self.assertEqual(dataset.count("ground_truth.detections"), 6)
        self.assertEqual(view.count(), 6)
        self.assertEqual(len(view), 6)

        sample = view.first()
        self.assertIsInstance(sample.id, str)
        self.assertIsInstance(sample._id, ObjectId)
        self.assertIsInstance(sample.sample_id, str)
        self.assertIsInstance(sample._sample_id, ObjectId)

        for _id in view.values("id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_id"):
            self.assertIsInstance(oid, ObjectId)

        for _id in view.values("sample_id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_sample_id"):
            self.assertIsInstance(oid, ObjectId)

        self.assertDictEqual(
            dataset.count_sample_tags(), {"sample1": 1, "sample2": 1}
        )
        self.assertDictEqual(
            view.count_sample_tags(), {"sample1": 4, "sample2": 2}
        )

        view.tag_samples("test")

        self.assertEqual(view.count_sample_tags()["test"], 6)
        self.assertNotIn("test", dataset.count_sample_tags())

        view.untag_samples("test")

        self.assertNotIn("test", view.count_sample_tags())
        self.assertNotIn("test", dataset.count_sample_tags())

        view.tag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {"test": 6})
        self.assertDictEqual(
            dataset.count_label_tags("ground_truth"), {"test": 6}
        )
        self.assertDictEqual(dataset.count_label_tags("predictions"), {})

        # Including `select_labels()` here tests an important property: if the
        # contents of a `view` changes after a save operation occurs, the
        # original view still needs to be synced with the source dataset
        view.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags("ground_truth"), {})
        self.assertDictEqual(dataset.count_label_tags("predictions"), {})

        view2 = view.skip(4)

        values = [l.upper() for l in view2.values("ground_truth.label")]
        view2.set_values("ground_truth.label_upper", values)

        self.assertEqual(dataset.count(), 2)
        self.assertEqual(view.count(), 6)
        self.assertEqual(view2.count(), 2)
        self.assertEqual(dataset.count("ground_truth.detections"), 6)
        self.assertEqual(view.count("ground_truth"), 6)
        self.assertEqual(view2.count("ground_truth"), 2)
        self.assertEqual(
            dataset.count("ground_truth.detections.label_upper"), 2
        )
        self.assertEqual(view.count("ground_truth.label_upper"), 2)
        self.assertEqual(view2.count("ground_truth.label_upper"), 2)
        self.assertEqual(
            view.count_values("ground_truth.label_upper")["CAT"], 1
        )
        self.assertEqual(
            view2.count_values("ground_truth.label_upper")["CAT"], 1
        )
        self.assertEqual(
            dataset.count_values("ground_truth.detections.label_upper")["CAT"],
            1,
        )
        self.assertIsNone(view.get_field("ground_truth.label_upper"))
        self.assertIsNone(
            dataset.get_field("ground_truth.detections.label_upper")
        )

        view2.set_values("ground_truth.label_dynamic", values, dynamic=True)
        self.assertIsNotNone(view.get_field("ground_truth.label_dynamic"))
        self.assertIsNotNone(
            dataset.get_field("ground_truth.detections.label_dynamic")
        )

        values = {
            _id: v
            for _id, v in zip(
                *view2.values(["ground_truth.id", "ground_truth.label"])
            )
        }
        view.set_label_values("ground_truth.also_label", values)

        self.assertEqual(view.count("ground_truth.also_label"), 2)
        self.assertEqual(
            dataset.count("ground_truth.detections.also_label"), 2
        )
        self.assertDictEqual(
            view.count_values("ground_truth.also_label"),
            dataset.count_values("ground_truth.detections.also_label"),
        )

        view3 = view.skip(4).set_field(
            "ground_truth.label", F("label").upper()
        )

        self.assertEqual(view.count(), 6)
        self.assertEqual(view3.count(), 2)
        self.assertEqual(dataset.count("ground_truth.detections"), 6)
        self.assertNotIn("cat", view3.count_values("ground_truth.label"))
        self.assertEqual(view3.count_values("ground_truth.label")["CAT"], 1)
        self.assertEqual(view.count_values("ground_truth.label")["cat"], 2)
        self.assertEqual(
            dataset.count_values("ground_truth.detections.label")["cat"], 2
        )
        self.assertNotIn(
            "CAT", dataset.count_values("ground_truth.detections.label")
        )

        view3.save()

        self.assertEqual(view.count(), 6)
        self.assertEqual(dataset.count("ground_truth.detections"), 6)
        self.assertIn("CAT", view.count_values("ground_truth.label"))
        self.assertIn(
            "CAT", dataset.count_values("ground_truth.detections.label")
        )

        view3.keep()

        self.assertEqual(view.count(), 2)
        self.assertEqual(dataset.count("ground_truth.detections"), 2)
        self.assertNotIn("cat", view.count_values("ground_truth.label"))
        self.assertNotIn(
            "cat", dataset.count_values("ground_truth.detections.label")
        )

        sample = view.first()

        sample.ground_truth["hello"] = "world"
        sample.save()

        self.assertEqual(view.count_values("ground_truth.hello")["world"], 1)
        self.assertEqual(
            dataset.count_values("ground_truth.detections.hello")["world"], 1
        )

        dataset.untag_samples("sample1")
        view.reload()

        self.assertDictEqual(dataset.count_sample_tags(), {"sample2": 1})
        self.assertDictEqual(view.count_sample_tags(), {"sample2": 2})

        view.tag_labels("test")

        self.assertDictEqual(
            view.count_label_tags(), dataset.count_label_tags("ground_truth")
        )

        # Including `select_labels()` here tests an important property: if the
        # contents of a `view` changes after a save operation occurs, the
        # original view still needs to be synced with the source dataset
        view.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(view.count_values("ground_truth.tags"), {})
        self.assertDictEqual(
            dataset.count_values("ground_truth.detections.tags"), {}
        )

        view.select_fields().keep_fields()

        self.assertNotIn("ground_truth", view.get_field_schema())
        self.assertNotIn("ground_truth", dataset.get_field_schema())

        sample_view = view.first()
        with self.assertRaises(KeyError):
            sample_view["ground_truth"]

        sample = dataset.first()
        with self.assertRaises(KeyError):
            sample["ground_truth"]

        # Test saving a patches view

        self.assertIsNone(view.name)

        view_name = "test"
        dataset.save_view(view_name, view)
        self.assertEqual(view.name, view_name)
        self.assertTrue(view.is_saved)

        also_view = dataset.load_saved_view(view_name)
        self.assertEqual(view, also_view)
        self.assertEqual(also_view.name, view_name)
        self.assertTrue(also_view.is_saved)

        still_view = deepcopy(view)
        self.assertEqual(still_view.name, view_name)
        self.assertTrue(still_view.is_saved)
        self.assertEqual(still_view, view)

    @drop_datasets
    def test_to_evaluation_patches(self):
        dataset = fo.Dataset()

        sample = fo.Sample(
            filepath="image.png",
            tags=["sample"],
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        iscrowd=True,
                    ),
                    fo.Detection(
                        label="dog", bounding_box=[0.6, 0.6, 0.1, 0.1]
                    ),
                    fo.Detection(
                        label="rabbit", bounding_box=[0.8, 0.8, 0.1, 0.1]
                    ),
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat", bounding_box=[0.1, 0.1, 0.1, 0.1]
                    ),
                    fo.Detection(
                        label="cat", bounding_box=[0.2, 0.2, 0.1, 0.1]
                    ),
                    fo.Detection(
                        label="dog", bounding_box=[0.6, 0.6, 0.1, 0.1]
                    ),
                    fo.Detection(
                        label="rabbit", bounding_box=[0.9, 0.9, 0.1, 0.1]
                    ),
                ]
            ),
        )

        dataset.add_sample(sample)

        dataset.evaluate_detections(
            "predictions", gt_field="ground_truth", eval_key="eval"
        )

        view = dataset.to_evaluation_patches("eval")

        self.assertSetEqual(
            set(view.get_field_schema().keys()),
            {
                "id",
                "filepath",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "sample_id",
                "ground_truth",
                "predictions",
                "type",
                "iou",
                "crowd",
            },
        )

        self.assertSetEqual(
            set(view.select_fields().get_field_schema().keys()),
            {
                "id",
                "filepath",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "sample_id",
            },
        )

        with self.assertRaises(ValueError):
            view.exclude_fields("sample_id")  # can't exclude default field

        index_info = view.get_index_information()
        indexes = view.list_indexes()
        default_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "sample_id",
        }

        self.assertSetEqual(set(index_info.keys()), default_indexes)
        self.assertSetEqual(set(indexes), default_indexes)

        with self.assertRaises(ValueError):
            view.drop_index("id")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("filepath")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("sample_id")  # can't drop default index

        self.assertEqual(dataset.count("ground_truth.detections"), 3)
        self.assertEqual(dataset.count("predictions.detections"), 4)

        self.assertEqual(view.count(), 4)
        self.assertEqual(len(view), 4)

        sample = view.first()
        self.assertIsInstance(sample.id, str)
        self.assertIsInstance(sample._id, ObjectId)
        self.assertIsInstance(sample.sample_id, str)
        self.assertIsInstance(sample._sample_id, ObjectId)

        for _id in view.values("id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_id"):
            self.assertIsInstance(oid, ObjectId)

        for _id in view.values("sample_id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_sample_id"):
            self.assertIsInstance(oid, ObjectId)

        self.assertDictEqual(dataset.count_sample_tags(), {"sample": 1})
        self.assertDictEqual(view.count_sample_tags(), {"sample": 4})

        self.assertDictEqual(
            view.count_values("type"), {"fp": 1, "tp": 2, "fn": 1}
        )

        self.assertEqual(view.count_values("crowd")[True], 1)

        view.tag_samples("test")

        self.assertEqual(view.count_sample_tags()["test"], 4)
        self.assertNotIn("test", dataset.count_sample_tags())

        view.untag_samples("test")

        self.assertNotIn("test", view.count_sample_tags())
        self.assertNotIn("test", dataset.count_sample_tags())

        view.tag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {"test": 7})
        self.assertDictEqual(
            dataset.count_label_tags("ground_truth"), {"test": 3}
        )
        self.assertDictEqual(
            dataset.count_label_tags("predictions"), {"test": 4}
        )

        # Including `select_labels()` here tests an important property: if the
        # contents of a `view` changes after a save operation occurs, the
        # original view still needs to be synced with the source dataset
        view.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags("ground_truth"), {})
        self.assertDictEqual(dataset.count_label_tags("predictions"), {})

        view2 = view.match(F("type") == "tp")

        values = [
            [l.upper() for l in _labels]
            for _labels in view2.values("predictions.detections.label")
        ]
        view2.set_values("predictions.detections.label_upper", values)

        self.assertEqual(dataset.count(), 1)
        self.assertEqual(view.count(), 4)
        self.assertEqual(view2.count(), 2)
        self.assertEqual(dataset.count("predictions.detections"), 4)
        self.assertEqual(view.count("predictions.detections"), 4)
        self.assertEqual(view2.count("predictions.detections"), 3)
        self.assertEqual(
            dataset.count("predictions.detections.label_upper"), 3
        )
        self.assertEqual(view.count("predictions.detections.label_upper"), 3)
        self.assertEqual(view2.count("predictions.detections.label_upper"), 3)
        self.assertEqual(
            view.count_values("predictions.detections.label_upper")["CAT"], 2
        )
        self.assertEqual(
            view2.count_values("predictions.detections.label_upper")["CAT"], 2
        )
        self.assertEqual(
            dataset.count_values("predictions.detections.label_upper")["CAT"],
            2,
        )
        self.assertIsNone(view.get_field("predictions.detections.label_upper"))
        self.assertIsNone(
            dataset.get_field("predictions.detections.label_upper")
        )

        view2.set_values(
            "predictions.detections.label_dynamic", values, dynamic=True
        )
        self.assertIsNotNone(
            view.get_field("predictions.detections.label_dynamic")
        )
        self.assertIsNotNone(
            dataset.get_field("predictions.detections.label_dynamic")
        )

        values = {
            _id: v
            for _id, v in zip(
                *view2.values(
                    [
                        "predictions.detections.id",
                        "predictions.detections.label",
                    ],
                    unwind=True,
                )
            )
        }
        view.set_label_values("predictions.detections.also_label", values)

        self.assertEqual(view.count("predictions.detections.also_label"), 3)
        self.assertEqual(dataset.count("predictions.detections.also_label"), 3)
        self.assertDictEqual(
            view.count_values("predictions.detections.also_label"),
            dataset.count_values("predictions.detections.also_label"),
        )

        view3 = view.match(F("crowd") == True).set_field(
            "ground_truth.detections.label", F("label").upper()
        )

        self.assertEqual(view.count(), 4)
        self.assertEqual(view3.count(), 1)
        self.assertEqual(dataset.count("ground_truth.detections"), 3)
        self.assertEqual(dataset.count("predictions.detections"), 4)
        self.assertDictEqual(
            view3.count_values("ground_truth.detections.label"), {"CAT": 1}
        )
        self.assertDictEqual(
            view.count_values("ground_truth.detections.label"),
            {"dog": 1, "cat": 1, "rabbit": 1},
        )
        self.assertDictEqual(
            dataset.count_values("ground_truth.detections.label"),
            {"dog": 1, "cat": 1, "rabbit": 1},
        )

        view3.save()

        self.assertEqual(view.count(), 4)
        self.assertEqual(dataset.count("ground_truth.detections"), 3)
        self.assertIn(
            "CAT", view.count_values("ground_truth.detections.label")
        )
        self.assertIn(
            "CAT", dataset.count_values("ground_truth.detections.label")
        )

        view3.keep()

        self.assertEqual(view.count(), 1)
        self.assertEqual(dataset.count("ground_truth.detections"), 1)
        self.assertDictEqual(
            view.count_values("ground_truth.detections.label"), {"CAT": 1}
        )
        self.assertDictEqual(
            dataset.count_values("ground_truth.detections.label"), {"CAT": 1}
        )

        sample = view.match(F("crowd") == True).first()

        for det in sample.predictions.detections:
            det.hello = "world"

        sample.save()

        self.assertDictEqual(
            view.count_values("predictions.detections.hello"), {"world": 2}
        )
        self.assertDictEqual(
            dataset.count_values("predictions.detections.hello"), {"world": 2}
        )

        dataset.untag_samples("sample")
        view.reload()

        self.assertDictEqual(dataset.count_sample_tags(), {})
        self.assertDictEqual(view.count_sample_tags(), {})

        view.tag_labels("test", label_fields="ground_truth")

        self.assertDictEqual(
            view.count_label_tags("ground_truth"),
            dataset.count_label_tags("ground_truth"),
        )

        # Including `select_labels()` here tests an important property: if the
        # contents of a `view` changes after a save operation occurs, the
        # original view still needs to be synced with the source dataset
        view.select_labels(tags="test", fields="ground_truth").untag_labels(
            "test"
        )

        self.assertDictEqual(
            view.count_values("ground_truth.detections.tags"), {}
        )
        self.assertDictEqual(
            dataset.count_values("ground_truth.detections.tags"), {}
        )

        view.select_fields().keep_fields()

        self.assertNotIn("ground_truth", view.get_field_schema())
        self.assertNotIn("predictions", view.get_field_schema())
        self.assertNotIn("ground_truth", dataset.get_field_schema())
        self.assertNotIn("predictions", dataset.get_field_schema())

        sample_view = view.first()

        with self.assertRaises(KeyError):
            sample_view["ground_truth"]

        with self.assertRaises(KeyError):
            sample_view["predictions"]

        sample = dataset.first()

        with self.assertRaises(KeyError):
            sample["ground_truth"]

        with self.assertRaises(KeyError):
            sample["predictions"]

        # Test saving an evaluation patches view

        self.assertIsNone(view.name)

        view_name = "test"
        dataset.save_view(view_name, view)
        self.assertEqual(view.name, view_name)
        self.assertTrue(view.is_saved)

        also_view = dataset.load_saved_view(view_name)
        self.assertEqual(view, also_view)
        self.assertEqual(also_view.name, view_name)
        self.assertTrue(also_view.is_saved)

        still_view = deepcopy(view)
        self.assertEqual(still_view.name, view_name)
        self.assertTrue(still_view.is_saved)
        self.assertEqual(still_view, view)

    @drop_datasets
    def test_make_patches_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="image1.png",
            tags=["sample1"],
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                    fo.Detection(label="squirrel"),
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                    fo.Detection(label="squirrel"),
                ]
            ),
        )

        sample2 = fo.Sample(
            filepath="image2.png",
            tags=["sample2"],
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            ),
        )

        dataset.add_samples([sample1, sample2])

        patches_view = dataset.to_patches("ground_truth")
        patches_dataset = fop.make_patches_dataset(dataset, "ground_truth")

        self.assertNotEqual(
            patches_dataset._sample_collection_name,
            dataset._sample_collection_name,
        )
        self.assertIsNone(patches_dataset._frame_collection_name)
        self.assertTrue(patches_view._is_generated)
        self.assertFalse(patches_dataset._is_generated)
        self.assertEqual(
            len(patches_dataset), dataset.count("ground_truth.detections")
        )
        self.assertEqual(len(patches_dataset), len(patches_view))

    @drop_datasets
    def test_patches_save_context(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="image1.png",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            ),
        )

        sample2 = fo.Sample(filepath="image2.png")

        sample3 = fo.Sample(
            filepath="image3.png",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="squirrel"),
                ]
            ),
        )

        dataset.add_samples([sample1, sample2, sample3])

        view = dataset.to_patches("ground_truth")

        for sample in view.iter_samples(autosave=True):
            sample.ground_truth.foo = "bar"

        self.assertEqual(view.count("ground_truth.foo"), 4)
        self.assertEqual(dataset.count("ground_truth.detections.foo"), 4)

    @drop_datasets
    def test_to_patches_datetimes(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="image1.png",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                    fo.Detection(label="squirrel"),
                ]
            ),
        )

        sample2 = fo.Sample(filepath="image2.png")

        sample3 = fo.Sample(
            filepath="image2.png",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            ),
        )

        dataset.add_samples([sample1, sample2, sample3])

        field = dataset.get_field("ground_truth.detections.label")
        field.read_only = True
        field.save()

        patches = dataset.to_patches("ground_truth")

        field = patches.get_field("ground_truth.label")
        self.assertTrue(field.read_only)

        patch = patches.first()

        with self.assertRaises(ValueError):
            patch.created_at = datetime.utcnow()

        with self.assertRaises(ValueError):
            patch.last_modified_at = datetime.utcnow()

        patch.reload()

        patch.ground_truth.label = "dog"
        with self.assertRaises(ValueError):
            patch.save()

        patch.reload()

        # Patch.save()

        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")
        created_at1p = patches.values("created_at")
        last_modified_at1p = patches.values("last_modified_at")

        for patch in patches.iter_samples():
            patch.ground_truth.foo = "bar"
            patch.save()

        created_at2 = dataset.values("created_at")
        last_modified_at2 = dataset.values("last_modified_at")
        created_at2p = patches.values("created_at")
        last_modified_at2p = patches.values("last_modified_at")

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertListEqual(
            [
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1, last_modified_at2)
            ],
            [True, False, True],
        )
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1p, created_at2p))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1p, last_modified_at2p)
            )
        )

        # PatchView.save()

        view = patches.select_fields("ground_truth")

        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")
        created_at1p = view.values("created_at")
        last_modified_at1p = view.values("last_modified_at")

        for patch in view.iter_samples():
            patch.ground_truth.spam = "eggs"
            patch.save()

        created_at2 = dataset.values("created_at")
        last_modified_at2 = dataset.values("last_modified_at")
        created_at2p = view.values("created_at")
        last_modified_at2p = view.values("last_modified_at")

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertListEqual(
            [
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1, last_modified_at2)
            ],
            [True, False, True],
        )
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1p, created_at2p))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1p, last_modified_at2p)
            )
        )

        # PatchesView.set_values()

        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")
        created_at1p = patches.values("created_at")
        last_modified_at1p = patches.values("last_modified_at")

        patches.set_values("ground_truth.foo", ["baz"] * len(patches))

        created_at2 = dataset.values("created_at")
        last_modified_at2 = dataset.values("last_modified_at")
        created_at2p = patches.values("created_at")
        last_modified_at2p = patches.values("last_modified_at")

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertListEqual(
            [
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1, last_modified_at2)
            ],
            [True, False, True],
        )
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1p, created_at2p))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1p, last_modified_at2p)
            )
        )

        # PatchesView.save()

        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")
        created_at1p = patches.values("created_at")
        last_modified_at1p = patches.values("last_modified_at")

        patches.set_field("ground_truth.spam", ["eggz"] * len(patches)).save()

        created_at2 = dataset.values("created_at")
        last_modified_at2 = dataset.values("last_modified_at")
        created_at2p = patches.values("created_at")
        last_modified_at2p = patches.values("last_modified_at")

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertListEqual(
            [
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1, last_modified_at2)
            ],
            [True, False, True],
        )
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1p, created_at2p))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1p, last_modified_at2p)
            )
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
