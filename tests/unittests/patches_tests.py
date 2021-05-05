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
                    fo.Detection(label="cat", confidence=0.9),
                    fo.Detection(label="dog", confidence=0.8),
                    fo.Detection(label="rabbit", confidence=0.7),
                    fo.Detection(label="squirrel", confidence=0.6),
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
                    fo.Detection(label="cat", confidence=0.9),
                    fo.Detection(label="dog", confidence=0.8),
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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
