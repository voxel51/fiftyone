"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import List, Optional, TypeVar

import fiftyone.core.map.batcher.base as fomb
from fiftyone.core.map.typing import SampleCollection

T = TypeVar("T")


class SampleSliceBatch(fomb.SampleBatcher, fomb.SampleBatch):
    """Sample batch using slices"""

    @classmethod
    # pylint:disable-next=arguments-differ
    def split(
        cls,
        sample_collection: SampleCollection[T],
        num_workers: int,
        batch_size: Optional[int] = None,
    ) -> List["SampleSliceBatch"]:
        return [
            cls(start_idx, stop_idx)
            for start_idx, stop_idx in cls._get_sample_collection_indexes(
                sample_collection, num_workers, batch_size
            )
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
