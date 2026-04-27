"""
Base interfaces for multimodal playback resolution.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import abc
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fiftyone.multimodal.schemas.v1 import PlaybackPlan, SceneInventory


class PlaybackPlanBuilder(abc.ABC):
    """Abstract resolver interface for playback plan generation."""

    @abc.abstractmethod
    def build_playback_plan(
        self, scene_inventory: SceneInventory
    ) -> PlaybackPlan:
        """Builds a playback plan from a scene inventory."""
