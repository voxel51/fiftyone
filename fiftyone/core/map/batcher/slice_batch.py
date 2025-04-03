"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import List, Optional, TypeVar

import numpy as np

import fiftyone.core.map.batcher.batch as fomb
from fiftyone.core.map.typing import SampleCollection

T = TypeVar("T")


class SampleSliceBatch(fomb.SampleBatch):
    """Sample batch using slices"""

    @classmethod
    def split(
        cls,
        sample_collection: SampleCollection[T],
        num_workers: int,
        batch_size: Optional[int] = None,
    ) -> List["SampleSliceBatch"]:
        n = len(sample_collection)

        if batch_size is not None:
            # Fixed size shards
            edges = list(range(0, n + 1, batch_size))
            if edges[-1] < n:
                edges.append(n)
        else:
            # Split collection into exactly `num_workers` shards
            edges = [int(round(b)) for b in np.linspace(0, n, num_workers + 1)]

        return [
            cls(start_idx, stop_idx)
            for start_idx, stop_idx in zip(edges[:-1], edges[1:])
        ]

    def __init__(self, start_idx: int, stop_idx: int):
        self.start_idx = start_idx
        self.stop_idx = stop_idx

    @property
    def total(self) -> int:
        return self.stop_idx - self.start_idx

    def create_subset(
        self, sample_collection: SampleCollection[T]
    ) -> SampleCollection[T]:
        return sample_collection[self.start_idx : self.stop_idx]
