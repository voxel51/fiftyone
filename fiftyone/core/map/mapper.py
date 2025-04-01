"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
import functools
import logging
from typing import Callable, Iterator, Literal, Optional, Tuple, TypeVar, Union

import bson


import fiftyone.core.config as focc
import fiftyone.core.map.batcher as fomb
import fiftyone.core.sample as fos
from fiftyone.core.map.typing import SampleCollection

T = TypeVar("T")
R = TypeVar("R")


logger = logging.getLogger(__name__)


@functools.lru_cache
def check_if_return_is_sample(
    sample_collection: SampleCollection[T],
    map_fcn: Callable[[T], R],
) -> bool:
    """
    Check if the map function returns a sample and raise if it does not
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


class Mapper:
    """Base class for mapping samples in parallel"""

    @staticmethod
    def __validate_map_samples(func):
        """Validate map_samples arguments for all subclasses"""

        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Iterator[Tuple[bson.ObjectId, R]]:
            sample_collection, map_fcn = args[1], args[2]

            if check_if_return_is_sample(sample_collection, map_fcn):
                raise ValueError(
                    "`map_fcn` should not return Samples objects."
                )

            return func(*args, **kwargs)

        return wrapper

    def __init_subclass__(cls):
        # Add map_samples validation decorator to all subclasses
        cls.map_samples = cls.__validate_map_samples(cls.map_samples)

    def __init__(self, batcher: fomb.SampleBatcher, workers: int):
        self._workers = workers
        self._batcher = batcher

    @classmethod
    def create(
        cls,
        *_,
        # pylint:disable-next=unused-argument
        config: focc.FiftyOneConfig,
        batcher: fomb.SampleBatcher,
        # pylint:disable-next=unused-argument
        workers: Optional[int] = None,
        **__,
    ):
        """Create a new mapper instance"""

        # Defaults to one worker in base implementation.
        return cls(batcher, 1)

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
        *_,
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

        # Iterate sequentially in base implementation.
        for sample in sample_collection.iter_samples(
            progress=progress, autosave=save
        ):
            try:
                res = map_fcn(sample)
            except Exception as err:
                self._handle_map_error(sample.id, err, skip_failures)
            else:
                yield sample.id, res


class LocalMapper(Mapper, abc.ABC):
    """Base class for mapping samples in parallelizing on the same machine"""

    @abc.abstractmethod
    def _map_samples(
        self,
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[T], R],
        *_,
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
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[T], R],
        *_,
        progress: Optional[Union[bool, Literal["workers"]]] = None,
        save: bool = False,
        skip_failures: bool = True,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        # If workers if 1 on a the same local machine, no need for the
        # overhead of trying to parallelize.
        if self._workers <= 1:
            yield from super().map_samples(
                sample_collection,
                map_fcn,
                progress=progress,
                save=save,
                skip_failures=skip_failures,
            )
            return

        for sample_id, err, res in self._map_samples(
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
