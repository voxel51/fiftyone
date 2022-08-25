"""
FiftyOne patches-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
import unittest

import fiftyone as fo
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
                "sample_id",
                "ground_truth",
            },
        )

        self.assertEqual(
            view.get_field("metadata").document_type,
            fo.ImageMetadata,
        )

        self.assertSetEqual(
            set(view.select_fields().get_field_schema().keys()),
            {"id", "filepath", "tags", "metadata", "sample_id"},
        )

        with self.assertRaises(ValueError):
            view.exclude_fields("sample_id")  # can't exclude default field

        index_info = view.get_index_information()
        indexes = view.list_indexes()

        default_indexes = {"id", "filepath", "sample_id"}
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
            {"id", "filepath", "metadata", "tags", "sample_id"},
        )

        with self.assertRaises(ValueError):
            view.exclude_fields("sample_id")  # can't exclude default field

        index_info = view.get_index_information()
        indexes = view.list_indexes()

        default_indexes = {"id", "filepath", "sample_id"}
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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
