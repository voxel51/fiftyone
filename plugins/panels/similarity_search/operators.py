"""
Similarity search operators.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from datetime import datetime, timezone

import numpy as np

import fiftyone.operators as foo

from .constants import RunStatus
from .run_manager import RunManager

logger = logging.getLogger(__name__)


class SimilaritySearchOperator(foo.Operator):
    """Operator that executes a similarity search query.

    Supports both immediate execution (runs on the app server) and
    delegated execution (runs on a worker pod). The user chooses via
    the OperatorExecutionButton in the frontend.

    Flow:
    1. Creates or updates a run record in the execution store
    2. Calls sort_by_similarity() with the provided query
    3. Stores the sorted result IDs in the run record
    """

    @property
    def config(self):
        return foo.OperatorConfig(
            name="similarity_search",
            label="Similarity Search",
            unlisted=True,
            allow_immediate_execution=True,
            allow_delegated_execution=True,
        )

    def execute(self, ctx):
        manager = RunManager(ctx)
        run_id = ctx.params.get("run_id")

        if not run_id:
            # For delegated execution, InitSimilarityRunOperator already
            # created a run record linked by operator_run_id (the DO doc
            # ID). Look it up so we update the same record.
            do_id = ctx.request_params.get("run_doc")
            if do_id:
                existing = manager.find_run_by_operator_id(str(do_id))
                if existing:
                    run_id = existing["run_id"]

        # If still no run_id (immediate execution, or no matching
        # record found), create a new run record.
        if not run_id:
            run_id = manager.create_run(ctx.params)

        try:
            now = datetime.now(timezone.utc).isoformat()
            manager.update_run(
                run_id,
                {
                    "status": RunStatus.RUNNING,
                    "start_time": now,
                },
            )

            ctx.set_progress(0.1, label="Loading similarity index...")

            brain_key = ctx.params["brain_key"]
            query = ctx.params["query"]
            k = ctx.params.get("k")
            reverse = ctx.params.get("reverse", False)
            dist_field = ctx.params.get("dist_field")
            patches_field = ctx.params.get("patches_field")

            dataset = ctx.dataset

            # Reconstruct the source view if provided
            source_view = ctx.params.get("source_view")
            if source_view:
                from fiftyone.core.view import DatasetView

                view = DatasetView._build(dataset, source_view)
            else:
                view = dataset.view()

            ctx.set_progress(0.2, label="Preparing query...")

            # Handle negative query IDs (alt-selected samples)
            negative_query_ids = ctx.params.get("negative_query_ids")
            if negative_query_ids and isinstance(query, list):
                # Vector arithmetic: mean(positive) - mean(negative)
                query = self._compute_combined_query(
                    dataset, brain_key, query, negative_query_ids
                )

            ctx.set_progress(0.3, label="Running similarity query...")

            # Build kwargs, omitting None values
            kwargs = dict(brain_key=brain_key)
            if k is not None:
                kwargs["k"] = k
            if reverse:
                kwargs["reverse"] = reverse
            if dist_field:
                kwargs["dist_field"] = dist_field

            result_view = view.sort_by_similarity(query, **kwargs)

            ctx.set_progress(0.7, label="Collecting results...")

            result_ids = [str(rid) for rid in result_view.values("id")]

            ctx.set_progress(0.9, label="Saving results...")

            manager.update_run(
                run_id,
                {
                    "status": RunStatus.COMPLETED,
                    "result_ids": result_ids,
                    "result_count": len(result_ids),
                    "end_time": datetime.now(timezone.utc).isoformat(),
                },
            )

            ctx.set_progress(1.0, label="Done")

            return {"run_id": run_id}

        except Exception as e:
            logger.error(
                "Similarity search failed for run %s: %s",
                run_id,
                str(e),
                exc_info=True,
            )
            manager.update_run(
                run_id,
                {
                    "status": RunStatus.FAILED,
                    "status_details": str(e),
                    "end_time": datetime.now(timezone.utc).isoformat(),
                },
            )
            raise

    @staticmethod
    def _compute_combined_query(
        dataset, brain_key, positive_ids, negative_ids
    ):
        """Compute a combined query vector from positive and negative samples.

        Uses vector arithmetic: mean(positive_embeddings) - mean(negative_embeddings)

        Args:
            dataset: the dataset
            brain_key: the brain key for the similarity index
            positive_ids: list of positive sample IDs
            negative_ids: list of negative sample IDs

        Returns:
            numpy array representing the combined query vector
        """
        results = dataset.load_brain_results(brain_key)

        embeddings, ids, _ = results.get_embeddings(
            sample_ids=positive_ids, allow_missing=True
        )
        pos_embeddings = [np.asarray(e) for e in embeddings]

        neg_embeddings = []
        if negative_ids:
            embeddings, ids, _ = results.get_embeddings(
                sample_ids=negative_ids, allow_missing=True
            )
            neg_embeddings = [np.asarray(e) for e in embeddings]

        if not len(pos_embeddings):
            raise ValueError("No embeddings found for positive samples")

        pos_mean = np.mean(pos_embeddings, axis=0)

        if neg_embeddings:
            neg_mean = np.mean(neg_embeddings, axis=0)
            return pos_mean - neg_mean
        else:
            return pos_mean


class InitSimilarityRunOperator(foo.Operator):
    """Creates a run record for a delegated similarity search.

    Called by the frontend after a delegated operation is queued, so
    the run appears in the panel's list immediately while the DO is
    pending/running on a worker.
    """

    @property
    def config(self):
        return foo.OperatorConfig(
            name="init_similarity_run",
            label="Initialize Similarity Run",
            unlisted=True,
        )

    def execute(self, ctx):
        manager = RunManager(ctx)
        run_id = manager.create_run(ctx.params)

        # Link the delegated operation to the run
        operator_run_id = ctx.params.get("operator_run_id")
        if operator_run_id:
            manager.update_run(run_id, {"operator_run_id": operator_run_id})

        return {"run_id": run_id}


class ListSimilarityRunsOperator(foo.Operator):
    """Returns all similarity search runs for the current dataset."""

    @property
    def config(self):
        return foo.OperatorConfig(
            name="list_similarity_runs",
            label="List Similarity Runs",
            unlisted=True,
        )

    def execute(self, ctx):
        manager = RunManager(ctx)
        return {"runs": manager.list_runs()}
