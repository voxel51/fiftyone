"""
FiftyOne Server /similarity-index-slices route tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.brain as fob
from fiftyone.server.routes.similarity_index_slices import _index_slices

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
    fob.compute_similarity(
        samples,
        embeddings=np.random.default_rng(0).random((len(samples), 4)),
        brain_key="sim",
        backend="sklearn",
        **kwargs,
    )


class SimilarityIndexSlicesTests(unittest.TestCase):
    @drop_datasets
    def test_names_the_slices_the_index_has_samples_in(self):
        dataset = _grouped_dataset()
        _index(dataset.select_group_slices(media_type="image"))

        self.assertEqual(_index_slices(dataset.name, "sim"), ["left", "right"])

    @drop_datasets
    def test_reads_the_embeddings_field_without_loading_the_index(self):
        dataset = _grouped_dataset()
        _index(dataset.select_group_slices("right"), embeddings_field="emb")

        with patch.object(
            fo.Dataset, "load_brain_results", side_effect=AssertionError
        ):
            self.assertEqual(_index_slices(dataset.name, "sim"), ["right"])

    @drop_datasets
    def test_an_index_that_cannot_list_its_samples_covers_every_slice(self):
        dataset = _grouped_dataset()
        _index(dataset.select_group_slices("right"))

        with patch.object(
            fo.Dataset,
            "load_brain_results",
            return_value=SimpleNamespace(sample_ids=None),
        ):
            self.assertEqual(
                _index_slices(dataset.name, "sim"), ["left", "right", "pcd"]
            )

    @drop_datasets
    def test_a_dataset_without_groups_has_no_slices(self):
        dataset = fo.Dataset()
        dataset.add_samples([fo.Sample(filepath="/tmp/a.jpg")])
        _index(dataset)

        self.assertEqual(_index_slices(dataset.name, "sim"), [])

    @drop_datasets
    def test_an_unknown_brain_key_is_a_bad_request(self):
        dataset = _grouped_dataset()

        with self.assertRaises(HTTPException) as raised:
            _index_slices(dataset.name, "missing")

        self.assertEqual(raised.exception.status_code, 400)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
