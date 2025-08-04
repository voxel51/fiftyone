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
    Iterable,
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
import fiftyone.core.utils as fou
from fiftyone.core.map.typing import SampleCollection

T = TypeVar("T")  # Sample type
R = TypeVar("R")  # Return value type of map_fcn
U = TypeVar("U")  # Return value type of iter_fcn if set - must be same as input type to map_fcn.


logger = logging.getLogger(__name__)


def check_if_return_is_sample(
    sample_collection: SampleCollection[T], map_fcn: Callable[[T], R]
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


def _get_default_sample_iter(*, save: bool):
    def inner(
        sample_collection: SampleCollection[T],
    ) -> Iterator[Tuple[bson.ObjectId, U]]:
        for sample in sample_collection.iter_samples(autosave=save):
            yield sample.id, sample

    return inner


class Mapper(abc.ABC):
    """Base class for mapping samples in parallel"""

    def __init__(
        self,
        batch_cls: Type[fomb.SampleBatch],
        num_workers: int,
        batch_size: Optional[int] = None,
        default_progress: Optional[bool] = None,
    ):
        self._num_workers = num_workers
        self._batch_cls = batch_cls
        self._batch_size = batch_size
        self._default_progress = default_progress

    @classmethod
    def create(
        cls,
        *,
        # pylint:disable-next=unused-argument
        config: focc.FiftyOneConfig,
        batch_cls: Type[fomb.SampleBatch],
        num_workers: Optional[int] = None,
        batch_size: Optional[int] = None,
        # pylint:disable-next=unused-argument
        **__,
    ):
        """Create a new mapper instance"""
        return cls(
            batch_cls, num_workers, batch_size, config.show_progress_bars
        )

    @property
    def num_workers(self) -> int:
        """Number of workers to use"""
        return self._num_workers

    @property
    def batch_size(self) -> Optional[int]:
        """Number of samples per worker batch"""
        return self._batch_size

    def map_samples(
        self,
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[Union[T, U]], R],
        *,
        iter_fcn: Optional[
            Callable[[SampleCollection[T]], Iterable[Tuple[bson.ObjectId, U]]]
        ] = None,
        progress: Optional[Union[bool, Literal["workers"]]] = None,
        save: bool = False,
        skip_failures: bool = True,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        """Applies map function to each sample and returns an iterator of the
        results.

        Args:
            sample_collection (SampleCollection[T]): The sample collection to
              map.
            map_fcn (Callable[[Union[T, U]], R]): The map function to apply to
                each sample.
            iter_fcn (Callable[[T], U]): The function to iterate over the
                sample collection. If not provided the iteration function
                used is `iter_samples`.
            progress (Union[bool, Literal["workers"]]): Whether or
              not and how to render progress.
            save (bool, optional): Whether to save mutated samples mutated in
              the map function. Only valid when using the `iter_fcn` is None.
              Defaults to False.
            skip_failures (bool, optional): Whether to gracefully continue
              without raising an error if the map function raises an exception
              for a sample. Defaults to True.

        Yields:
            Iterator[Tuple[bson.ObjectId, R]]: The sample ID and the result of
              the map function for the sample.
        """
        if progress is None:
            progress = self._default_progress

        if iter_fcn is None:
            iter_fcn = _get_default_sample_iter(save=save)
            # TODO: consider adding this check back in lazily, so that we do not
            #  have to create a full view iterator up front just to validate the
            #  function return type.
            # if check_if_return_is_sample(sample_collection, map_fcn):
            #     raise ValueError("`map_fcn` should not return Samples objects.")
        else:
            if save is True:
                logger.warning("Unable to save when `iter_fcn` is provided")
                
        


        yield from self._map_samples(
            sample_collection,
            iter_fcn,
            map_fcn,
            progress=progress,
            skip_failures=skip_failures,
        )

    @abc.abstractmethod
    def _map_samples(
        self,
        sample_collection: SampleCollection[T],
        iter_fcn: Callable[
            [SampleCollection[T]], Iterable[Tuple[bson.ObjectId, U]]
        ],
        map_fcn: Callable[[U], R],
        *,
        progress: Union[bool, Literal["workers"], None],
        skip_failures: bool,
    ) -> Iterator[
        Tuple[bson.ObjectId, Union[Exception, None], Union[R, None]]
    ]:
        """Applies map function to each sample and returns an iterator
        of the results."""


class LocalMapper(Mapper, abc.ABC):
    """Base class for mapping samples in parallelizing on the same machine"""

    @abc.abstractmethod
    def _map_samples_multiple_workers(
        self,
        sample_collection: SampleCollection[T],
        iter_fcn: Callable[
            [SampleCollection[T]], Iterable[Tuple[bson.ObjectId, U]]
        ],
        map_fcn: Callable[[U], R],
        *,
        progress: Union[bool, Literal["workers"], None],
        skip_failures: bool,
    ) -> Iterator[
        Tuple[bson.ObjectId, Union[Exception, None], Union[R, None]]
    ]:
        """Applies map function to each sample (in parallel) and returns an
        iterator of the results.
        """

    def _map_samples_one_worker(
        self,
        sample_collection: SampleCollection[T],
        iter_fcn: Callable[
            [SampleCollection[T]], Iterable[Tuple[bson.ObjectId, U]]
        ],
        map_fcn: Callable[[U], R],
        *,
        progress: Union[bool, Literal["workers"], None],
    ) -> Iterator[
        Tuple[bson.ObjectId, Union[Exception, None], Union[R, None]]
    ]:
        """Applies map function to each sample (in serial) and returns an
        iterator of the results.
        """

        pb = fou.ProgressBar(
            total=len(sample_collection),
            # One worker means show the progress bar if there is a valid value
            progress=progress in (True, "workers"),
        )

        for sample_id, sample in iter_fcn(sample_collection):
            try:
                yield sample_id, None, map_fcn(sample)
            except Exception as err:

                yield sample_id, err, None
            finally:
                pb.update()

    def _map_samples(
        self,
        sample_collection: SampleCollection[T],
        iter_fcn: Callable[
            [SampleCollection[T]], Iterable[Tuple[bson.ObjectId, U]]
        ],
        map_fcn: Callable[[U], R],
        *,
        progress: Union[bool, Literal["workers"], None],
        skip_failures: bool,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        map_iter = (
            self._map_samples_one_worker(
                sample_collection, iter_fcn, map_fcn, progress=progress
            )
            # If the number of workers is 1, no need for the overhead of
            # trying to parallelize.
            if self._num_workers <= 1
            else self._map_samples_multiple_workers(
                sample_collection,
                iter_fcn,
                map_fcn,
                progress=progress,
                skip_failures=skip_failures,
            )
        )

        for sample_id, err, res in map_iter:
            if err is not None:
                if not skip_failures:
                    raise err

                logger.warning(
                    "Sample failure: %s\nError: %s\n", sample_id, err
                )
                continue

            yield sample_id, res
