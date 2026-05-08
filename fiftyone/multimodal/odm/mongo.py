"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone import Dataset, Sample, ViewField as F
from fiftyone.multimodal.metadata import MultimodalMetadata
from fiftyone.multimodal.schemas.v1 import SceneInventory

from .base import DatabaseAdapter


class MongoAdapter(DatabaseAdapter):
    @classmethod
    def write_scene_inventories(
        cls, dataset: Dataset, inventories: list[SceneInventory]
    ) -> None:
        """
        Writes the given scene inventories to the dataset as samples with the
        'metadata' field.

        Args:
            dataset: the :class:`fiftyone.Dataset` to write to
            inventories: a list of :class:`SceneInventory`
        """
        scene_ids = {inventory.scene_id for inventory in inventories}
        existing_samples = {}
        for sample in dataset.match(F("metadata.scene_id").is_in(scene_ids)):
            existing_samples.setdefault(
                sample["metadata.scene_id"], []
            ).append(sample)

        update_values = {}
        new_samples = {}
        for inventory in inventories:
            metadata = MultimodalMetadata.build_for_scene_inventory(inventory)

            if inventory.scene_id in existing_samples:
                for sample in existing_samples[inventory.scene_id]:
                    update_values[sample.id] = metadata
            elif inventory.scene_id in new_samples:
                for sample in new_samples[inventory.scene_id]:
                    sample["metadata"] = metadata
            else:
                sample = Sample(filepath=inventory.scene_id)
                sample["metadata"] = metadata
                new_samples.setdefault(inventory.scene_id, []).append(sample)

        if update_values:
            dataset.set_values("metadata", update_values, key_field="id")

        if new_samples:
            dataset.add_samples(
                [
                    sample
                    for samples in new_samples.values()
                    for sample in samples
                ]
            )
