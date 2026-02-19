"""
Similarity search operators.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from datetime import datetime, timezone

import fiftyone.operators as foo

from .constants import RunStatus
from .run_manager import RunManager

logger = logging.getLogger(__name__)


class InitSimilarityRunOperator(foo.Operator):
    """Creates a similarity search run record in the execution store.

    This operator runs immediately and returns the run_id so the frontend
    can show the run in the list right away. The frontend then triggers
    the delegated search operator separately.
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
        return {"run_id": run_id}


class SimilaritySearchOperator(foo.Operator):
    """Delegated operator that executes a similarity search query.

    This operator always runs as a delegated operation on a worker. It:
    1. Loads the similarity index for the specified brain key
    2. Executes sort_by_similarity() with the provided query
    3. Stores the sorted result IDs in the run record
    """

    @property
    def config(self):
        return foo.OperatorConfig(
            name="similarity_search",
            label="Similarity Search",
            unlisted=True,
            allow_immediate_execution=False,
            allow_delegated_execution=True,
        )

    def resolve_delegation(self, ctx):
        return True

    def execute(self, ctx):
        run_id = ctx.params["run_id"]
        manager = RunManager(ctx)

        try:
            now = datetime.now(timezone.utc).isoformat()
            manager.update_run(
                run_id,
                {
                    "status": RunStatus.RUNNING,
                    "start_time": now,
                    "operator_run_id": str(
                        getattr(ctx, "_delegated_operation_id", None)
                    ),
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
