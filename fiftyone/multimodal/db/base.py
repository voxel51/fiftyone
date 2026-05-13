"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc

from fiftyone import Dataset, Sample
from fiftyone.multimodal.schemas.v1 import SceneInventory


class DatabaseAdapter(abc.ABC):
    @classmethod
    @abc.abstractmethod
    def write_scene_inventories(
        cls,
        dataset: Dataset,
        sample_and_scene_inventory_pairs: list[tuple[Sample, SceneInventory]],
    ) -> None:
        """
        Writes the given scene inventories to the 'metadata' field of their
        respective samples.

        Args:
            dataset: the :class:`fiftyone.Dataset` to write to
            sample_and_scene_inventory_pairs: a list of tuples of
                :class:`Sample` and :class:`SceneInventory`
        """
