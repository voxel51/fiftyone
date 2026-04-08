"""
Similarity search operators.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import base64
import logging
from datetime import datetime, timezone

import numpy as np

import fiftyone.operators as foo

from .constants import STORE_NAME, RunStatus
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
        run_data = None

        if not run_id:
            # For delegated execution, InitSimilarityRunOperator already
            # created a run record linked by operator_run_id (the DO doc
            # ID). Look it up so we update the same record.
            do_id = ctx.request_params.get("run_doc")
            if do_id:
                run_data = manager.find_run_by_operator_id(str(do_id))
                if run_data:
                    run_id = run_data["run_id"]

        # If still no run_id (immediate execution, or no matching
        # record found), create a new run record.
        if not run_id:
            params = {**ctx.params}
            if ctx.user_id:
                params["created_by"] = str(ctx.user_id)
            run_data = manager.create_run(params)
            run_id = run_data["run_id"]

        # If we found an existing run_id but didn't load run_data yet
        if not run_data:
            run_data = manager.get_run(run_id)

        # Stale/missing run; recover with a fresh record
        if not run_data:
            params = {**ctx.params}
            if ctx.user_id:
                params["created_by"] = str(ctx.user_id)
            run_data = manager.create_run(params)
            run_id = run_data["run_id"]

        try:
            run_data["status"] = RunStatus.RUNNING
            run_data["start_time"] = datetime.now(timezone.utc).isoformat()
            manager.set_run(run_id, run_data)

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

            # Handle uploaded image: embed on-the-fly
            query_type = ctx.params.get("query_type")
            if query_type == "upload":
                query = self._embed_query_image(ctx)

            # Handle negative query IDs (alt-selected samples)
            negative_query_ids = ctx.params.get("negative_query_ids")
            if negative_query_ids and isinstance(query, list):
                # Weighted vector arithmetic: 2 * mean(positive) - mean(negative)
                query = self._compute_combined_query(
                    dataset,
                    brain_key,
                    query,
                    negative_query_ids,
                    patches_field=patches_field,
                )

            ctx.set_progress(0.3, label="Running similarity query...")

            # Build kwargs, omitting None values
            kwargs = {"brain_key": brain_key}
            if k is not None:
                kwargs["k"] = k
            if reverse:
                kwargs["reverse"] = reverse
            if dist_field:
                kwargs["dist_field"] = dist_field

            result_view = view.sort_by_similarity(query, **kwargs)

            ctx.set_progress(0.7, label="Collecting results...")

            dynamic_results = ctx.params.get("dynamic_results", False)

            if dynamic_results:
                result_view_stages = result_view._serialize(
                    include_uuids=False
                )
                result_count = len(result_view)
            else:
                result_ids = [str(rid) for rid in result_view.values("id")]
                result_view_stages = None
                result_count = len(result_ids)

            ctx.set_progress(0.9, label="Saving results...")

            run_data["status"] = RunStatus.COMPLETED
            run_data["result_ids"] = result_ids if not dynamic_results else []
            run_data["result_view"] = result_view_stages
            run_data["result_count"] = result_count
            run_data["end_time"] = datetime.now(timezone.utc).isoformat()
            manager.set_run(run_id, run_data)

            ctx.set_progress(1.0, label="Done")

            return {"run_id": run_id}

        except Exception as e:
            logger.error(
                "Similarity search failed for run %s: %s",
                run_id,
                str(e),
                exc_info=True,
            )
            if run_data:
                run_data["status"] = RunStatus.FAILED
                run_data["status_details"] = str(e)
                run_data["end_time"] = datetime.now(timezone.utc).isoformat()
                manager.set_run(run_id, run_data)
            raise

    @staticmethod
    def _compute_combined_query(
        dataset,
        brain_key,
        positive_ids,
        negative_ids,
        patches_field=None,
    ):
        """Compute a combined query vector from positive and negative samples.

        Uses weighted vector arithmetic:
        2 * mean(positive_embeddings) - mean(negative_embeddings)

        The 2x weight on positives ensures the query stays anchored in
        the positive direction while gently steering away from negatives
        (Qdrant-style recommendation formula).

        Args:
            dataset: the dataset
            brain_key: the brain key for the similarity index
            positive_ids: list of positive sample/label IDs
            negative_ids: list of negative sample/label IDs
            patches_field: if set, IDs are label IDs (patch IDs)

        Returns:
            numpy array representing the combined query vector
        """
        results = dataset.load_brain_results(brain_key)

        # For patch-backed indices, IDs are label IDs not sample IDs
        id_key = "label_ids" if patches_field else "sample_ids"

        embeddings, _, _ = results.get_embeddings(
            **{id_key: positive_ids}, allow_missing=True
        )
        pos_embeddings = [np.asarray(e) for e in embeddings]

        neg_embeddings = []
        if negative_ids:
            embeddings, _, _ = results.get_embeddings(
                **{id_key: negative_ids}, allow_missing=True
            )
            neg_embeddings = [np.asarray(e) for e in embeddings]

        if not pos_embeddings:
            raise ValueError("No embeddings found for positive samples")

        pos_mean = np.mean(pos_embeddings, axis=0)

        # Qdrant-style: query = avg(pos) + (avg(pos) - avg(neg))
        #                    = 2 * avg(pos) - avg(neg)
        if neg_embeddings:
            neg_mean = np.mean(neg_embeddings, axis=0)
            combined = 2 * pos_mean - neg_mean
        else:
            combined = pos_mean

        # Normalize for backend-agnostic correctness (cosine doesn't
        # need it, but dot-product and L2 backends do)
        norm = np.linalg.norm(combined)
        if norm > 0:
            combined = combined / norm

        return combined

    @staticmethod
    def _embed_query_image(ctx):
        """Embed an uploaded query image on-the-fly using the index model.

        Requires the brain key's config to have a zoo model name. Decodes
        the base64 image content, loads the model, and returns the
        embedding vector.

        Args:
            ctx: the execution context with params["brain_key"] and
                params["query_image"] = {content: base64, name: str}

        Returns:
            numpy array representing the query embedding
        """
        import eta.core.image as etai
        import fiftyone.zoo.models as fozm

        brain_key = ctx.params["brain_key"]
        info = ctx.dataset.get_brain_info(brain_key)
        model = fozm.load_zoo_model(info.config.model)

        query_image = ctx.params["query_image"]
        img_bytes = base64.b64decode(query_image["content"])
        img = etai.decode(img_bytes)

        return model.embed(img)


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
        params = {**ctx.params}
        if ctx.user_id:
            params["created_by"] = str(ctx.user_id)
        run_data = manager.create_run(params)
        run_id = run_data["run_id"]

        # Link the delegated operation to the run
        operator_run_id = ctx.params.get("operator_run_id")
        if operator_run_id:
            manager.set_operator_run_id(run_id, operator_run_id)

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


class SimilaritySearchSubscriptionOperator(foo.SseOperator):
    """Operator that provides SSE notifications for execution store changes."""

    @property
    def subscription_config(self):
        return foo.SseOperatorConfig(
            name="get_similarity_search_subscription_notifier",
            label="Similarity Search Subscription Notifications",
            store_name=STORE_NAME,
        )
