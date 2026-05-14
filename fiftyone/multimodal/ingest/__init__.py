"""
Ingest scaffolding for multimodal workflows.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone as fo
from .read import _get_scene_inventories
from fiftyone.multimodal.db.mongo import MongoAdapter


def ingest_filepaths(
    dataset: fo.Dataset, filepaths: list[str], *, adapter, manifest
) -> None:
    """
    Runs the multimodal ingestion pipeline on the given dataset.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset` to ingest
    """
    inventories = _get_scene_inventories(filepaths, adapter=adapter)
    sample_and_inventory_pairs = [
        (
            fo.Sample(
                # TODO the actual mapping of inventory to filepath should be
                # derived from the manifest
                filepath=inventory.scene_id,
                media_type=fo.core.media.MULTIMODAL,
            ),
            inventory,
        )
        for inventory in inventories
    ]
    MongoAdapter.write_scene_inventories(dataset, sample_and_inventory_pairs)
    dataset.save()


__all__ = ["_get_scene_inventories", "ingest_filepaths"]
