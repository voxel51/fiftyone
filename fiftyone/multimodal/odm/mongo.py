"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone import Dataset, Sample
from fiftyone.multimodal.metadata import MultimodalMetadata
from fiftyone.multimodal.schemas.v1 import SceneInventory

from .base import DatabaseAdapter


class MongoAdapter(DatabaseAdapter):
    @classmethod
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
        new_samples = []
        update_values = {}
        failed = []
        for sample, inventory in sample_and_scene_inventory_pairs:
            try:
                metadata = MultimodalMetadata.build_for_scene_inventory(
                    inventory
                )
            except Exception as e:
                failed.append((sample, inventory, e))
            else:
                if sample.id:
                    update_values[sample.id] = metadata
                else:
                    sample["metadata"] = metadata
                    new_samples.append(sample)

        if update_values:
            dataset.set_values("metadata", update_values, key_field="id")

        if new_samples:
            dataset.add_samples(new_samples)
