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


logger = logging.getLogger(__name__)


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
    def map_samples(
        self,
        map_fcn: Callable[[T], R],
        /,
        progress: Optional[Union[bool, Literal["workers"]]] = None,
        save: bool = False,
        skip_failures: bool = True,
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
            skip_failures (bool, optional): Whether to gracefully continue
              without raising an error if the map function raises an exception
              for a sample. Defaults to True.

        Yields:
            Iterator[Tuple[bson.ObjectId, R]]: The sample ID and the result of
              the map function for the sample.
        """


MapSampleBatchesReturnType = Iterator[
    Tuple[bson.ObjectId, Union[Exception, None], Union[R, None]]
]


class LocalMapper(Mapper[T], Generic[T], abc.ABC):
    """Base class for mapping samples in parallelizing on the same machine"""

    @abc.abstractmethod
    def _map_sample_batches(
        self,
        sample_batches: List[fomb.SampleBatch],
        map_fcn: Callable[[T], R],
        /,
        progress: Union[bool, Literal["workers"]],
        save: bool,
        skip_failures: bool,
    ) -> MapSampleBatchesReturnType[R]:
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
            skip_failures (bool, optional): Whether to gracefully continue
              without raising an error if the map function raises an exception
              for a sample. Defaults to True.

        Yields:
            MapSampleBatchesReturnType: The sample ID, the exception raised
              (if any), and the result of the map function for the sample
              (if no exception).
        """

    def map_samples(
        self,
        map_fcn: Callable[[T], R],
        /,
        progress: Optional[Union[bool, Literal["workers"]]] = None,
        save: bool = False,
        skip_failures: bool = True,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        result_iter: MapSampleBatchesReturnType

        if self._workers <= 1:
            # If workers if 1 on a the same local machine, no need for the
            # overhead of trying to parallelize. If will not be beneficial.
            def wrapped_map_fcn(sample):
                try:
                    result = map_fcn(sample)
                except Exception as err:
                    return sample.id, err, None

                return sample.id, None, result

            result_iter = (
                wrapped_map_fcn(sample)
                for sample in self._sample_collection.iter_samples(
                    progress=progress, autosave=save
                )
            )

        else:
            result_iter = self._map_sample_batches(
                fomb.SampleBatcher.split(
                    self._batch_method,
                    self._sample_collection,
                    self._workers,
                ),
                map_fcn,
                progress=progress,
                save=save,
                skip_failures=skip_failures,
            )

        for sample_id, err, result in result_iter:
            if err is not None:
                if not skip_failures:
                    raise err

                logger.warning(
                    "Sample failure: %s\nError: %s\n", sample_id, result
                )
                continue

            # Only yield samples that have no exception.
            yield sample_id, result
