"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from typing import (
    Callable,
    Generic,
    Iterator,
    List,
    Literal,
    Optional,
    Tuple,
    TypeVar,
    Union,
)

import bson


import fiftyone.core.map.batcher as fomb
from fiftyone.core.map.typing import SampleCollection


T = TypeVar("T")
R = TypeVar("R")


class Mapper(Generic[T], abc.ABC):
    """Base class for mapping samples in parallel"""

    def __init__(
        self,
        sample_collection: SampleCollection[T],
        workers: Optional[int] = None,
        batch_method: Optional[str] = None,
        # kwargs are for sub-classes that have extra parameters
        **kwargs,  # pylint:disable=unused-argument
    ):
        if workers is None:
            workers = 1

        self._sample_collection = sample_collection
        self._workers = workers
        self._batch_method = batch_method or fomb.SampleBatcher.default()

    @property
    def batch_method(self) -> str:
        """Number of workers"""
        return self._batch_method

    @property
    def workers(self) -> int:
        """Number of workers"""
        return self._workers

    @abc.abstractmethod
    def _map_samples_parallel(
        self,
        sample_batches: List[fomb.SampleBatch],
        map_fcn: Callable[[T], R],
        progress: Union[bool, Literal["workers"]],
        save: bool = False,
    ):
        """Applies map function to each sample batch and returns an iterator
          of the results.

        Args:
            sample_batches (List[fomb.SampleBatch]): The sample batches to map.
            map_fcn (Callable[[T], R]): The map function to apply to each
              sample.
            progress (Union[bool, Literal[&quot;workers&quot;]]): Whether or
              not and how to render progress.
            save (bool, optional): Whether to save mutated samples mutated in
              the map function. Defaults to False.

        Yields:
            Iterator[Tuple[bson.ObjectId, R]]: The sample ID and the result of
              the map function for the sample.
        """

    def map_samples(
        self,
        map_fcn: Callable[[T], R],
        save: bool = False,
        progress: Optional[Union[bool, Literal["workers"]]] = None,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        """Applies map function to each sample and returns an iterator of the
        results.

        Args:
            map_fcn (Callable[[T], R]): The map function to apply to each
              sample.
            progress (Union[bool, Literal[&quot;workers&quot;]]): Whether or
              not and how to render progress.
            save (bool, optional): Whether to save mutated samples mutated in
              the map function. Defaults to False.

        Yields:
            Iterator[Tuple[bson.ObjectId, R]]: The sample ID and the result of
              the map function for the sample.
        """
        if self._workers <= 1:
            for sample in self._sample_collection.iter_samples(
                progress=progress, autosave=save
            ):
                result = map_fcn(sample)
                yield sample.id, result
        else:
            batches = fomb.SampleBatcher.split(
                self._batch_method, self._sample_collection, self._workers
            )

            yield from self._map_samples_parallel(
                batches,
                map_fcn,
                progress,
                save,
            )

    def update_samples(
        self,
        update_fcn: Callable[[T], None],
        progress: Optional[Union[bool, Literal["workers"]]] = None,
    ) -> None:
        """Applies an update function to each sample and save the mutated
        samples.

        Args:
            update_fcn (Callable[[T], None]): The update function to apply to
              each sample.
            progress (Union[bool, Literal[&quot;workers&quot;]]): Whether or
              not and how to render progress.
        """
        for _ in self.map_samples(update_fcn, progress=progress, save=True):
            ...
