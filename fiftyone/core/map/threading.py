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
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm
import fiftyone.core.utils as fou
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
        *,
        config: focc.FiftyOneConfig,
        batch_cls: Type[fomb.SampleBatch],
        num_workers: Optional[int] = None,
        batch_size: Optional[int] = None,
        **__,
    ):
        if num_workers is None:
            num_workers = (
                config.default_thread_pool_workers
                or fou.recommend_thread_pool_workers()
            )

        if config.max_thread_pool_workers is not None:
            num_workers = min(num_workers, config.max_thread_pool_workers)

        return cls(batch_cls, num_workers, batch_size)

    @staticmethod
    def __worker(
        *,
        cancel_event: threading.Event,
        result_queue: ResultQueue[R],
        map_fcn: Callable[[T], R],
        sample_iter: Iterator[T],
        skip_failures: bool,
        worker_done_event: threading.Event,
        progress_bar: Optional[tqdm] = None,
    ) -> None:

        try:
            while not cancel_event.is_set() and (
                sample := next(sample_iter, None)
            ):
                try:
                    if progress_bar:
                        progress_bar.update(1)
                    result = map_fcn(sample)
                except Exception as err:
                    # Add sample ID and error to the queue.
                    result_queue.put((sample.id, err, None))

                    if not skip_failures:
                        # Cancel other workers as soon as possible.
                        cancel_event.set()
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
        *,
        progress: Union[bool, Literal["workers"], Callable],
        save: bool,
        skip_failures: bool,
    ) -> Iterator[Tuple[bson.ObjectId, Union[Exception, None], R]]:
        # Global synchronization primitives
        result_queue: ResultQueue = queue.Queue()
        worker_done_events: List[threading.Event] = []
        cancel_event = threading.Event()

        sample_batches = self._batch_cls.split(
            sample_collection, self.num_workers, self.batch_size
        )

        batch_count = len(sample_batches)

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=self.num_workers
        ) as executor:
            for idx, batch in enumerate(sample_batches):
                # Batch number (index starting at 1)
                i = idx + 1

                # Worker specific synchronization primitives
                worker_done_event = threading.Event()
                worker_done_events.append(worker_done_event)

                # Create a separate subset for this batch
                batch_collection = batch.create_subset(sample_collection)
                sample_iter = batch_collection.iter_samples(autosave=save)

                # This is for a per-worker progress bar.
                worker_progress_bar = None
                if progress == "workers":
                    desc = f"Batch {i:0{len(str(batch_count))}}/{batch_count}"
                    worker_progress_bar = tqdm(
                        total=batch.total,
                        desc=desc,
                        position=i,
                    )

                executor.submit(
                    self.__worker,
                    cancel_event=cancel_event,
                    map_fcn=map_fcn,
                    result_queue=result_queue,
                    sample_iter=sample_iter,
                    skip_failures=skip_failures,
                    worker_done_event=worker_done_event,
                    progress_bar=worker_progress_bar,
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
                        # An error was raised in the map_fcn for a sample
                        if err is not None:

                            # When skipping failures, simply yield the
                            # sample ID and the error.
                            if skip_failures:
                                yield sample_id, err, None
                            # When NOT skipping failures, aggregate any errors
                            # to allow for all successfully mapped samples from
                            # the various workers to be yielded first
                            else:
                                sample_errors.append((sample_id, err, None))
                        else:
                            # Yield successfully mapped sample
                            yield sample_id, None, result

                # It is possible to aggregate one error per worker. There
                # might be a better way to handle this in the future but for

                # now, return the first error seen
                if sample_errors:
                    yield sample_errors[0]

            if progress is True:
                with fou.ProgressBar(
                    total=sum(batch.total for batch in sample_batches),
                    progress=progress,
                ) as pb:
                    for result in get_results(
                        result_queue, worker_done_events
                    ):
                        pb.update()
                        yield result
            else:
                yield from get_results(result_queue, worker_done_events)
