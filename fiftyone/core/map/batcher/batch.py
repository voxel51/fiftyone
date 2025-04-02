"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from typing import List, Optional, TypeVar

import numpy as np

from fiftyone.core.map.typing import SampleCollection

T = TypeVar("T")


class SampleBatch(abc.ABC):
    """A sample batch"""

    @staticmethod
    def _get_sample_collection_indexes(
        sample_collection: SampleCollection[T],
        workers: int,
        batch_size: Optional[int] = None,
    ):
        n = len(sample_collection)

        if batch_size is not None:
            # Fixed size shards
            edges = list(range(0, n + 1, batch_size))
            if edges[-1] < n:
                edges.append(n)
        else:
            # Split collection into exactly `num_workers` shards
            edges = [int(round(b)) for b in np.linspace(0, n, workers + 1)]

        for start_idx, stop_idx in zip(edges[:-1], edges[1:]):
            yield (start_idx, stop_idx)

    @classmethod
    @abc.abstractmethod
    def split(
        cls,
        sample_collection: SampleCollection[T],
        num_workers: int,
        batch_size: Optional[int] = None,
    ) -> List["SampleBatch"]:
        """Create a list of sample batches"""

    @property
    @abc.abstractmethod
    def total(self) -> int:
        """Get the total number of samples in the batch"""

    @abc.abstractmethod
    def create_subset(
        self, sample_collection: SampleCollection[T]
    ) -> SampleCollection[T]:
        """Create a sample collection from the batch"""
