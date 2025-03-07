"""
Sequential mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Callable, Iterator, Optional, Tuple, TypeVar

import bson

import fiftyone.core.map.map as fomm

T = TypeVar("T")
R = TypeVar("R")


class SequentialMapBackend(fomm.MapBackend):
    """Executes map_samples sequentially using iter_samples."""

    def map_samples(
        self,
        sample_collection: fomm.SampleCollection[T],
        map_fcn: Callable[[T], R],
        num_workers: Optional[int] = None,
        shard_method: str = "id",
        progress: Optional[bool] = None,
        save: bool = False,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        for sample in sample_collection.iter_samples(
            progress=progress, autosave=save
        ):
            result = map_fcn(sample)
            yield sample.id, result

    def update_samples(
        self,
        sample_collection: fomm.SampleCollection[T],
        update_fcn: Callable[[T], None],
        num_workers: Optional[int] = None,
        shard_method: str = "id",
        progress: Optional[bool] = None,
    ):
        for _ in self.map_samples(
            sample_collection,
            update_fcn,
            num_workers,
            shard_method,
            progress,
            True,
        ):
            ...
