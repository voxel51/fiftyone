"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from typing import List

from fiftyone import Dataset
from fiftyone.multimodal.schemas.v1 import SceneInventory


class DatabaseAdapter(abc.ABC):
    @classmethod
    @abc.abstractmethod
    def write_scene_inventories(
        cls, dataset: Dataset, inventories: List[SceneInventory]
    ) -> None:
        """
        Writes the given scene inventories to the dataset as samples with the
        'metadata' field.

        Args:
            dataset: the :class:`fiftyone.Dataset` to write to
            inventories: a list of :class:`SceneInventory`
        """
        raise NotImplementedError(
            "subclasses must implement write_scene_inventories()"
        )
