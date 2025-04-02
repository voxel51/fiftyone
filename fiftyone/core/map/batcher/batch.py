"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from typing import List, Optional, TypeVar


from fiftyone.core.map.typing import SampleCollection

T = TypeVar("T")


class SampleBatch(abc.ABC):
    """A sample batch"""

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
