"""
Tests for the group slices that a similarity index records in its run's
``results_meta``.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest.mock import PropertyMock, patch

import numpy as np

import fiftyone.brain as fob


def _grouped_dataset(make_dataset):
    """Two groups, each with a left image, a right image and a point cloud."""
    return make_dataset(
        groups=[
            {
                "left": "/tmp/%d.jpg" % i,
                "right": "/tmp/%d-r.jpg" % i,
                "pcd": "/tmp/%d.pcd" % i,
            }
            for i in range(2)
        ]
    )


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


def test_records_the_slices_the_index_holds_samples_from(fixture_dataset):
    dataset = _grouped_dataset(fixture_dataset)
    results = _index(dataset.select_group_slices(_allow_mixed=True))

    pcd_ids = dataset.select_group_slices("pcd").values("id")
    results.remove_from_index(sample_ids=pcd_ids)
    results.save()

    assert _results_meta(dataset)["group_slices"] == ["left", "right"]


def test_without_sample_ids_the_embeddings_field_marks_the_samples(
    fixture_dataset,
):
    dataset = _grouped_dataset(fixture_dataset)
    results = _index(
        dataset.select_group_slices("right"), embeddings_field="emb"
    )

    with patch.object(
        type(results), "sample_ids", new_callable=PropertyMock
    ) as sample_ids:
        sample_ids.return_value = None
        results.save()

    assert _results_meta(dataset)["group_slices"] == ["right"]


def test_an_index_that_cannot_list_its_samples_covers_every_slice(
    fixture_dataset,
):
    dataset = _grouped_dataset(fixture_dataset)
    results = _index(dataset.select_group_slices("right"))

    with patch.object(
        type(results), "sample_ids", new_callable=PropertyMock
    ) as sample_ids:
        sample_ids.return_value = None
        results.save()

    assert _results_meta(dataset)["group_slices"] == ["left", "right", "pcd"]


def test_a_dataset_without_groups_records_no_slices(fixture_dataset):
    dataset = fixture_dataset(filepaths=["/tmp/a.jpg"])
    _index(dataset)

    assert "group_slices" not in _results_meta(dataset)
