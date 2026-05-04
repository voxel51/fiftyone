"""
Base interfaces for multimodal adapters.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc

from fiftyone.multimodal.schemas.v1.__generated__.inventory_pb2 import (
    SceneInventory,
)


class MultimodalAdapter(abc.ABC):
    """Abstract adapter interface for loading multimodal scenes."""

    @classmethod
    @abc.abstractmethod
    def can_read(cls, filepath: str) -> bool:
        """
        Returns True if this adapter can read the scene data at the given filepath.

        Args:
            filepath: the path of the scene file to check

        Returns:
            True if this adapter can read the scene data at the given filepath, else
            False
        """
        raise NotImplementedError(
            "can_read() must be implemented by subclasses"
        )

    @classmethod
    @abc.abstractmethod
    def get_scene_inventory(cls, filepath: str) -> SceneInventory:
        """
        Returns the scene inventory for the scene data at the given filepath.

        Args:
            filepath: the path of the scene file to load

        Returns:
            a :class:`SceneInventory`
        """
        raise NotImplementedError(
            "get_scene_inventory() must be implemented by subclasses"
        )
