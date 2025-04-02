"""
Threading mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import concurrent.futures
import queue
import threading
from typing import (
    Callable,
    Iterator,
    List,
    Literal,
    Optional,
    Tuple,
    Type,
    TypeVar,
    Union,
)

import bson
from tqdm import tqdm

import fiftyone.core.config as focc
import fiftyone.core.utils as fou
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm

from fiftyone.core.map.typing import SampleCollection


T = TypeVar("T")
R = TypeVar("R")

ResultQueue = queue.Queue[
    Tuple[bson.ObjectId, Union[Exception, None], Union[R, None]]
]


class ThreadMapper(fomm.LocalMapper):
    """Executes map_samples with threading using iter_samples."""

    @classmethod
    def create(
        cls,
        *_,
        config: focc.FiftyOneConfig,
        batch_cls: Type[fomb.SampleBatch],
        workers: Optional[int] = None,
        **__,
    ):
        if workers is None:
            workers = (
                config.default_thread_pool_workers
                or fou.recommend_thread_pool_workers()
            )

        if config.max_thread_pool_workers is not None:
            workers = min(workers, config.max_thread_pool_workers)

        return cls(batch_cls, workers)

    @staticmethod
    def __worker(
        *_,
        cancel_event: threading.Event,
        result_queue: ResultQueue[R],
        map_fcn: Callable[[T], R],
        sample_iter: Iterator[T],
        skip_failures: bool,
        worker_done_event: threading.Event,
    ) -> Iterator[Tuple[bson.ObjectId, Union[Exception, None], R]]:

        try:
            while not cancel_event.is_set() and (
                sample := next(sample_iter, None)
            ):
                try:
                    result = map_fcn(sample)
                except Exception as err:
                    if skip_failures:
                        # Cancel other workers as soon as possible.
                        cancel_event.set()

                    # Add sample ID and error to the queue.
                    result_queue.put((sample.id, err, None))

                    if skip_failures:
                        break
                else:
                    # Add sample ID and result to the queue.
                    result_queue.put((sample.id, None, result))
        finally:
            worker_done_event.set()

    def _map_samples_multiple_workers(
        self,
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[T], R],
        *_,
        progress: Union[bool, Literal["workers"]],
        save: bool,
        skip_failures: bool,
    ) -> Iterator[Tuple[bson.ObjectId, Union[Exception, None], R]]:
        # Global synchronization primitives
        result_queue: ResultQueue = queue.Queue()
        worker_done_events: List[threading.Event] = []
        cancel_event = threading.Event()

        sample_batches = self._batch_cls.split(
            sample_collection, self._workers
        )

        count = len(sample_batches)
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=count
        ) as executor:
            for idx, batch in enumerate(sample_batches):
                # Batch number (index starting at 1)
                i = idx + 1

                # Worker specific synchronization primitives
                worker_done_event = threading.Event()
                worker_done_events.append(worker_done_event)

                sample_collection = batch.create_subset(sample_collection)
                sample_iter = sample_collection.iter_samples(autosave=save)

                # This is for a per-worker progress bar.
                if progress == "workers":
                    desc = f"Batch {i:0{len(str(count))}}/{count}"

                    sample_iter = tqdm(
                        sample_iter, total=batch.total, desc=desc, position=i
                    )

                executor.submit(
                    self.__worker,
                    cancel_event=cancel_event,
                    map_fcn=map_fcn,
                    result_queue=result_queue,
                    sample_iter=sample_iter,
                    skip_failures=skip_failures,
                    worker_done_event=worker_done_event,
                )

            # Iterate over queue until an error occurs of all threads are
            # finished.
            def get_results(
                q: ResultQueue[R], evts: List[threading.Event]
            ) -> Iterator[R]:
                sample_errors: List[Tuple[bson.ObjectId, Exception, None]] = []

                # Initialize backoff parameters
                initial_timeout = 0.1
                max_timeout = 5.0
                backoff_factor = 2
                current_timeout = initial_timeout

                while True:
                    try:
                        sample_id, err, result = q.get(timeout=current_timeout)
                        # Reset backoff on successful get
                        current_timeout = initial_timeout
                    except queue.Empty:
                        # Apply exponential backoff, but cap at max_timeout
                        current_timeout = min(
                            current_timeout * backoff_factor, max_timeout
                        )

                        # Reset backoff if we've hit too many consecutive
                        # timeouts This prevents getting stuck with very
                        # long timeouts
                        if current_timeout == max_timeout:
                            current_timeout = initial_timeout

                        if not (evts := [e for e in evts if not e.is_set()]):
                            break
                    else:
                        # An error was raised in the map_fcn for a sample.
                        if err is not None:
                            # When skipping failures, simply yield the the
                            # sample ID and the error.
                            if skip_failures:
                                yield sample_id, err, None
                            # When NOT skipping failures, aggregate any errors
                            # to allow for all successfully mapped samples from
                            # the various workers to be yielded first.
                            else:
                                sample_errors.append((sample_id, err, None))
                        else:
                            # Yield successfully mapped sample
                            yield sample_id, None, result

                # It is possible to aggregate one error per worker. There
                # might be a better way to handle this in the future but for
                # now, return the first error seen.
                if sample_errors:
                    yield sample_errors[0]

            results = get_results(result_queue, worker_done_events)

            # This is for the global progress bar.
            if progress is True:
                results = tqdm(
                    results, total=sum(batch.total for batch in sample_batches)
                )

            yield from results
