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
        batch_method: Literal["id", "slice"] = "id",
        **kwargs,
    ):
        # Check if running in sub-process and if so limit "workers" to 1.
        if workers is None:
            # TODO: Using recommended process pool workers for now. There's
            #  a opportunity to determine a better default for threads.
            workers = fou.recommend_process_pool_workers()

        super().__init__(sample_collection, workers, batch_method, **kwargs)

    @staticmethod
    def __worker(
        sample_collection: SampleCollection[T],
        sample_count: int,
        batch_number: int,
        batch_count: int,
        q: queue.Queue,
        event: threading.Event,
        map_fcn: Callable[[T], R],
        save: bool,
        progress: bool,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        samples = sample_collection.iter_samples(autosave=save)

        if progress:
            desc = (
                f"Batch {batch_number:0{len(str(batch_count))}}/{batch_count}"
            )
            samples = tqdm(
                samples, total=sample_count, desc=desc, position=batch_number
            )

        for sample in samples:
            result = map_fcn(sample)
            q.put((sample.id, result))

        event.set()

    def _map_samples_parallel(
        self,
        sample_batches: List[fomb.SampleBatch],
        map_fcn: Callable[[T], R],
        progress: Union[bool, Literal["workers"]],
        save: bool = False,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        q = queue.Queue()
        events: List[threading.Event] = []

        batch_count = len(sample_batches)
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=batch_count
        ) as executor:
            worker_progress = progress == "workers"

            for idx, batch in enumerate(sample_batches):
                batch_number = idx + 1

                event = threading.Event()
                events.append(event)

                executor.submit(
                    self.__worker,
                    batch.create_subset(self._sample_collection),
                    batch.total,
                    batch_number,
                    batch_count,
                    q,
                    event,
                    map_fcn,
                    save,
                    worker_progress,
                )

            def get_results(q, events):
                while True:
                    try:
                        yield q.get(timeout=0.1)
                    except queue.Empty:
                        events = [e for e in events if not e.is_set()]
                        if not events:
                            break

            results = get_results(q, events)
            if progress is True:
                results = tqdm(
                    results, total=sum(batch.total for batch in sample_batches)
                )

            yield from results
