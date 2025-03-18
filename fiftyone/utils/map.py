"""
Utility method for mapping samples

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any, Callable, Literal, Optional, Union

import fiftyone.core.map as focm


def map_samples(
    sample_collection,
    map_fcn: Callable[[Any], None],
    workers: Optional[int] = None,
    batch_method: Union[Literal["id"], Literal["slice"]] = "id",
    progress: Optional[Union[bool, Literal["worker"]]] = None,
    save: bool = False,
    parallelize_method: Union[
        Literal["process"], Literal["thread"]
    ] = "process",
    skip_failures: bool = False,
):
    """
    Applies `map_fcn` to each sample using the specified backend strategy and
    returns an iterator.

    Args:
        sample_collection: The dataset or view to process.
        map_fcn: Function to apply to each sample.
        workers (None): Number of workers.
        batch_method ("id"): Method for sharding ('id' or 'slice').
        progress (None): Whether to show progress bar.
        save (False): Whether to save modified samples.
        parallelize_method ("process"): Method for parallelization ('process'
          or 'thread').
        skip_failures (True): whether to gracefully continue without raising an
            error if the map function raises an exception for a sample.

    Returns:
        A generator yield processed sample results.
    """
    mapper = focm.MapperFactory.create(
        parallelize_method,
        sample_collection,
        workers,
        batch_method,
    )
    print("parallelize_method:", parallelize_method)
    print("workers:", workers)
    print("batch_method:", batch_method)
    print("mapper:", mapper)
    print("map_fcn:", map_fcn)

    yield from mapper.map_samples(
        map_fcn, progress=progress, save=save, skip_failures=skip_failures
    )


def update_samples(
    sample_collection,
    update_fcn: Callable[[Any], None],
    workers: Optional[int] = None,
    batch_method: Union[Literal["id"], Literal["slice"]] = "id",
    progress: Optional[Union[bool, Literal["worker"]]] = None,
    parallelize_method: Union[
        Literal["process"], Literal["thread"]
    ] = "process",
    skip_failures: bool = False,
):
    """
    Applies `map_fcn` to each sample using the specified backend strategy.

    Args:
        sample_collection: The dataset or view to process.
        update_fcn: Function to apply to each sample.
        workers (None): Number of workers.
        batch_method ("id"): Method for sharding ('id' or 'slice').
        progress (None): Whether to show progress bar.
        parallelize_method ("process"): Method for parallelization ('process'
          or 'thread').
        skip_failures (True): whether to gracefully continue without raising an
            error if the update function raises an exception for a sample.
    """
    mapper = focm.MapperFactory.create(
        parallelize_method, sample_collection, workers, batch_method
    )

    for _ in mapper.map_samples(
        update_fcn,
        progress=progress,
        save=True,
        skip_failures=skip_failures,
    ):
        ...
