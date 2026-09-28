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


def _search(dataset, view=None):
    """Runs the search operator for the first sample's neighbors, answering
    its run record."""
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
            "query": dataset.first().id,
            "k": 2,
        },
    }
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
