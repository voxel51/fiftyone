"""
FiftyOne patches-related unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
from fiftyone import ViewField as F

from decorators import drop_datasets


class PatchesTests(unittest.TestCase):
    @drop_datasets
    def test_object_patches(self):
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
            {"filepath", "tags", "metadata", "sample_id", "ground_truth"},
        )

        self.assertEqual(dataset.count("ground_truth.detections"), 6)
        self.assertEqual(view.count(), 6)
        self.assertEqual(len(view), 6)

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

        view.untag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags("ground_truth"), {})
        self.assertDictEqual(dataset.count_label_tags("predictions"), {})

        view2 = view.skip(4).set_field(
            "ground_truth.label", F("label").upper()
        )

        self.assertEqual(view.count(), 6)
        self.assertEqual(view2.count(), 2)
        self.assertEqual(dataset.count("ground_truth.detections"), 6)
        self.assertNotIn("cat", view2.count_values("ground_truth.label"))
        self.assertEqual(view2.count_values("ground_truth.label")["CAT"], 1)
        self.assertEqual(view.count_values("ground_truth.label")["cat"], 2)
        self.assertEqual(
            dataset.count_values("ground_truth.detections.label")["cat"], 2
        )
        self.assertNotIn(
            "CAT", dataset.count_values("ground_truth.detections.label")
        )

        view2.save()

        self.assertEqual(view.count(), 2)
        self.assertEqual(dataset.count("ground_truth.detections"), 2)
        self.assertNotIn("cat", view.count_values("ground_truth.label"))
        self.assertEqual(view.count_values("ground_truth.label")["CAT"], 1)
        self.assertNotIn(
            "cat", dataset.count_values("ground_truth.detections.label")
        )
        self.assertEqual(
            dataset.count_values("ground_truth.detections.label")["CAT"], 1
        )

        sample = view.first()

        sample.ground_truth.hello = "world"
        sample.save()

        self.assertEqual(view.count_values("ground_truth.hello")["world"], 1)
        self.assertEqual(
            dataset.count_values("ground_truth.detections.hello")["world"], 1
        )

        dataset.untag_samples("sample1")
        view.reload()

        self.assertDictEqual(dataset.count_sample_tags(), {"sample2": 1})
        self.assertDictEqual(view.count_sample_tags(), {"sample2": 2})

    @drop_datasets
    def test_eval_patches(self):
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

        dataset.evaluate_detections("predictions", eval_key="eval")

        view = dataset.to_evaluation_patches("eval")

        self.assertSetEqual(
            set(view.get_field_schema().keys()),
            {
                "filepath",
                "metadata",
                "tags",
                "ground_truth",
                "predictions",
                "type",
                "iou",
                "crowd",
                "sample_id",
            },
        )

        self.assertEqual(dataset.count("ground_truth.detections"), 3)
        self.assertEqual(dataset.count("predictions.detections"), 4)

        self.assertEqual(view.count(), 4)
        self.assertEqual(len(view), 4)

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

        view.untag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags("ground_truth"), {})
        self.assertDictEqual(dataset.count_label_tags("predictions"), {})

        view2 = view.match(F("crowd") == True).set_field(
            "ground_truth.detections.label", F("label").upper()
        )

        self.assertEqual(view.count(), 4)
        self.assertEqual(view2.count(), 1)
        self.assertEqual(dataset.count("ground_truth.detections"), 3)
        self.assertEqual(dataset.count("predictions.detections"), 4)
        self.assertDictEqual(
            view2.count_values("ground_truth.detections.label"), {"CAT": 1}
        )
        self.assertDictEqual(
            view.count_values("ground_truth.detections.label"),
            {"dog": 1, "cat": 1, "rabbit": 1},
        )
        self.assertDictEqual(
            dataset.count_values("ground_truth.detections.label"),
            {"dog": 1, "cat": 1, "rabbit": 1},
        )

        view2.save()

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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
