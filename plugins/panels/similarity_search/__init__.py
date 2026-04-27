"""
Similarity search panel.

This panel provides a non-blocking interface for running similarity searches
against pre-computed embeddings. Queries run as delegated operations and
results are stored as persistent runs that users can browse, apply, clone,
and iterate on.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import fiftyone.operators.types as types
from fiftyone.operators.categories import Categories
from fiftyone.operators.panel import Panel, PanelConfig

from .constants import STORE_NAME, RunStatus
from .run_manager import RunManager
from fiftyone.core.brain import BrainMethod

logger = logging.getLogger(__name__)

# Persisted identifier fields per similarity backend. These are names of
# remote collections/indexes/tables the user has configured — safe to
# surface to users so they can recognize which remote resource this run
# is backed by. Not all backends have identifiers (e.g. sklearn).
_IDENTIFIER_FIELDS_BY_BACKEND = {
    "qdrant": [("collection_name", "Collection")],
    "milvus": [("collection_name", "Collection")],
    "pinecone": [
        ("index_name", "Index"),
        ("namespace", "Namespace"),
    ],
    "mosaic": [("index_name", "Index")],
    "mongodb": [("index_name", "Index")],
    "elasticsearch": [("index_name", "Index")],
    "redis": [("index_name", "Index")],
    "pgvector": [
        ("index_name", "Index"),
        ("table_name", "Table"),
    ],
    "lancedb": [("table_name", "Table")],
}


def _extract_identifiers(config, backend):
    """Return a list of ``{"label", "value"}`` dicts for the backend's
    persisted identifier fields. Returns an empty list if the backend is
    unknown, or if the config doesn't expose any of the expected fields.
    """
    if not backend or config is None:
        return []
    spec = _IDENTIFIER_FIELDS_BY_BACKEND.get(backend.lower())
    if not spec:
        return []

    identifiers = []
    for field, label in spec:
        try:
            value = getattr(config, field, None)
        except Exception:
            value = None
        if value is None:
            continue
        value_str = str(value).strip()
        if not value_str:
            continue
        identifiers.append({"label": label, "value": value_str})
    return identifiers


def _has_manage_permission(ctx):
    """Returns whether the current user has manage permissions."""
    if ctx.user is None:
        return True
    return getattr(ctx.user, "dataset_permission", None) == "MANAGE"


class SimilaritySearchPanel(Panel):
    """Panel for running and managing similarity search queries."""

    @property
    def config(self):
        return PanelConfig(
            name=STORE_NAME,
            label="Similarity Search",
            icon="image_search",
            category=Categories.CURATE,
        )

    # -- Lifecycle --

    def _current_user_id(self, ctx):
        """The current user's id — source of truth for ownership
        checks. None in OSS.
        """
        return str(ctx.user_id) if ctx.user_id else None

    def _current_user_name(self, ctx):
        """The current user's display name — used for UI. Falls back to
        the user id string so the UI always has something to show.
        """
        if not ctx.user_id:
            return None
        return getattr(ctx.user, "name", None) or str(ctx.user_id)

    def _list_runs(self, ctx, owner=None, can_manage=None):
        """Permission-aware wrapper over :class:`RunManager.list_runs`.

        Resolves ``can_manage`` from the context when not provided so
        callers inside the panel don't have to repeat the lookup.
        """
        if can_manage is None:
            can_manage = _has_manage_permission(ctx)
        manager = RunManager(ctx)
        return manager.list_runs(
            owner=owner,
            current_user_id=self._current_user_id(ctx),
            can_manage=can_manage,
        )

    def on_load(self, ctx):
        can_manage = _has_manage_permission(ctx)
        # Match the FE's default `ownerFilter` (OWNER_MINE) so we don't
        # flash all runs before the FE's first refresh.
        runs = self._list_runs(ctx, owner="mine", can_manage=can_manage)
        brain_keys = self._get_brain_keys(ctx)

        ctx.panel.set_data("runs", runs)
        ctx.panel.set_data("brain_keys", brain_keys)

        # FE only needs a truthy value for `canFilterByOwner`; displaying
        # the name is nicer than the id when we have one.
        ctx.panel.set_data("current_user", self._current_user_name(ctx))

        ctx.panel.set_data("can_manage", can_manage)

        # Enable alt-selection visual feedback for negative queries
        ctx.ops.set_sample_selection_style(
            default="green-checkmark", alt="red-checkmark"
        )

    def on_unload(self, ctx):
        ctx.panel.set_state("applied_run_id", None)
        ctx.ops.clear_sample_selection_style()

    # -- Panel methods exposed to frontend --

    def get_brain_keys(self, ctx):
        """Refresh available similarity brain keys."""
        brain_keys = self._get_brain_keys(ctx)
        ctx.panel.set_data("brain_keys", brain_keys)

    def list_runs(self, ctx):
        """Refresh the runs list.

        Accepts an optional ``owner`` param (``"mine"`` or ``"all"``) to
        filter runs server-side. Non-managers are always restricted to
        their own runs regardless of the requested filter.
        """
        runs = self._list_runs(ctx, owner=ctx.params.get("owner"))
        ctx.panel.set_data("runs", runs)

    def apply_run(self, ctx):
        """Apply a completed run's results as the current view."""
        run_id = ctx.params.get("run_id")
        manager = RunManager(ctx)
        run_data = manager.get_run(run_id)

        if not run_data:
            ctx.ops.notify("Run not found", variant="error")
            return

        if run_data.get("status") != RunStatus.COMPLETED:
            ctx.ops.notify("Run is not completed yet", variant="warning")
            return

        result_view_stages = run_data.get("result_view")
        patches_field = run_data.get("patches_field")
        result_ids = run_data.get("result_ids", [])

        if not result_view_stages and not result_ids:
            ctx.ops.notify("Run has no results", variant="warning")
            return

        try:
            if result_view_stages:
                from fiftyone.core.view import DatasetView

                view = DatasetView._build(ctx.dataset, result_view_stages)
            elif patches_field:
                view = ctx.dataset.to_patches(patches_field).select(
                    result_ids, ordered=True
                )
            else:
                view = ctx.dataset.select(result_ids, ordered=True)

            ctx.ops.clear_selected_samples()
            ctx.ops.clear_selected_labels()
            ctx.ops.set_view(view)
            ctx.panel.set_state("applied_run_id", run_id)

            result_count = run_data.get("result_count", 0)
            ctx.ops.notify(
                f"Showing {result_count} results", variant="success"
            )
        except Exception as e:
            logger.error("Failed to apply run %s: %s", run_id, e)
            ctx.ops.notify(f"Failed to apply results: {e}", variant="error")

    def delete_run(self, ctx):
        """Delete a run from the store."""
        run_id = ctx.params.get("run_id")
        manager = RunManager(ctx)
        manager.delete_run(run_id)

        applied = ctx.panel.get_state("applied_run_id")
        if applied == run_id:
            ctx.panel.set_state("applied_run_id", None)

        ctx.ops.notify("Run deleted", variant="success")
        self.list_runs(ctx)

    def bulk_delete_runs(self, ctx):
        """Delete multiple runs from the store."""
        run_ids = ctx.params.get("run_ids", [])
        if not run_ids:
            ctx.ops.notify("No runs selected", variant="warning")
            return

        manager = RunManager(ctx)
        applied = ctx.panel.get_state("applied_run_id")

        for run_id in run_ids:
            manager.delete_run(run_id)
            if applied == run_id:
                ctx.panel.set_state("applied_run_id", None)

        count = len(run_ids)
        ctx.ops.notify(
            f"Deleted {count} {'run' if count == 1 else 'runs'}",
            variant="success",
        )
        self.list_runs(ctx)

    def clone_run(self, ctx):
        """Return a run's config for pre-filling the new search form."""
        run_id = ctx.params.get("run_id")
        manager = RunManager(ctx)
        run_data = manager.get_run(run_id)

        if not run_data:
            ctx.ops.notify("Run not found", variant="error")
            return

        clone_config = {
            "brain_key": run_data.get("brain_key"),
            "query_type": run_data.get("query_type"),
            "query": (
                run_data.get("query")
                if run_data.get("query_type") == "text"
                else None
            ),
            "k": run_data.get("k"),
            "reverse": run_data.get("reverse"),
            "dist_field": run_data.get("dist_field"),
        }
        ctx.panel.set_data("clone_config", clone_config)
        ctx.panel.set_state("view", {"page": "new_search"})

    def rename_run(self, ctx):
        """Rename a run."""
        run_id = ctx.params.get("run_id")
        new_name = ctx.params.get("new_name")

        if not new_name or not new_name.strip():
            ctx.ops.notify("Name cannot be empty", variant="error")
            return

        manager = RunManager(ctx)
        if not manager.get_run(run_id):
            ctx.ops.notify("Run not found", variant="error")
            return
        manager.update_run(run_id, {"run_name": new_name.strip()})
        ctx.ops.notify("Run renamed", variant="success")
        self.list_runs(ctx)

    def on_change_view(self, ctx):
        """Called when the panel navigates between pages."""
        pass

    def get_sample_media(self, ctx):
        """Return filepaths for the given sample IDs.

        OSS only stores local filesystem paths here; the frontend's
        ``getMediaUrl`` wraps these with ``/media`` for rendering. The
        Teams build of this panel resolves to signed URLs instead.
        """
        sample_ids = ctx.params.get("sample_ids", [])
        if not sample_ids:
            return

        try:
            view = ctx.dataset.select(sample_ids)
            filepaths = dict(zip(view.values("id"), view.values("filepath")))
            ctx.panel.set_data("sample_media", filepaths)
        except Exception as e:
            logger.warning("Failed to get sample media: %s", e)

    # -- Render --

    def render(self, ctx):
        panel = types.Object()

        return types.Property(
            panel,
            view=types.View(
                component="SimilaritySearchView",
                composite_view=True,
                on_change_view=self.on_change_view,
                get_brain_keys=self.get_brain_keys,
                list_runs=self.list_runs,
                apply_run=self.apply_run,
                delete_run=self.delete_run,
                bulk_delete_runs=self.bulk_delete_runs,
                clone_run=self.clone_run,
                rename_run=self.rename_run,
                get_sample_media=self.get_sample_media,
            ),
        )

    # -- Helpers --

    def _get_brain_keys(self, ctx):
        """Return available similarity brain keys with config metadata.

        Only brain keys whose runs have persisted results are returned;
        keys from failed/incomplete runs (no ``results`` on the run doc)
        are pruned so we skip the expensive ``get_brain_info`` call for
        them and don't surface them in the UI.
        """
        dataset = ctx.dataset

        try:
            brain_keys = dataset.list_brain_runs(type="similarity")
        except Exception as e:
            logger.warning("Failed to list brain runs: %s", e)
            brain_keys = []

        # Prune brain keys whose runs have no persisted results.
        if brain_keys:
            try:
                run_docs = BrainMethod._get_run_docs(dataset)
                brain_keys = [
                    key
                    for key in brain_keys
                    if key in run_docs and run_docs[key].results
                ]
            except Exception as e:
                logger.warning("Failed to filter brain keys by results: %s", e)

        result = []
        for key in brain_keys:
            try:
                info = dataset.get_brain_info(key)
                config = info.config

                supports_prompts = getattr(config, "supports_prompts", False)
                patches_field = getattr(config, "patches_field", None)
                model = getattr(config, "model", None)
                backend = getattr(config, "method", None)
                embeddings_field = getattr(config, "embeddings_field", None)
                metric = getattr(config, "metric", None)
                try:
                    identifiers = _extract_identifiers(config, backend)
                except Exception as e:
                    logger.warning(
                        "Failed to extract identifiers for key %s: %s",
                        key,
                        e,
                    )
                    identifiers = []

                supports_least = False
                try:
                    sl = getattr(config, "supports_least_similarity", None)
                    supports_least = (
                        sl()
                        if callable(sl)
                        else (sl if sl is not None else False)
                    )
                except Exception as e:
                    logger.warning(
                        "Failed to probe supports_least_similarity for key %s: %s",
                        key,
                        e,
                    )
                    supports_least = False

                result.append(
                    {
                        "key": key,
                        "supports_prompts": bool(supports_prompts),
                        "supports_least_similarity": bool(supports_least),
                        "patches_field": patches_field,
                        "model": model,
                        "backend": backend,
                        "embeddings_field": embeddings_field,
                        "metric": metric,
                        "identifiers": identifiers,
                    }
                )
            except Exception as e:
                logger.warning(
                    "Failed to load brain info for key %s: %s", key, e
                )

        return result
