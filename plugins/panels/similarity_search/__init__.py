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

from .constants import STORE_NAME

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
        brain_keys = self._get_brain_keys(ctx)
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

    def on_change_view(self, ctx):
        """Called when the panel navigates between pages."""
        pass

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
            ),
        )

    # -- Helpers --

    def _get_brain_keys(self, ctx):
        """Return available similarity brain keys with config metadata."""
        dataset = ctx.dataset

        try:
            brain_keys = dataset.list_brain_runs(type="similarity")
        except Exception as e:
            logger.warning("Failed to list brain runs: %s", e)
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
                        "max_k": max_k,
                        "patches_field": patches_field,
                    }
                )
            except Exception as e:
                logger.warning(
                    "Failed to load brain info for key %s: %s", key, e
                )

        return result
