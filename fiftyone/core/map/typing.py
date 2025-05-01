"""
Miscellaneous types

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Iterator, List, Literal, Protocol, TypeVar

import bson


T = TypeVar("T")
R = TypeVar("R")


class SampleCollection(Protocol[T]):
    """Type for sample collection"""

    def iter_samples(self, *args, **kwargs) -> Iterator[T]:
        """iter_samples"""

    def values(
        self, key: Literal["id"], _enforce_natural_order: bool = False
    ) -> List[bson.ObjectId]:
        """values"""
