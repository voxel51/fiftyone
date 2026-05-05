"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import List

from google.protobuf.json_format import MessageToDict

from .base import DatabaseAdapter
from fiftyone import Dataset, Sample
from fiftyone.multimodal.schemas.v1 import SceneInventory


class MongoAdapter(DatabaseAdapter):
    @classmethod
    def write_scene_inventories(
        cls, dataset: Dataset, inventories: List[SceneInventory]
    ) -> None:
        """
        Writes the given scene inventories to the dataset as samples with the
        metadata field 'scene_inventory'.

        Args:
            inventories: a list of :class:`SceneInventory`
        """
        dataset.add_samples(
            [
                cls._scene_inventory_to_sample(inventory)
                for inventory in inventories
            ]
        )

    @classmethod
    def _scene_inventory_to_sample(cls, inventory: SceneInventory) -> Sample:
        sample = Sample(filepath=inventory.scene_id)
        sample["metadata"] = MessageToDict(inventory)
        return sample
