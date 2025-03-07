"""
Utility method for mapping samples

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any, Iterator, Optional, Union

from fiftyone.core.map import MapBackendFactory, MapBackendType


def map_samples(
    sample_collection,
    map_fcn,
    num_workers: Optional[int] = None,
    shard_method: str = "id",
    progress: Optional[bool] = None,
    save: bool = False,
    backend: Union[str, MapBackendType] = MapBackendType.sequential,
) -> Iterator[Any]:
    """
    Applies `map_fcn` to each sample using the specified backend strategy and
    returns an iterator.

    Args:
        sample_collection: The dataset or view to process.
        map_fcn: Function to apply to each sample.
        save (False): Whether to save modified samples.
        num_workers (None): Number of workers.
        shard_method ("id"): Method for sharding ('id' or 'slice').
        progress (None): Whether to show progress bar.
        backend (MapBackendType.sequential): Backend execution strategy.

    Returns:
        Iterator[Any]: Processed sample results.
    """
    # Get the correct backend implementation
    backend_instance = MapBackendFactory.get_backend(backend)

    # Execute map_samples with the chosen backend
    return backend_instance.map_samples(
        sample_collection, map_fcn, num_workers, shard_method, progress, save
    )


def update_samples(
    sample_collection,
    update_fcn,
    num_workers: Optional[int] = None,
    shard_method: str = "id",
    progress: Optional[bool] = None,
    backend: Union[str, MapBackendType] = MapBackendType.sequential,
):
    """
    Applies `map_fcn` to each sample using the specified backend strategy.

    Args:
        sample_collection: The dataset or view to process.
        map_fcn: Function to apply to each sample.
        num_workers (None): Number of workers.
        shard_method ("id"): Method for sharding ('id' or 'slice').
        progress (None): Whether to show progress bar.
        backend (MapBackendType.sequential): Backend execution strategy.
    """
    # Get the correct backend implementation
    backend_instance = MapBackendFactory.get_backend(backend)

    # Execute map_samples with the chosen backend
    return backend_instance.update_samples(
        sample_collection, update_fcn, num_workers, shard_method, progress
    )
