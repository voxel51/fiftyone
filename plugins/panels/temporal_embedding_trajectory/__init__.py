"""
Temporal Embedding Trajectory panel.

Visualizes per-frame embeddings of a video scene as a 2D scatter
(UMAP) with a trajectory polyline and jump markers on outlier frames.
Designed for finding the exact frame where a model's semantic
understanding shifted (e.g. lighting change, occlusion, false detection).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import fiftyone.operators.types as types
from fiftyone.operators.categories import Categories
from fiftyone.operators.panel import Panel, PanelConfig

from .operators import ComputeTrajectoryEmbeddings

logger = logging.getLogger(__name__)


_PANEL_NAME = "temporal_embedding_trajectory"


class TemporalEmbeddingTrajectoryPanel(Panel):
    """Panel that renders per-frame embeddings of the current video
    scene as a 2D scatter with a temporal trajectory and jump markers."""

    @property
    def config(self):
        return PanelConfig(
            name=_PANEL_NAME,
            label="Temporal Embedding Trajectory",
            icon="timeline",
            category=Categories.CURATE,
            surfaces="grid modal",
            help_markdown=(
                "Visualize per-frame embedding trajectories within a "
                "video scene. Find the exact frame where the model's "
                "semantic understanding shifted."
            ),
        )

    # -- Lifecycle --

    def on_load(self, ctx):
        ctx.panel.set_data("brain_keys", self._list_visualization_keys(ctx))
        ctx.panel.set_state("selected_brain_key", None)
        # Push the initial scene if a sample is already selected.
        self._push_scene_for_current_sample(ctx)

    def on_change_current_sample(self, ctx):
        self._push_scene_for_current_sample(ctx)

    def on_change_view(self, ctx):
        # When the user changes view, the available brain keys / current
        # scene context may shift. Re-push.
        ctx.panel.set_data("brain_keys", self._list_visualization_keys(ctx))
        self._push_scene_for_current_sample(ctx)

    # -- Methods exposed to the frontend --

    def list_brain_keys(self, ctx):
        ctx.panel.set_data("brain_keys", self._list_visualization_keys(ctx))

    def get_scene_trajectory(self, ctx):
        """Build the trajectory payload for the requested scene.

        Params (in ``ctx.params``):
          - ``brain_key`` (str): the visualization brain key to load.
          - ``sample_id`` (str): the parent video sample id. Falls
            back to the currently-selected sample.
        """
        brain_key = ctx.params.get("brain_key") or ctx.panel.get_state(
            "selected_brain_key"
        )
        sample_id = ctx.params.get("sample_id") or ctx.current_sample

        payload = self._build_scene_payload(ctx, brain_key, sample_id)
        ctx.panel.set_data("scene_trajectory", payload)
        ctx.panel.set_state("selected_brain_key", brain_key)
        return payload

    def get_compare_trajectories(self, ctx):
        """Build trajectory payloads for several brain keys at once.

        Used by the compare-mode view: one payload per selected brain
        key, all for the same parent sample. The payload shape is
        identical to ``get_scene_trajectory`` so the frontend can
        treat each entry the same way.

        Params (in ``ctx.params``):
          - ``brain_keys`` (list[str]): the visualization brain keys.
          - ``sample_id`` (str): the parent video sample id. Falls
            back to the currently-selected sample.
        """
        brain_keys = ctx.params.get("brain_keys") or []
        sample_id = ctx.params.get("sample_id") or ctx.current_sample
        if not brain_keys or not sample_id:
            ctx.panel.set_data("compare_trajectories", {})
            return {}

        results = {}
        for brain_key in brain_keys:
            if not brain_key:
                continue
            try:
                payload = self._build_scene_payload(ctx, brain_key, sample_id)
                if payload is not None:
                    results[brain_key] = payload
            except Exception as e:
                logger.warning(
                    "Failed to build compare payload for %s: %s",
                    brain_key,
                    e,
                )

        ctx.panel.set_data("compare_trajectories", results)
        return results

    def compute_trajectory(self, ctx):
        """Prompt the compute operator with the panel's chosen params.

        Uses ``ctx.prompt`` (the same pattern as the model evaluation
        panel) so the user gets the operator's input form and the
        operation can run delegated.
        """
        ctx.prompt(
            "@voxel51/panels/compute_trajectory_embeddings",
            params=ctx.params,
            on_success=self._on_compute_success,
        )

    def _on_compute_success(self, ctx):
        # After compute, refresh brain keys so the new key shows up,
        # and re-fetch the scene for the currently selected sample.
        ctx.panel.set_data("brain_keys", self._list_visualization_keys(ctx))
        result = ctx.params.get("result") or {}
        new_key = result.get("brain_key")
        if new_key:
            ctx.panel.set_state("selected_brain_key", new_key)
        self._push_scene_for_current_sample(ctx)

    def seek_to_frame(self, ctx):
        """Seek the modal to the given frame_number.

        The frontend also performs the per-frame Jotai seek directly for
        the smooth in-video case; this method exists as a fallback when
        we need to change which sample is shown (e.g. clicking a point
        from a *different* scene than the one currently in modal).
        """
        sample_id = ctx.params.get("sample_id")
        if not sample_id:
            return

        if getattr(ctx, "current_sample", None) and str(
            ctx.current_sample
        ) == str(sample_id):
            # Same sample already open — frontend handles the frame seek.
            return

        try:
            view = ctx.dataset.select([sample_id], ordered=True)
            ctx.ops.set_view(view)
        except Exception as e:
            logger.warning("seek_to_frame failed: %s", e)

    # -- Render --

    def render(self, ctx):
        panel = types.Object()
        return types.Property(
            panel,
            view=types.View(
                component="TemporalEmbeddingTrajectoryView",
                composite_view=True,
                list_brain_keys=self.list_brain_keys,
                get_scene_trajectory=self.get_scene_trajectory,
                get_compare_trajectories=self.get_compare_trajectories,
                compute_trajectory=self.compute_trajectory,
                seek_to_frame=self.seek_to_frame,
            ),
        )

    # -- Internals --

    def _list_visualization_keys(self, ctx):
        """Visualization brain keys available on the current dataset.

        Excludes patch-level visualizations since this panel operates on
        frame-level embeddings only.
        """
        dataset = ctx.dataset
        if dataset is None:
            return []

        try:
            keys = dataset.list_brain_runs(type="visualization")
        except Exception as e:
            logger.warning("Failed to list brain runs: %s", e)
            return []

        out = []
        for key in keys:
            try:
                info = dataset.get_brain_info(key)
                config = info.config
                patches_field = getattr(config, "patches_field", None)
                if patches_field:
                    continue
                out.append(
                    {
                        "key": key,
                        "method": getattr(config, "method", None),
                        "model": getattr(config, "model", None),
                        "num_dims": getattr(config, "num_dims", 2),
                    }
                )
            except Exception as e:
                logger.warning("Failed to load brain info for %s: %s", key, e)
        return out

    def _push_scene_for_current_sample(self, ctx):
        sample_id = getattr(ctx, "current_sample", None)
        brain_key = ctx.panel.get_state("selected_brain_key")
        if not sample_id or not brain_key:
            return
        try:
            payload = self._build_scene_payload(ctx, brain_key, sample_id)
            ctx.panel.set_data("scene_trajectory", payload)
        except Exception as e:
            logger.warning("Failed to push initial scene payload: %s", e)

    def _build_scene_payload(self, ctx, brain_key, sample_id):
        """Assemble the per-scene trajectory payload from a brain run.

        Returns a dict with parallel arrays sorted by frame_number:
            {
                "sample_id": str,
                "brain_key": str,
                "points": [[x, y], ...],
                "frame_numbers": [int, ...],
                "frame_ids": [str, ...],
                "jump_dists": [float, ...],
            }
        """
        if not brain_key:
            return None

        dataset = ctx.dataset
        try:
            results = dataset.load_brain_results(brain_key)
        except Exception as e:
            logger.warning(
                "Failed to load brain results for %s: %s", brain_key, e
            )
            return None

        # Brain visualization results expose parallel arrays of points
        # and per-frame ids. When compute_visualization runs on a
        # frames view, each "sample" in that view is a frame document,
        # so `_curr_sample_ids` holds *frame* ids — not parent video
        # ids. `_curr_label_ids` is empty in that case.
        points = getattr(results, "_curr_points", None)
        sample_ids = getattr(results, "_curr_sample_ids", None)

        if points is None or sample_ids is None:
            return None

        # Build a frame_id -> frame_number map for this parent video so
        # we can filter the brain results and recover frame ordering in
        # one pass.
        try:
            parent = dataset[sample_id]
        except Exception as e:
            logger.warning("Failed to load sample %s: %s", sample_id, e)
            return None

        frame_id_to_number = {
            str(f.id): f.frame_number for f in parent.frames.values()
        }
        parent_frame_id_set = set(frame_id_to_number.keys())

        idx_by_frame = []
        for i, sid in enumerate(sample_ids):
            if str(sid) in parent_frame_id_set:
                idx_by_frame.append(i)
        if not idx_by_frame:
            return {
                "sample_id": str(sample_id),
                "brain_key": brain_key,
                "points": [],
                "frame_numbers": [],
                "frame_ids": [],
                "jump_dists": [],
            }

        frame_ids = [str(sample_ids[i]) for i in idx_by_frame]
        frame_numbers = [frame_id_to_number.get(fid) for fid in frame_ids]
        jump_dists = self._lookup_jump_dists(
            ctx, sample_id, frame_ids, brain_key
        )

        # Sort everything by frame_number.
        bundled = list(zip(frame_numbers, idx_by_frame, frame_ids, jump_dists))
        bundled.sort(key=lambda t: (t[0] if t[0] is not None else 1 << 30))

        out_points = [
            [float(points[idx][0]), float(points[idx][1])]
            for (_, idx, _, _) in bundled
        ]
        return {
            "sample_id": str(sample_id),
            "brain_key": brain_key,
            "points": out_points,
            "frame_numbers": [fn for (fn, _, _, _) in bundled],
            "frame_ids": [fid for (_, _, fid, _) in bundled],
            "jump_dists": [jd for (_, _, _, jd) in bundled],
        }

    def _lookup_frame_numbers(self, ctx, sample_id, frame_ids):
        if not frame_ids:
            return []
        try:
            sample = ctx.dataset[sample_id]
            wanted = set(frame_ids)
            return [
                frame.frame_number
                for frame in sample.frames.values()
                if str(frame.id) in wanted
            ]
        except Exception as e:
            logger.warning("Failed to look up frame numbers: %s", e)
            return [None] * len(frame_ids)

    def _lookup_jump_dists(self, ctx, sample_id, frame_ids, brain_key):
        if not frame_ids:
            return []
        field = f"{brain_key}_jump_dist"
        try:
            sample = ctx.dataset[sample_id]
            wanted = set(frame_ids)
            return [
                float(frame.get_field(field) or 0.0)
                for frame in sample.frames.values()
                if str(frame.id) in wanted
            ]
        except Exception as e:
            logger.warning("Failed to look up jump distances: %s", e)
            return [0.0] * len(frame_ids)


__all__ = [
    "TemporalEmbeddingTrajectoryPanel",
    "ComputeTrajectoryEmbeddings",
]
