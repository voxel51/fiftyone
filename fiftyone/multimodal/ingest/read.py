"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from concurrent.futures import ThreadPoolExecutor
import os
from typing import Generator

from fiftyone.core import storage
from fiftyone.multimodal.adapters import MultimodalAdapter
from fiftyone.multimodal.schemas.v1 import SceneInventory


def _readable_paths(
    filepaths: list[str], *, adapter: MultimodalAdapter
) -> Generator[str, None, None]:
    """
    Returns a generator of filepaths in the given iterable that can be read by
    the given adapter.

    Args:
        filepaths: an iterable of strings representing file paths or directory
            locations to crawl
        adapter: a subclass of :class:`MultimodalAdapter` that determines
            whether a given file can be read

    Returns:
        a generator of strings representing the filepaths in the given iterable
        that can be read by the given adapter
    """
    for filepath in filepaths:
        if storage.isdir(filepath):
            for path in storage.list_files(
                filepath, abs_paths=True, recursive=True
            ):
                if adapter.can_read(path):
                    yield path
        elif storage.exists(filepath) and adapter.can_read(filepath):
            yield filepath


def _get_scene_inventories(
    filepaths: list[str], *, adapter: MultimodalAdapter
) -> list[SceneInventory]:
    """
    Reads the given scene files using the given adapter class, and returns
    a list of scene inventories.

    Args:
        filepaths: an iterable of strings representing the locations of the
            scene files to ingest
        adapter: a subclass of
            :class:`fiftyone.multimodal.adapters.MultimodalAdapter` that
            determines how the given sources are ingested

    Returns:
        a list of :class:`fiftyone.multimodal.SceneInventory` instances
    """
    paths = list(_readable_paths(filepaths, adapter=adapter))
    max_workers = max(1, min(8, (os.cpu_count() or 1) + 4, len(paths)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        return list(executor.map(adapter.get_scene_inventory, paths))
