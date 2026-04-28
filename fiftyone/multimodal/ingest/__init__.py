"""
Ingest scaffolding for multimodal workflows.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.core import storage


def _get_scene_inventories(filepaths, *, adapter):
    """
    Reads the given scene files using the given adapter class, and returns
    a list of scene inventories.

    Args:
        sources: an iterable of strings representing the locations of the
            scene files to ingest
        adapter: an instance of
            :class:`fiftyone.multimodal.adapters.MultimodalAdapter` that
            determines how the given sources are ingested

    Returns:
        a list of :class:`fiftyone.multimodal.SceneInventory` instances
    """
    inventories = []

    for filepath in filepaths:
        if storage.exists(filepath) and adapter.can_read(filepath):
            inventories.append(adapter.get_scene_inventory(filepath))
            continue

        if storage.isdir(filepath):
            for filepath in storage.list_files(
                filepath, abs_paths=True, recursive=True
            ):
                if adapter.can_read(filepath):
                    inventories.append(adapter.get_scene_inventory(filepath))

    return inventories
