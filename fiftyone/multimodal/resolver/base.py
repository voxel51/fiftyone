"""
Base interfaces for multimodal playback resolution.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc


class PlaybackPlanBuilder(abc.ABC):
    """Abstract resolver interface for playback plan generation."""

    @abc.abstractmethod
    def build_playback_plan(self, scene_inventory):
        """Builds a playback plan from a scene inventory."""
