"""
Unit tests for :class:`fiftyone.core.stages.SelectObjects` and
:class:`fiftyone.core.stages.ExcludeObjects`.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import unittest

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.zoo as foz


class SelectionTests(unittest.TestCase):
    def test_select_objects(self):
        num_samples_to_select = 5
        max_objects_per_sample_to_select = 3

        dataset = foz.load_zoo_dataset(
            "quickstart", dataset_name=fod.get_default_dataset_name(),
        )

        # Generate some random selections
        selected_objects = []
        for sample in dataset.take(num_samples_to_select):
            detections = sample.ground_truth.detections

            max_num_objects = min(
                len(detections), max_objects_per_sample_to_select
            )
            if max_num_objects >= 1:
                num_objects = random.randint(1, max_num_objects)
            else:
                num_objects = 0

            for detection in random.sample(detections, num_objects):
                selected_objects.append(
                    {
                        "sample_id": sample.id,
                        "field": "ground_truth",
                        "object_id": detection.id,
                    }
                )

        selected_view = dataset.select_objects(selected_objects)
        excluded_view = dataset.exclude_objects(selected_objects)

        total_objects = _count_detections(dataset, "ground_truth")
        num_selected_objects = len(selected_objects)
        num_objects_in_selected_view = _count_detections(
            selected_view, "ground_truth"
        )
        num_objects_in_excluded_view = _count_detections(
            excluded_view, "ground_truth"
        )
        num_objects_excluded = total_objects - num_objects_in_excluded_view

        self.assertEqual(num_selected_objects, num_objects_in_selected_view)
        self.assertEqual(num_selected_objects, num_objects_excluded)


def _count_detections(sample_collection, label_field):
    num_objects = 0
    for sample in sample_collection:
        num_objects += len(sample[label_field].detections)

    return num_objects


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
