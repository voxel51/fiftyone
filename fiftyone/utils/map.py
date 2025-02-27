from typing import Iterator, Any

from fiftyone.core.map import MapBackendFactory, MapBackendType


def map_samples(
    sample_collection,
    map_fcn,
    save=None,
    num_workers=None,
    shard_method="id",
    progress=None,
    backend: str | MapBackendType = MapBackendType.sequential,
) -> Iterator[Any]:
    """
    Applies `map_fcn` to each sample using the specified backend strategy and returns an iterator.

    Args:
        sample_collection: The dataset or view to process.
        map_fcn (callable): Function to apply to each sample.
        save (bool, optional): Whether to save modified samples.
        num_workers (int, optional): Number of workers (if applicable).
        shard_method (str, optional): Method for sharding ('id' or 'slice').
        progress (bool, optional): Whether to show progress bar.
        backend (str | MapBackendType, optional): Backend execution strategy.

    Returns:
        Iterator[Any]: Processed sample results.
    """
    # Convert backend to Enum if given as a string
    if isinstance(backend, str):
        backend = MapBackendType.from_string(backend)

    # Get the correct backend implementation
    backend_instance = MapBackendFactory.get_backend(backend)

    # Execute map_samples with the chosen backend
    return backend_instance.map_samples(
        sample_collection, map_fcn, save, num_workers, shard_method, progress
    )


def update_samples(
    sample_collection,
    map_fcn,
    save=None,
    num_workers=None,
    shard_method="id",
    progress=None,
    backend: str | MapBackendType = MapBackendType.sequential,
) -> Iterator[Any]:
    """
    Applies `map_fcn` to each sample using the specified backend strategy.

    Args:
        sample_collection: The dataset or view to process.
        map_fcn (callable): Function to apply to each sample.
        save (bool, optional): Whether to save modified samples.
        num_workers (int, optional): Number of workers (if applicable).
        shard_method (str, optional): Method for sharding ('id' or 'slice').
        progress (bool, optional): Whether to show progress bar.
        backend (str | MapBackendType, optional): Backend execution strategy.

    Returns:
        Iterator[Any]: Processed sample results.
    """
    # Convert backend to Enum if given as a string
    if isinstance(backend, str):
        backend = MapBackendType.from_string(backend)

    # Get the correct backend implementation
    backend_instance = MapBackendFactory.get_backend(backend)

    # Execute map_samples with the chosen backend
    return backend_instance.map_samples(
        sample_collection, map_fcn, save, num_workers, shard_method, progress
    )
