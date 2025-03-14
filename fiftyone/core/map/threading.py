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
    TypeVar,
    Union,
)

import bson
from tqdm import tqdm

import fiftyone.core.utils as fou
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm

from fiftyone.core.map.typing import SampleCollection


T = TypeVar("T")
R = TypeVar("R")


class ThreadMapper(fomm.Mapper[T]):
    """Executes map_samples with threading using iter_samples."""

    def __init__(
        self,
        sample_collection: SampleCollection[T],
        workers: Optional[int] = None,
        batch_method: Optional[str] = None,
        **kwargs,
    ):
        if workers is None:
            # TODO: Using recommended process pool workers for now. There's
            # a opportunity to determine a better default for threads.
            workers = fou.recommend_process_pool_workers()

        super().__init__(sample_collection, workers, batch_method, **kwargs)

    @staticmethod
    def __worker(
        *_,
        sample_iter: Iterator[T],
        q: queue.Queue[Tuple[bson.ObjectId, Union[T, Exception]]],
        done_event: threading.Event,
        err_event: threading.Event,
        map_fcn: Callable[[T], R],
        halt_on_error: bool,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        try:
            while not err_event.is_set() and (
                sample := next(sample_iter, None)
            ):
                try:
                    result = map_fcn(sample)
                except Exception as err:
                    if halt_on_error:
                        err_event.set()

                    q.put((sample.id, err))

                    if halt_on_error:
                        break
                else:
                    q.put((sample.id, result))
        finally:
            done_event.set()

    def _map_samples_parallel(
        self,
        sample_batches: List[fomb.SampleBatch],
        map_fcn: Callable[[T], R],
        /,
        progress: Union[bool, Literal["workers"]],
        save: bool,
        halt_on_error: bool,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        # Global synchronization primitives
        q: queue.Queue[Tuple[bson.ObjectId, Union[T, Exception]]] = (
            queue.Queue()
        )
        done_events: List[threading.Event] = []
        err_event = threading.Event()

        count = len(sample_batches)
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=count
        ) as executor:
            for idx, batch in enumerate(sample_batches):
                # Batch number (index starting at 1)
                i = idx + 1

                # Worker specific synchronization primitives
                done_event = threading.Event()
                done_events.append(done_event)

                sample_collection = batch.create_subset(
                    self._sample_collection
                )
                sample_iter = sample_collection.iter_samples(autosave=save)

                # This is for a per-worker progress bar.
                if progress == "workers":
                    desc = f"Batch {i:0{len(str(count))}}/{count}"

                    sample_iter = tqdm(
                        sample_iter, total=batch.total, desc=desc, position=i
                    )

                executor.submit(
                    self.__worker,
                    sample_iter=sample_iter,
                    q=q,
                    done_event=done_event,
                    err_event=err_event,
                    map_fcn=map_fcn,
                    halt_on_error=halt_on_error,
                )

            # Iterate over queue until an error occurs of all threads are
            # finished.
            def get_results(
                q: queue.Queue[Tuple[bson.ObjectId, Union[T, Exception]]],
                done_events: List[threading.Event],
            ) -> Iterator[R]:
                while True:
                    try:
                        sample_id, result = q.get(timeout=0.1)
                    except queue.Empty:
                        done_events = [
                            e for e in done_events if not e.is_set()
                        ]

                        if not done_events:
                            break

                    yield sample_id, result

            results = get_results(q, done_events)

            # This is for the global progress bar.
            if progress is True:
                results = tqdm(
                    results, total=sum(batch.total for batch in sample_batches)
                )

            yield from results
