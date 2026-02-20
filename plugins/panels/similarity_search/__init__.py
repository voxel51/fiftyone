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

logger = logging.getLogger(__name__)


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

    def on_load(self, ctx):
        manager = RunManager(ctx)
        runs = manager.list_runs()
        brain_keys = self._get_brain_keys(ctx)

        ctx.panel.set_data("runs", runs)
        ctx.panel.set_data("brain_keys", brain_keys)

        view_state = ctx.panel.get_state("view") or {"page": "home"}
        ctx.panel.set_state("view", view_state)

    def on_unload(self, ctx):
        ctx.panel.set_state("applied_run_id", None)

    # -- Panel methods exposed to frontend --

    def get_brain_keys(self, ctx):
        """Refresh available similarity brain keys."""
        brain_keys = self._get_brain_keys(ctx)
        ctx.panel.set_data("brain_keys", brain_keys)

    def list_runs(self, ctx):
        """Refresh the runs list."""
        manager = RunManager(ctx)
        runs = manager.list_runs()
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

        result_ids = run_data.get("result_ids", [])
        if not result_ids:
            ctx.ops.notify("Run has no results", variant="warning")
            return

        patches_field = run_data.get("patches_field")

        try:
            if patches_field:
                view = ctx.dataset.to_patches(patches_field).select(
                    result_ids, ordered=True
                )
            else:
                view = ctx.dataset.select(result_ids, ordered=True)

            ctx.ops.set_view(view)
            ctx.panel.set_state("applied_run_id", run_id)

            ctx.ops.notify(
                f"Showing {len(result_ids)} results", variant="success"
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
        manager.update_run(run_id, {"run_name": new_name.strip()})
        ctx.ops.notify("Run renamed", variant="success")
        self.list_runs(ctx)

    def on_change_view(self, ctx):
        """Called when the panel navigates between pages."""
        pass

    def get_sample_media(self, ctx):
        """Return filepaths for the given sample IDs."""
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
                clone_run=self.clone_run,
                rename_run=self.rename_run,
                get_sample_media=self.get_sample_media,
            ),
        )

    # -- Helpers --

    def _get_brain_keys(self, ctx):
        """Return available similarity brain keys with config metadata."""
        dataset = ctx.dataset

        try:
            brain_keys = dataset.list_brain_runs(type="similarity")
        except Exception:
            brain_keys = []

        result = []
        for key in brain_keys:
            try:
                info = dataset.get_brain_info(key)
                config = info.config

                supports_prompts = getattr(config, "supports_prompts", False)
                patches_field = getattr(config, "patches_field", None)

                # max_k and supports_least_similarity may be methods
                max_k = None
                try:
                    mk = getattr(config, "max_k", None)
                    max_k = mk() if callable(mk) else mk
                except Exception:
                    pass

                supports_least = True
                try:
                    sl = getattr(config, "supports_least_similarity", None)
                    supports_least = (
                        sl()
                        if callable(sl)
                        else (sl if sl is not None else True)
                    )
                except Exception:
                    pass

                result.append(
                    {
                        "key": key,
                        "supports_prompts": bool(supports_prompts),
                        "supports_least_similarity": bool(supports_least),
                        "max_k": max_k,
                        "patches_field": patches_field,
                    }
                )
            except Exception as e:
                logger.warning(
                    "Failed to load brain info for key %s: %s", key, e
                )

        return result
