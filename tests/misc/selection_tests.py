"""
Unit tests for :class:`fiftyone.core.stages.SelectObjects` and
:class:`fiftyone.core.stages.ExcludeObjects`.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import unittest

import fiftyone as fo


class SelectionTests(unittest.TestCase):
    def test_select_labels(self):
        num_samples_to_select = 5
        max_labels_per_sample_to_select = 3

        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(
                    filepath=f"{i}.png",
                    test=fo.Classifications(
                        classifications=[
                            fo.Classification(label=str(i)) for i in range(10)
                        ]
                    ),
                )
                for i in range(10)
            ]
        )

        # Generate some random selections
        selected_labels = []
        for sample in dataset.take(num_samples_to_select):
            test = sample.test.classifications
            max_num_labels = min(len(test), max_labels_per_sample_to_select)
            if max_num_labels >= 1:
                num_labels = random.randint(1, max_num_labels)
            else:
                num_labels = 0

            for label in random.sample(test, num_labels):
                selected_labels.append(
                    {
                        "sample_id": sample.id,
                        "field": "test",
                        "label_id": label.id,
                    }
                )

        selected_view = dataset.select_labels(labels=selected_labels)
        excluded_view = dataset.exclude_labels(labels=selected_labels)

        num_labels = dataset.count("test.classifications")
        num_selected_labels = len(selected_labels)
        num_labels_in_selected_view = selected_view.count(
            "test.classifications"
        )
        num_labels_in_excluded_view = excluded_view.count(
            "test.classifications"
        )
        num_labels_excluded = num_labels - num_labels_in_excluded_view

        self.assertEqual(num_selected_labels, num_labels_in_selected_view)
        self.assertEqual(num_selected_labels, num_labels_excluded)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
