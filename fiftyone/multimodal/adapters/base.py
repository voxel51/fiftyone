"""
Base interfaces for multimodal adapters.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc


class MultimodalAdapter(abc.ABC):
    """Abstract adapter interface for loading multimodal scenes."""

    @classmethod
    @abc.abstractmethod
    def get_inventory(cls, filepath: str):
        """
        Returns the scene inventory for the scene data at the given filepath.

        Args:
            filepath: the path of the scene file to load

        Returns:
            a :class:`fiftyone.core.multimodal.SceneInventory`
        """
        raise NotImplementedError(
            "get_inventory() must be implemented by subclasses"
        )
