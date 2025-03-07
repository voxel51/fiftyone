"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from typing import (
    Callable,
    Iterator,
    List,
    Literal,
    Optional,
    Protocol,
    Tuple,
    TypeVar,
)

import bson

T = TypeVar("T")
R = TypeVar("R")


class SampleCollection(Protocol[T]):
    """Type for sample collection"""

    def iter_samples(self, *args, **kwargs) -> Iterator[T]:
        """iter_samples"""

    def values(self, key: Literal["id"]) -> List[bson.ObjectId]:
        """values"""


class MapBackend(abc.ABC):
    """Abstract base class for execution backends used in map_samples."""

    @abc.abstractmethod
    def map_samples(
        self,
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[T], R],
        num_workers: Optional[int] = None,
        shard_method: str = Literal["id", "slice"],
        progress: Optional[bool] = None,
        save: bool = False,
        queue_batch_size: int = 1,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        """
        Applies `map_fcn` to each sample and returns an iterator over the
        results.

        Returns:
            Iterator[Tuple[bson.ObjectId, R]]: An iterator that yields
            processed sample results.
        """

    @abc.abstractmethod
    def update_samples(
        self,
        sample_collection: SampleCollection[T],
        update_fcn: Callable[[T], None],
        num_workers: Optional[int] = None,
        shard_method: str = Literal["id", "slice"],
        progress: Optional[bool] = None,
    ):
        """
        Applies `update_fcn` to each sample.
        """
