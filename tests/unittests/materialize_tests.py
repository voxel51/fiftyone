"""
FiftyOne materialized view-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import importlib

from bson import ObjectId
import unittest
from unittest import mock

import fiftyone as fo
import fiftyone.core.materialize as fom
import fiftyone.core.stages as fos
from fiftyone import ViewField as F

from decorators import drop_datasets


class MaterializeTests(unittest.TestCase):
    @drop_datasets
    def test_materialize(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            tags=["test"],
            weather="sunny",
        )
        sample1.frames[1] = fo.Frame()
        sample1.frames[2] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            ),
        )
        sample1.frames[3] = fo.Frame()

        sample2 = fo.Sample(
            filepath="video2.mp4",
            tags=["test"],
            weather="cloudy",
        )
        sample2.frames[1] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            ),
        )
        sample2.frames[3] = fo.Frame()
        sample2.frames[5] = fo.Frame()

        sample3 = fo.Sample(
            filepath="video3.mp4",
            tags=["test"],
            weather="rainy",
        )

        dataset.add_samples([sample1, sample2, sample3])

        view = (
            dataset.limit(2)
            .match_frames(F("frame_number") <= 2, omit_empty=False)
            .materialize()
        )

        self.assertSetEqual(
            set(view.get_field_schema().keys()),
            {
                "id",
                "filepath",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "weather",
            },
        )

        self.assertSetEqual(
            set(view.get_frame_field_schema().keys()),
            {
                "id",
                "frame_number",
                "created_at",
                "last_modified_at",
                "ground_truth",
            },
        )

        self.assertEqual(
            view.get_field("metadata").document_type,
            fo.VideoMetadata,
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
            },
        )

        self.assertSetEqual(
            set(view.select_fields().get_frame_field_schema().keys()),
            {
                "id",
                "frame_number",
                "created_at",
                "last_modified_at",
            },
        )

        with self.assertRaises(ValueError):
            view.exclude_fields("tags")  # can't exclude default field

        with self.assertRaises(ValueError):
            view.exclude_fields(
                "frames.frame_number"
            )  # can't exclude default field

        index_info = view.get_index_information()
        indexes = view.list_indexes()
        default_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "frames.id",
            "frames._sample_id_1_frame_number_1",
            "frames.created_at",
            "frames.last_modified_at",
        }

        self.assertSetEqual(set(index_info.keys()), default_indexes)
        self.assertSetEqual(set(indexes), default_indexes)

        with self.assertRaises(ValueError):
            view.drop_index("id")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("filepath")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("frames.created_at")  # can't drop default index

        self.assertEqual(len(view), 2)
        self.assertEqual(view.count("frames"), 3)

        sample = view.first()
        self.assertIsInstance(sample.id, str)
        self.assertIsInstance(sample._id, ObjectId)

        for _id in view.values("id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_id"):
            self.assertIsInstance(oid, ObjectId)

        for _id in view.values("frames.id", unwind=True):
            self.assertIsInstance(_id, str)

        for oid in view.values("frames._id", unwind=True):
            self.assertIsInstance(oid, ObjectId)

        self.assertDictEqual(dataset.count_sample_tags(), {"test": 3})
        self.assertDictEqual(view.count_sample_tags(), {"test": 2})

        view.tag_samples("foo")

        self.assertEqual(view.count_sample_tags()["foo"], 2)
        self.assertEqual(dataset.count_sample_tags()["foo"], 2)

        view.untag_samples("foo")

        self.assertNotIn("foo", view.count_sample_tags())
        self.assertNotIn("foo", dataset.count_sample_tags())

        view.tag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {"test": 4})
        self.assertDictEqual(dataset.count_label_tags(), {"test": 4})

        view.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags(), {})

        view2 = view.limit(1).set_field(
            "frames.ground_truth.detections.label", F("label").upper()
        )

        self.assertDictEqual(
            view.count_values("frames.ground_truth.detections.label"),
            {"cat": 1, "dog": 2, "rabbit": 1},
        )
        self.assertDictEqual(
            view2.count_values("frames.ground_truth.detections.label"),
            {"CAT": 1, "DOG": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"cat": 1, "dog": 2, "rabbit": 1},
        )

        values = {
            _id: v
            for _id, v in zip(
                *view2.values(
                    [
                        "frames.ground_truth.detections.id",
                        "frames.ground_truth.detections.label",
                    ],
                    unwind=True,
                )
            )
        }
        view.set_label_values(
            "frames.ground_truth.detections.also_label", values
        )

        self.assertEqual(
            view.count("frames.ground_truth.detections.also_label"), 2
        )
        self.assertEqual(
            dataset.count("frames.ground_truth.detections.also_label"), 2
        )
        self.assertDictEqual(
            view.count_values("frames.ground_truth.detections.also_label"),
            dataset.count_values("frames.ground_truth.detections.also_label"),
        )

        view2.save()

        self.assertEqual(len(view), 2)
        self.assertEqual(dataset.values(F("frames").length()), [3, 3, 0])
        self.assertDictEqual(
            view.count_values("frames.ground_truth.detections.label"),
            {"CAT": 1, "DOG": 1, "dog": 1, "rabbit": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"CAT": 1, "DOG": 1, "dog": 1, "rabbit": 1},
        )

        view2.keep()
        view2.keep_frames()
        view.reload()

        self.assertEqual(len(view), 1)
        self.assertEqual(dataset.values(F("frames").length()), [2])
        self.assertDictEqual(
            view.count_values("frames.ground_truth.detections.label"),
            {"CAT": 1, "DOG": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"CAT": 1, "DOG": 1},
        )

        sample = view.exclude_fields("weather").first()

        sample["foo"] = "bar"
        sample.save()

        self.assertIn("foo", view.get_field_schema())
        self.assertIn("foo", dataset.get_field_schema())
        self.assertIn("weather", view.get_field_schema())
        self.assertIn("weather", dataset.get_field_schema())
        self.assertEqual(view.count_values("foo")["bar"], 1)
        self.assertEqual(dataset.count_values("foo")["bar"], 1)
        self.assertDictEqual(view.count_values("weather"), {"sunny": 1})
        self.assertDictEqual(dataset.count_values("weather"), {"sunny": 1})

        sample = view.exclude_fields("frames.ground_truth").first()
        frame = sample.frames.first()

        frame["spam"] = "eggs"
        sample.save()

        self.assertIn("spam", view.get_frame_field_schema())
        self.assertIn("spam", dataset.get_frame_field_schema())
        self.assertIn("ground_truth", view.get_frame_field_schema())
        self.assertIn("ground_truth", dataset.get_frame_field_schema())
        self.assertEqual(view.count_values("frames.spam")["eggs"], 1)
        self.assertEqual(dataset.count_values("frames.spam")["eggs"], 1)
        self.assertDictEqual(
            view.count_values("frames.ground_truth.detections.label"),
            {"CAT": 1, "DOG": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"CAT": 1, "DOG": 1},
        )

        dataset.untag_samples("test")
        view.reload()

        self.assertEqual(dataset.count_sample_tags(), {})
        self.assertEqual(view.count_sample_tags(), {})

        view.select_fields().keep_fields()

        self.assertNotIn("weather", view.get_field_schema())
        self.assertNotIn("weather", dataset.get_field_schema())
        self.assertNotIn("ground_truth", view.get_frame_field_schema())
        self.assertNotIn("ground_truth", dataset.get_frame_field_schema())

        sample_view = view.first()
        with self.assertRaises(KeyError):
            sample_view["weather"]

        frame_view = sample_view.frames.first()
        with self.assertRaises(KeyError):
            frame_view["ground_truth"]

        # Test saving a materialized view

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
    def test_materialize_save_context(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(filepath="frame11.jpg")
        sample1.frames[2] = fo.Frame(filepath="frame12.jpg")
        sample1.frames[3] = fo.Frame(filepath="frame13.jpg")

        sample2 = fo.Sample(filepath="video2.mp4")

        sample3 = fo.Sample(filepath="video3.mp4")
        sample3.frames[1] = fo.Frame(filepath="frame31.jpg")

        dataset.add_samples([sample1, sample2, sample3])

        view = (
            dataset.limit(2)
            .match_frames(F("frame_number") != 2, omit_empty=False)
            .materialize()
        )

        for sample in view.iter_samples(autosave=True):
            sample["foo"] = "bar"
            for frame in sample.frames.values():
                frame["foo"] = "bar"

        self.assertEqual(view.count("foo"), 2)
        self.assertEqual(dataset.count("foo"), 2)
        self.assertEqual(view.count("frames.foo"), 2)
        self.assertEqual(dataset.count("frames.foo"), 2)

    @drop_datasets
    def test_materialize_clone_indexes(self):
        sample = fo.Sample(
            filepath="video.mp4",
            metadata=fo.VideoMetadata(size_bytes=51),
        )
        sample.frames[1] = fo.Frame(
            field="foo",
            gt=fo.Detections(detections=[fo.Detection(label="cat")]),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dataset.create_index("metadata.size_bytes")
        dataset.create_index("frames.gt.detections.label")
        dataset.create_index(
            [("frames.gt.detections.id", 1), ("frames.field", 1)]
        )

        default_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "frames.id",
            "frames.created_at",
            "frames.last_modified_at",
            "frames._sample_id_1_frame_number_1",
        }

        # Materializing views does not include indexes by default
        view = dataset.limit(1).materialize()

        self.assertSetEqual(set(view.list_indexes()), default_indexes)

        view = dataset.limit(1).materialize(include_indexes=[])

        self.assertSetEqual(set(view.list_indexes()), default_indexes)

        view = dataset.limit(1).materialize(include_indexes=True)

        expected_indexes = default_indexes | {
            "metadata.size_bytes",
            "frames.gt.detections.label",
            "frames.gt.detections._id_1_field_1",
        }

        self.assertSetEqual(set(view.list_indexes()), expected_indexes)

        # Reloading preserves custom indexes
        view.reload()

        self.assertSetEqual(set(view.list_indexes()), expected_indexes)

        # Indexes can be included by prefix
        view = dataset.limit(1).materialize(
            include_indexes=["frames.gt.detections"]
        )
        expected_indexes = default_indexes | {
            "frames.gt.detections.label",
            "frames.gt.detections._id_1_field_1",
        }

        self.assertSetEqual(set(view.list_indexes()), expected_indexes)

        view = dataset.limit(1).materialize(
            include_indexes=["frames.gt.detections.label"]
        )
        expected_indexes = default_indexes | {"frames.gt.detections.label"}

        self.assertSetEqual(set(view.list_indexes()), expected_indexes)

        view = dataset.limit(1).materialize(
            include_indexes=["frames.gt.detections._id_1_field_1"]
        )
        expected_indexes = default_indexes | {
            "frames.gt.detections._id_1_field_1"
        }

        self.assertSetEqual(set(view.list_indexes()), expected_indexes)

        view = dataset.select_fields().materialize(include_indexes=True)
        expected_indexes = default_indexes | {"metadata.size_bytes"}

        self.assertSetEqual(set(view.list_indexes()), expected_indexes)

    @drop_datasets
    def test_materialize_delete_labels(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample2 = fo.Sample(
            filepath="video2.mp4",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ],
            ),
        )
        sample2.frames[1] = fo.Frame(filepath="frame1.jpg")
        sample2.frames[2] = fo.Frame(
            filepath="frame2.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ],
            ),
        )
        sample2.frames[3] = fo.Frame(filepath="frame3.jpg")

        dataset.add_samples([sample1, sample2])

        view = dataset.skip(1).materialize()
        sample = view.first()
        frame = sample.frames[2]

        labels = [
            {
                "label_id": sample.ground_truth.detections[0].id,
                "sample_id": sample.id,
                "field": "ground_truth",
            },
            {
                "label_id": frame.ground_truth.detections[0].id,
                "sample_id": sample.id,
                "frame_number": 2,
                "field": "frames.ground_truth",
            },
        ]

        view._delete_labels(labels)

        self.assertEqual(view.count("ground_truth.detections"), 2)
        self.assertEqual(view.count("frames.ground_truth.detections"), 2)
        self.assertEqual(dataset.count("ground_truth.detections"), 2)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 2)

    @drop_datasets
    @mock.patch(
        "fiftyone.core.materialize.materialize_view",
        wraps=fom.materialize_view,
    )
    def test_materialize_saved_view(self, materialize_view):
        importlib.reload(fos)  # force mock() to propagate

        dataset = fo.Dataset()

        sample = fo.Sample(
            filepath="image.png",
            ground_truth=fo.Detections(detections=[fo.Detection(label="cat")]),
        )

        dataset.add_sample(sample)

        view = dataset.select_fields("ground_truth").materialize().limit(1)

        self.assertFalse(view._dataset.persistent)

        # Backing datasets for saved views should be marked as persistent
        dataset.save_view("test", view)

        self.assertTrue(view._dataset.persistent)
        self.assertTrue(view.name, "test")
        self.assertEqual(materialize_view.call_count, 1)

        name = view._dataset.name
        view_doc1 = dataset._get_saved_view_doc("test")
        last_modified_at1 = view_doc1.last_modified_at

        sample.ground_truth.detections[0].label = "dog"
        sample.save()

        # Reloading saved view should cause backing dataset to be regenerated
        # and `last_modified_at` to be incremented
        view.reload()

        self.assertEqual(
            view.values("ground_truth.detections.label", unwind=True),
            ["dog"],
        )
        self.assertTrue(view._dataset.persistent)
        self.assertTrue(view.name, "test")
        self.assertEqual(materialize_view.call_count, 2)

        view_doc2 = dataset._get_saved_view_doc("test")
        view_doc2.reload()  # avoid microsecond issues
        last_modified_at2 = view_doc2.last_modified_at

        self.assertEqual(view._dataset.name, name)
        self.assertTrue(last_modified_at1 < last_modified_at2)

        # Loading a saved view without changes should not cause backing dataset
        # to be regenerated nor `last_modified_at` to be incremented
        also_view = dataset.load_saved_view("test")

        view_doc3 = dataset._get_saved_view_doc("test")
        last_modified_at3 = view_doc3.last_modified_at

        self.assertTrue(also_view.name, "test")
        self.assertTrue(also_view._dataset.name, name)
        self.assertEqual(last_modified_at2, last_modified_at3)
        self.assertEqual(materialize_view.call_count, 2)

        # Loading saved view should cause non-existent backing dataset to be
        # automatically regenerated
        also_view._dataset.delete()
        still_view = dataset.load_saved_view("test")

        view_doc4 = dataset._get_saved_view_doc("test")
        last_modified_at4 = view_doc4.last_modified_at

        self.assertEqual(still_view._dataset.name, name)
        self.assertTrue(still_view._dataset.persistent)
        self.assertEqual(last_modified_at2, last_modified_at4)
        self.assertEqual(materialize_view.call_count, 3)

        # Renaming dataset should not cause backing dataset to be regenerated
        dataset.name = fo.get_default_dataset_name()

        still_view = dataset.load_saved_view("test")

        self.assertEqual(materialize_view.call_count, 3)

        # Deleting view should cause backing dataset to become non-persistent
        dataset.delete_saved_view("test")

        self.assertTrue(fo.dataset_exists(name))
        self.assertFalse(still_view._dataset.persistent)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
