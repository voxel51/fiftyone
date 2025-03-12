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
    map_fcn,
    workers=None,
    batch_method="id",
    progress=None,
    save=False,
    parallelize_method="process",
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
          or'thread').

    Returns:
        A generator yield processed sample results.
    """
    mapper = focm.MapperFactory.create(
        parallelize_method,
        sample_collection,
        workers,
        batch_method,
    )

    yield from mapper.map_samples(map_fcn, progress, save)


def update_samples(
    sample_collection,
    update_fcn: Callable[[Any], None],
    workers: Optional[int] = None,
    batch_method: str = "id",
    progress: Optional[Union[bool, Literal["worker"]]] = None,
    parallelize_method: str = "process",
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
          or'thread').
    """
    mapper = focm.MapperFactory.create(
        parallelize_method, sample_collection, workers, batch_method
    )

    return mapper.update_samples(update_fcn, progress)
