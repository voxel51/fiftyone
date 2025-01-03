"""
FiftyOne materialized view-related unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy

from bson import ObjectId
import unittest

import fiftyone as fo
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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
