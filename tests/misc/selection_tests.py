"""
Unit tests for :class:`fiftyone.core.stages.SelectObjects` and
:class:`fiftyone.core.stages.ExcludeObjects`.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import unittest

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.zoo as foz


class SelectionTests(unittest.TestCase):
    def test_select_labels(self):
        num_samples_to_select = 5
        max_labels_per_sample_to_select = 3

        dataset = foz.load_zoo_dataset(
            "quickstart", dataset_name=fod.get_default_dataset_name(),
        )

        # Generate some random selections
        selected_labels = []
        for sample in dataset.take(num_samples_to_select):
            detections = sample.ground_truth.detections

            max_num_labels = min(
                len(detections), max_labels_per_sample_to_select
            )
            if max_num_labels >= 1:
                num_labels = random.randint(1, max_num_labels)
            else:
                num_labels = 0

            for detection in random.sample(detections, num_labels):
                selected_labels.append(
                    {
                        "sample_id": sample.id,
                        "field": "ground_truth",
                        "label_id": detection.id,
                    }
                )

        selected_view = dataset.select_labels(labels=selected_labels)
        excluded_view = dataset.exclude_labels(labels=selected_labels)

        num_labels = dataset.count("ground_truth.detections")
        num_selected_labels = len(selected_labels)
        num_labels_in_selected_view = selected_view.count(
            "ground_truth.detections"
        )
        num_labels_in_excluded_view = excluded_view.count(
            "ground_truth.detections"
        )
        num_labels_excluded = num_labels - num_labels_in_excluded_view

        self.assertEqual(num_selected_labels, num_labels_in_selected_view)
        self.assertEqual(num_selected_labels, num_labels_excluded)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
