"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import List, Optional

from fiftyone import Dataset, Sample, ViewField as F
from fiftyone.multimodal.metadata import MultimodalMetadata
from fiftyone.multimodal.schemas.v1 import SceneInventory

from .base import DatabaseAdapter


def get_scene_id(sample: Sample) -> Optional[str]:
    """Returns the scene ID for the given sample."""
    metadata = sample["metadata"]
    if not metadata:
        return None
    return metadata.scene_id


class MongoAdapter(DatabaseAdapter):
    @classmethod
    def write_scene_inventories(
        cls, dataset: Dataset, inventories: List[SceneInventory]
    ) -> None:
        """
        Writes the given scene inventories to the dataset as samples with the
        metadata field 'scene_inventory'.

        Args:
            dataset: the :class:`fiftyone.Dataset` to write to
            inventories: a list of :class:`SceneInventory`
        """
        scene_ids = {inventory.scene_id for inventory in inventories}
        existing_samples = {
            get_scene_id(s): s
            for s in dataset.match(F("metadata.scene_id").is_in(scene_ids))
        }

        new_samples = []
        for inventory in inventories:
            metadata = MultimodalMetadata.build_for_scene_inventory(inventory)

            if inventory.scene_id in existing_samples:
                sample = existing_samples[inventory.scene_id]
                sample["metadata"] = metadata
                if sample.in_dataset:
                    sample.save()
            else:
                sample = Sample(filepath=inventory.scene_id)
                sample["metadata"] = metadata
                new_samples.append(sample)
                # In case the same scene ID shows up in multiple new samples, save the same and update it rather than
                # creating a duplicate sample
                existing_samples[inventory.scene_id] = sample

        if new_samples:
            dataset.add_samples(new_samples)
