"""
SortBySimilarity on grouped collections.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import numpy as np

import fiftyone as fo
import fiftyone.brain as fob
import fiftyone.core.stages as fos

from decorators import drop_datasets

QUERY = np.array([0.0, 0.0])


def _grouped_dataset(num_groups, near, slices=("left", "right")):
    """A grouped dataset of ``num_groups`` groups with one image per slice,
    indexed by a euclidean sklearn run ``"sim"`` over ``slices``.

    Every embedding is far from :data:`QUERY` except those named in ``near``,
    a ``{(group number, slice name): distance}`` dict.
    """
    dataset = fo.Dataset()
    dataset.add_group_field("group", default="left")
    for i in range(num_groups):
        group = fo.Group()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/tmp/%d-%s.jpg" % (i, name),
                    group=group.element(name),
                )
                for name in ("left", "right")
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


class SortBySimilarityGroupTests(unittest.TestCase):
    @drop_datasets
    def test_a_match_in_any_slice_selects_its_group_in_the_active_slice(self):
        dataset, group_ids = _grouped_dataset(
            4, {(0, "right"): 1.0, (3, "left"): 2.0}
        )

        view = dataset.sort_by_similarity(QUERY, k=2, brain_key="sim")

        self.assertEqual(view.values("group.id"), [group_ids[0], group_ids[3]])
        self.assertEqual(view.values("group.name"), ["left", "left"])
        self.assertEqual(
            view._stages[-1].group_matches,
            {group_ids[0]: ["right"], group_ids[3]: ["left"]},
        )

    @drop_datasets
    def test_records_every_matched_slice_of_a_group_best_first(self):
        dataset, group_ids = _grouped_dataset(
            3, {(1, "right"): 1.0, (1, "left"): 2.0}
        )

        view = dataset.sort_by_similarity(QUERY, k=2, brain_key="sim")

        self.assertEqual(view.values("group.id"), [group_ids[1]])
        self.assertEqual(
            view._stages[-1].group_matches, {group_ids[1]: ["right", "left"]}
        )

    @drop_datasets
    def test_group_slices_narrow_the_search(self):
        dataset, group_ids = _grouped_dataset(
            3, {(0, "right"): 1.0, (2, "left"): 2.0}
        )

        view = dataset.add_stage(
            fos.SortBySimilarity(
                QUERY, k=1, brain_key="sim", group_slices=["left"]
            )
        )

        self.assertEqual(
            view._stages[-1].group_matches, {group_ids[2]: ["left"]}
        )

    @drop_datasets
    def test_an_index_over_one_slice_matches_only_that_slice(self):
        dataset, group_ids = _grouped_dataset(
            3, {(1, "right"): 1.0}, slices=("right",)
        )

        view = dataset.sort_by_similarity(QUERY, k=1, brain_key="sim")

        self.assertEqual(view.values("group.id"), [group_ids[1]])
        self.assertEqual(
            view._stages[-1].group_matches, {group_ids[1]: ["right"]}
        )

    @drop_datasets
    def test_writes_distances_to_the_matched_samples(self):
        dataset, _ = _grouped_dataset(2, {(0, "right"): 1.0})

        dataset.sort_by_similarity(
            QUERY, k=1, brain_key="sim", dist_field="dist"
        )

        flat = dataset.select_group_slices()
        self.assertEqual(flat.exists("dist").values("group.name"), ["right"])
        self.assertEqual(flat.exists("dist").values("dist"), [1.0])

    @drop_datasets
    def test_a_rebuilt_view_reuses_the_recorded_matches(self):
        dataset, group_ids = _grouped_dataset(2, {(0, "right"): 1.0})
        view = dataset.sort_by_similarity(QUERY, k=1, brain_key="sim")
        stages = view._serialize()

        # Without the run, only the recorded state can answer
        dataset.delete_brain_run("sim")
        rebuilt = fo.DatasetView._build(dataset, stages)

        self.assertEqual(
            rebuilt._stages[-1].group_matches, {group_ids[0]: ["right"]}
        )
        self.assertEqual(rebuilt.values("group.id"), [group_ids[0]])


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
