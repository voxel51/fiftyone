"""
SortBySimilarity on grouped collections.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np

import fiftyone as fo
import fiftyone.brain as fob
import fiftyone.core.stages as fos

QUERY = np.array([0.0, 0.0])


def _grouped_dataset(make_dataset, num_groups, near, slices=("left", "right")):
    """A grouped dataset of ``num_groups`` groups with one image per slice,
    indexed by a euclidean sklearn run ``"sim"`` over ``slices``.

    Every embedding is far from :data:`QUERY` except those named in ``near``,
    a ``{(group number, slice name): distance}`` dict.
    """
    dataset = make_dataset(
        groups=[
            {name: "/tmp/%d-%s.jpg" % (i, name) for name in ("left", "right")}
            for i in range(num_groups)
        ]
    )

    group_ids = dataset.values("group.id")
    number = {group_id: i for i, group_id in enumerate(group_ids)}
    indexed = dataset.select_group_slices(list(slices))
    keys = zip(*indexed.values(["group.id", "group.name"]))
    embeddings = np.array(
        [
            [near.get((number[group_id], name), 100.0), 0.0]
            for group_id, name in keys
        ]
    )
    fob.compute_similarity(
        indexed,
        embeddings=embeddings,
        brain_key="sim",
        backend="sklearn",
        metric="euclidean",
    )
    return dataset, group_ids


def test_a_match_in_any_slice_selects_its_group_in_the_active_slice(
    fixture_dataset,
):
    dataset, group_ids = _grouped_dataset(
        fixture_dataset, 4, {(0, "right"): 1.0, (3, "left"): 2.0}
    )

    view = dataset.sort_by_similarity(QUERY, k=2, brain_key="sim")

    assert view.values("group.id") == [group_ids[0], group_ids[3]]
    assert view.values("group.name") == ["left", "left"]
    assert view._stages[-1].group_matches == {
        group_ids[0]: ["right"],
        group_ids[3]: ["left"],
    }


def test_records_every_matched_slice_of_a_group_best_first(fixture_dataset):
    dataset, group_ids = _grouped_dataset(
        fixture_dataset, 3, {(1, "right"): 1.0, (1, "left"): 2.0}
    )

    view = dataset.sort_by_similarity(QUERY, k=2, brain_key="sim")

    assert view.values("group.id") == [group_ids[1]]
    assert view._stages[-1].group_matches == {group_ids[1]: ["right", "left"]}


def test_group_slices_narrow_the_search(fixture_dataset):
    dataset, group_ids = _grouped_dataset(
        fixture_dataset, 3, {(0, "right"): 1.0, (2, "left"): 2.0}
    )

    view = dataset.add_stage(
        fos.SortBySimilarity(
            QUERY, k=1, brain_key="sim", group_slices=["left"]
        )
    )

    assert view._stages[-1].group_matches == {group_ids[2]: ["left"]}


def test_an_index_over_one_slice_matches_only_that_slice(fixture_dataset):
    dataset, group_ids = _grouped_dataset(
        fixture_dataset, 3, {(1, "right"): 1.0}, slices=("right",)
    )

    view = dataset.sort_by_similarity(QUERY, k=1, brain_key="sim")

    assert view.values("group.id") == [group_ids[1]]
    assert view._stages[-1].group_matches == {group_ids[1]: ["right"]}


def test_writes_distances_to_the_matched_samples(fixture_dataset):
    dataset, _ = _grouped_dataset(fixture_dataset, 2, {(0, "right"): 1.0})

    dataset.sort_by_similarity(QUERY, k=1, brain_key="sim", dist_field="dist")

    flat = dataset.select_group_slices()
    assert flat.exists("dist").values("group.name") == ["right"]
    assert flat.exists("dist").values("dist") == [1.0]


def test_a_rebuilt_view_reuses_the_recorded_matches(fixture_dataset):
    dataset, group_ids = _grouped_dataset(
        fixture_dataset, 2, {(0, "right"): 1.0}
    )
    view = dataset.sort_by_similarity(QUERY, k=1, brain_key="sim")
    stages = view._serialize()

    # Without the run, only the recorded state can answer
    dataset.delete_brain_run("sim")
    rebuilt = fo.DatasetView._build(dataset, stages)

    assert rebuilt._stages[-1].group_matches == {group_ids[0]: ["right"]}
    assert rebuilt.values("group.id") == [group_ids[0]]
