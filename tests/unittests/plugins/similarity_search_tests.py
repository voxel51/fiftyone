"""
Similarity search panel operator tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import numpy as np

import fiftyone as fo
import fiftyone.brain as fob
import fiftyone.operators as foo
from fiftyone.core.view import DatasetView
from fiftyone.operators.executor import Executor


class SimilaritySearchOperatorTests(unittest.TestCase):
    def test_search_records_the_view_it_searched(self):
        dataset = fo.Dataset()
        self.addCleanup(dataset.delete)
        dataset.add_samples(
            [fo.Sample(filepath=f"image{i}.png") for i in range(4)]
        )
        fob.compute_similarity(
            dataset,
            embeddings=np.random.default_rng(0).random((4, 8)),
            backend="sklearn",
            brain_key="sim",
        )

        # With nothing narrowing it, the search targets the dataset itself
        run = _search(dataset)
        self.assertEqual(run["base_view"], [])
        self.assertEqual(run["result_count"], 2)

        # Leaves out the whole dataset's nearest match, so a search that
        # ignored the view would return a sample outside it
        query_id = dataset.first().id
        nearest = [i for i in run["result_ids"] if i != query_id][0]
        view = dataset.exclude(nearest)
        run = _search(dataset, view=view)
        self.assertEqual(
            run["base_view"], view._serialize(include_uuids=False)
        )
        self.assertEqual(run["result_count"], 2)
        self.assertTrue(
            set(run["result_ids"]).issubset(
                {str(sample_id) for sample_id in view.values("id")}
            )
        )

    def test_grouped_search_selects_groups_matched_in_any_slice(self):
        dataset, query_id, group_ids = _grouped_dataset()
        self.addCleanup(dataset.delete)

        run = _search(dataset, query=query_id)

        # The stage is kept, not stored IDs: it selects groups in the
        # active slice and records which slices matched
        result = DatasetView._build(dataset, run["result_view"])
        self.assertEqual(result.values("group.id"), group_ids[:2])
        self.assertEqual(result.values("group.name"), ["left", "left"])
        self.assertEqual(
            result._stages[-1].group_matches,
            {group_ids[0]: ["right"], group_ids[1]: ["left"]},
        )

    def test_grouped_search_honors_the_picked_slices(self):
        dataset, query_id, group_ids = _grouped_dataset()
        self.addCleanup(dataset.delete)

        run = _search(dataset, query=query_id, k=1, slices=["left"])

        result = DatasetView._build(dataset, run["result_view"])
        self.assertEqual(
            result._stages[-1].group_matches, {group_ids[1]: ["left"]}
        )


def _grouped_dataset():
    """Three groups of a left and a right image, all indexed. The query is
    group 0's right image; group 1's left image is its nearest neighbor, and
    everything else is far.

    Returns the dataset, the query sample's ID, and the group IDs in order.
    """
    dataset = fo.Dataset()
    dataset.add_group_field("group", default="left")
    for i in range(3):
        group = fo.Group()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath=f"{i}-{name}.png", group=group.element(name)
                )
                for name in ("left", "right")
            ]
        )

    group_ids = dataset.values("group.id")
    flat = dataset.select_group_slices()
    near = {(group_ids[0], "right"): 0.0, (group_ids[1], "left"): 1.0}
    keys = list(zip(*flat.values(["group.id", "group.name"])))
    fob.compute_similarity(
        flat,
        embeddings=np.array([[near.get(key, 100.0), 0.0] for key in keys]),
        backend="sklearn",
        metric="euclidean",
        brain_key="sim",
    )
    query_id = flat.values("id")[keys.index((group_ids[0], "right"))]
    return dataset, query_id, group_ids


def _search(dataset, view=None, query=None, k=2, slices=None):
    """Runs the search operator for the neighbors of `query`, by default the
    first sample, answering its run record."""
    # pylint: disable=import-outside-toplevel
    from plugins.panels.similarity_search.operators import (
        SimilaritySearchOperator,
    )
    from plugins.panels.similarity_search.run_manager import RunManager

    request_params = {
        "dataset_name": dataset.name,
        "params": {
            "brain_key": "sim",
            "query_type": "image",
            "query": query or dataset.first().id,
            "k": k,
        },
    }
    if slices is not None:
        request_params["params"]["slices"] = slices
    if view is not None:
        request_params["view"] = view._serialize()

    # An executor, as the App provides, to take the progress it reports
    ctx = foo.ExecutionContext(
        request_params=request_params,
        executor=Executor(),
        operator_uri="@voxel51/panels/similarity_search",
    )
    result = SimilaritySearchOperator().execute(ctx)
    return RunManager(ctx).get_run(result["run_id"])


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
