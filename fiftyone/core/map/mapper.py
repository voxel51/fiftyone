"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
import logging
from typing import (
    Callable,
    Iterator,
    Literal,
    Optional,
    Tuple,
    TypeVar,
    Type,
    Union,
)

import bson


import fiftyone.core.config as focc
import fiftyone.core.map.batcher as fomb
import fiftyone.core.sample as fos
from fiftyone.core.map.typing import SampleCollection

T = TypeVar("T")
R = TypeVar("R")


logger = logging.getLogger(__name__)


def check_if_return_is_sample(
    sample_collection: SampleCollection[T],
    map_fcn: Callable[[T], R],
) -> bool:
    """
    Check if the map function returns a sample
    """

    first_sample = sample_collection.first()
    if first_sample is None:
        raise ValueError("Sample collection is empty")

    # make a copy outside of the db
    sample_copy = first_sample.copy()

    # run the map function on just the copy
    # if it returns a Sample object
    if isinstance(map_fcn(sample_copy), fos.Sample):
        return True

    return False


class Mapper(abc.ABC):
    """Base class for mapping samples in parallel"""

    def __init__(
        self,
        batch_cls: Type[fomb.SampleBatch],
        num_workers: int,
        batch_size: Optional[int] = None,
    ):
        self._num_workers = num_workers
        self._batch_cls = batch_cls
        self._batch_size = batch_size

    @classmethod
    @abc.abstractmethod
    def create(
        cls,
        *,
        # pylint:disable-next=unused-argument
        config: focc.FiftyOneConfig,
        batch_cls: Type[fomb.SampleBatch],
        num_workers: Optional[int] = None,
        # pylint:disable-next=unused-argument
        **__,
    ):
        """Create a new mapper instance"""

    @property
    def num_workers(self) -> int:
        """Number of workers to use"""
        return self._num_workers

    @property
    def batch_size(self) -> Optional[int]:
        """Number of samples per worker batch"""
        return self._batch_size

    @abc.abstractmethod
    def _map_samples(
        self,
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[T], R],
        *,
        progress: Optional[Union[bool, Literal["workers"]]],
        save: bool,
        skip_failures: bool,
    ) -> Iterator[
        Tuple[bson.ObjectId, Union[Exception, None], Union[R, None]]
    ]:
        """Applies map function to each sample batch and returns an iterator
          of the results.

        Args:
            sample_collection (SampleCollection[T]): The sample collection to
              map.
            map_fcn (Callable[[T], R]): The map function to apply to each
              sample.
            progress (Union[bool, Literal["workers"]]): Whether or
              not and how to render progress.
            save (bool, optional): Whether to save mutated samples mutated in
              the map function. Defaults to False.
            skip_failures (bool, optional): Whether to gracefully continue
              without raising an error if the map function raises an exception
              for a sample. Defaults to True.

        Yields:
            MapSampleBatchesReturnType: The sample ID, the exception raised
              (if any), and the result of the map function for the sample
              (if no exception).
        """

    @staticmethod
    def _handle_map_error(
        sample_id: bson.ObjectId, err: Exception, skip_failures: bool
    ):
        """Common error handling when a map error occurs"""

        if not skip_failures:
            raise err

        logger.warning("Sample failure: %s\nError: %s\n", sample_id, err)

    def map_samples(
        self,
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[T], R],
        *,
        progress: Optional[Union[bool, Literal["workers"]]] = None,
        save: bool = False,
        skip_failures: bool = True,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        """Applies map function to each sample and returns an iterator of the
        results.

        Args:
            sample_collection (SampleCollection[T]): The sample collection to
              map.
            map_fcn (Callable[[T], R]): The map function to apply to each
              sample.
            progress (Union[bool, Literal["workers"]]): Whether or
              not and how to render progress.
            save (bool, optional): Whether to save mutated samples mutated in
              the map function. Defaults to False.
            skip_failures (bool, optional): Whether to gracefully continue
              without raising an error if the map function raises an exception
              for a sample. Defaults to True.

        Yields:
            Iterator[Tuple[bson.ObjectId, R]]: The sample ID and the result of
              the map function for the sample.
        """

        # TODO: consider adding this check back in lazily, so that we do not
        #  have to create a full view iterator up front just to validate the
        #  function return type.
        # if check_if_return_is_sample(sample_collection, map_fcn):
        #     raise ValueError("`map_fcn` should not return Samples objects.")

        yield from self._map_samples(
            sample_collection,
            map_fcn,
            progress=progress,
            save=save,
            skip_failures=skip_failures,
        )


class LocalMapper(Mapper, abc.ABC):
    """Base class for mapping samples in parallelizing on the same machine"""

    @abc.abstractmethod
    def _map_samples_multiple_workers(
        self,
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[T], R],
        *,
        progress: Optional[Union[bool, Literal["workers"]]],
        save: bool,
        skip_failures: bool,
    ) -> Iterator[
        Tuple[bson.ObjectId, Union[Exception, None], Union[R, None]]
    ]:
        """Applies map function to each sample batch and returns an iterator
          of the results.

        Args:
            sample_collection (SampleCollection[T]): The sample collection to
              map.
            map_fcn (Callable[[T], R]): The map function to apply to each
              sample.
            progress (Union[bool, Literal["workers"]]): Whether or
              not and how to render progress.
            save (bool, optional): Whether to save mutated samples mutated in
              the map function. Defaults to False.
            skip_failures (bool, optional): Whether to gracefully continue
              without raising an error if the map function raises an exception
              for a sample. Defaults to True.

        Yields:
            MapSampleBatchesReturnType: The sample ID, the exception raised
              (if any), and the result of the map function for the sample
              (if no exception).
        """

    def _map_samples(
        self,
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[T], R],
        *,
        progress: Optional[Union[bool, Literal["workers"]]] = None,
        save: bool = False,
        skip_failures: bool = True,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        # If the number of workers is 1, no need for the overhead of trying to
        # parallelize.
        if self._num_workers <= 1:
            for sample in sample_collection.iter_samples(
                progress=progress, autosave=save
            ):
                try:
                    res = map_fcn(sample)
                except Exception as err:
                    self._handle_map_error(sample.id, err, skip_failures)
                else:
                    yield sample.id, res
            return

        for sample_id, err, res in self._map_samples_multiple_workers(
            sample_collection,
            map_fcn,
            progress=progress,
            save=save,
            skip_failures=skip_failures,
        ):
            if err is not None:
                self._handle_map_error(sample_id, err, skip_failures)
            else:
                yield sample_id, res
