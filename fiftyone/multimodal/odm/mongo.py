"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import List

from fiftyone import Dataset, Sample, ViewField as F
from fiftyone.multimodal.metadata import MultimodalMetadata
from fiftyone.multimodal.schemas.v1 import SceneInventory

from .base import DatabaseAdapter


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
        scene_ids = {inventory.scene_id for inventory in inventories}
        existing_samples = {
            s["metadata"].scene_id: s
            for s in dataset.match(F("filepath").is_in(scene_ids))
        }

        new_samples = []
        for inventory in inventories:
            metadata = MultimodalMetadata.build_for(inventory)

            if inventory.scene_id in existing_samples:
                sample = existing_samples[inventory.scene_id]
                sample["metadata"] = metadata
                sample.save()
            else:
                sample = Sample(filepath=inventory.scene_id)
                sample["metadata"] = metadata
                new_samples.append(sample)

        if new_samples:
            dataset.add_samples(new_samples)
