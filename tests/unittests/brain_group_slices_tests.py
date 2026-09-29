"""
Tests for the group slices that a similarity index records in its run's
``results_meta``.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest.mock import PropertyMock, patch

import numpy as np

import fiftyone as fo
import fiftyone.brain as fob

from decorators import drop_datasets


def _grouped_dataset():
    """Two groups, each with a left image, a right image and a point cloud."""
    dataset = fo.Dataset()
    dataset.add_group_field("group", default="left")
    for i in range(2):
        group = fo.Group()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/tmp/%d.jpg" % i, group=group.element("left")
                ),
                fo.Sample(
                    filepath="/tmp/%d-r.jpg" % i, group=group.element("right")
                ),
                fo.Sample(
                    filepath="/tmp/%d.pcd" % i, group=group.element("pcd")
                ),
            ]
        )
    return dataset


def _index(samples, **kwargs):
    return fob.compute_similarity(
        samples,
        embeddings=np.random.default_rng(0).random((len(samples), 4)),
        brain_key="sim",
        backend="sklearn",
        **kwargs,
    )


def _results_meta(dataset):
    dataset.reload()
    return dataset._doc.brain_methods["sim"].results_meta


class BrainGroupSlicesTests(unittest.TestCase):
    @drop_datasets
    def test_records_the_slices_the_index_holds_samples_from(self):
        dataset = _grouped_dataset()
        results = _index(dataset.select_group_slices(_allow_mixed=True))

        pcd_ids = dataset.select_group_slices("pcd").values("id")
        results.remove_from_index(sample_ids=pcd_ids)
        results.save()

        self.assertEqual(
            _results_meta(dataset)["group_slices"], ["left", "right"]
        )

    @drop_datasets
    def test_without_sample_ids_the_embeddings_field_marks_the_samples(self):
        dataset = _grouped_dataset()
        results = _index(
            dataset.select_group_slices("right"), embeddings_field="emb"
        )

        with patch.object(
            type(results), "sample_ids", new_callable=PropertyMock
        ) as sample_ids:
            sample_ids.return_value = None
            results.save()

        self.assertEqual(_results_meta(dataset)["group_slices"], ["right"])

    @drop_datasets
    def test_an_index_that_cannot_list_its_samples_covers_every_slice(self):
        dataset = _grouped_dataset()
        results = _index(dataset.select_group_slices("right"))

        with patch.object(
            type(results), "sample_ids", new_callable=PropertyMock
        ) as sample_ids:
            sample_ids.return_value = None
            results.save()

        self.assertEqual(
            _results_meta(dataset)["group_slices"], ["left", "right", "pcd"]
        )

    @drop_datasets
    def test_a_dataset_without_groups_records_no_slices(self):
        dataset = fo.Dataset()
        dataset.add_samples([fo.Sample(filepath="/tmp/a.jpg")])
        _index(dataset)

        self.assertNotIn("group_slices", _results_meta(dataset))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
