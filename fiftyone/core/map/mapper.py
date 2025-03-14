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
    def _map_sample_batches(
        self,
        sample_batches: List[fomb.SampleBatch],
        map_fcn: Callable[[T], R],
        /,
        progress: Union[bool, Literal["workers"]],
        save: bool,
        halt_on_error: bool,
    ) -> Iterator[Tuple[bson.ObjectId, Union[R, Exception]]]:
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
            halt_on_error (bool, optional): Whether to gracefully continue
              without raising an error if the map function raises an exception
              for a sample. Defaults to True.

        Yields:
            Iterator[Tuple[bson.ObjectId, R]]: The sample ID and the result of
              the map function for the sample.
        """

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
        if self._workers <= 1:
            for sample in self._sample_collection.iter_samples(
                progress=progress, autosave=save
            ):
                try:
                    result = map_fcn(sample)
                except Exception as err:
                    if not skip_failures:
                        raise err

                    logger.warning(
                        "Sample failure: %s\nError: %s\n", sample.id, err
                    )
                else:
                    # Only not yield samples that have a valid result
                    yield sample.id, result
        else:
            batches = fomb.SampleBatcher.split(
                self._batch_method,
                self._sample_collection,
                self._workers,
            )

            error: Union[Exception, None] = None
            for sample_id, result in self._map_sample_batches(
                batches,
                map_fcn,
                progress=progress,
                save=save,
                halt_on_error=skip_failures,
            ):
                if isinstance(result, Exception):
                    if skip_failures:
                        logger.warning(
                            "Sample failure: %s\nError: %s\n",
                            sample_id,
                            result,
                        )
                    # It is possible for a worker to raise an error after an
                    # initial error was already encountered. There might be a
                    # better way to handle this in the future but for now it is
                    # ignored, and the initial error will be raised after
                    # exhausting the remaining valid sample results.
                    elif error is None:
                        error = result

                else:
                    # Only not yield samples that have a valid result
                    yield sample_id, result

            if error:
                raise error
