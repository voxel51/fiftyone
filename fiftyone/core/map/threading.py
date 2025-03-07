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
    Any,
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
import numpy as np
from tqdm import tqdm

import fiftyone.core.utils as fou
import fiftyone.core.view as fov
import fiftyone.core.map.map as fomm
import fiftyone.core.map.sequential as foms


T = TypeVar("T")
R = TypeVar("R")


class ThreadingMapBackend(foms.SequentialMapBackend):
    """Executes map_samples with threading using iter_samples."""

    def __init__(self, max_shard_size: Union[int, None] = None):
        self.__max_shard_size = (
            max_shard_size
            or fou.recommend_batch_size_for_value(
                bson.ObjectId(), max_size=100000
            )
        )

    def split_sample_collection(
        self,
        root_sample_collection: fomm.SampleCollection[T],
        num_workers: int,
        shard_method: Literal["id", "slice"],
        shard_size: Union[int, None] = None,
    ) -> list[tuple[fomm.SampleCollection[T], int]]:
        """Split a sample collection into multiple sample collections"""

        if shard_method == "slice":
            n = len(root_sample_collection)
        else:
            ids = root_sample_collection.values("id")
            n = len(ids)

        # Must cap size of select(ids) stages
        if shard_method == "id":
            if shard_size is not None:
                shard_size = min(shard_size, self.__max_shard_size)
            elif n > num_workers * self.__max_shard_size:
                shard_size = self.__max_shard_size

        if shard_size is not None:
            # Fixed size shards
            edges = list(range(0, n + 1, shard_size))
            if edges[-1] < n:
                edges.append(n)
        else:
            # Split collection into exactly `num_workers` shards
            edges = [int(round(b)) for b in np.linspace(0, n, num_workers + 1)]

        split = []
        for start, stop in zip(edges[:-1], edges[1:]):
            total = stop - start
            if shard_method == "slice":
                view = root_sample_collection[start:stop]
                split.append((view, total))
            else:
                view = fov.make_optimized_select_view(
                    root_sample_collection, ids[start:stop]
                )
                split.append((view, total))

        return split

    @staticmethod
    def sample_map_worker(
        sample_collection: fomm.SampleCollection[T],
        sample_count: int,
        batch_num: int,
        batch_count: int,
        q: queue.Queue,
        event: threading.Event,
        /,
        map_fcn: Callable[[T], R],
        save: bool,
        progress: bool,
    ):
        """Map samples"""

        samples = sample_collection.iter_samples(autosave=save)

        if progress:
            desc = f"Batch {batch_num:0{len(str(batch_count))}}/{batch_count}"
            samples = tqdm(
                samples, total=sample_count, desc=desc, position=batch_num
            )

        for sample in samples:
            result = map_fcn(sample)
            q.put((sample.id, result))

        event.set()

    def parallelize_samples(
        self,
        sample_collection: fomm.SampleCollection[T],
        map_fcn: Callable[[T], R],
        num_workers: Optional[int] = None,
        shard_method: str = "id",
        progress: Optional[bool] = None,
        save: Optional[bool] = None,
    ) -> Iterator[Any]:
        """Map samples in parallel"""

        if num_workers is None:
            # if fo.config.default_map_workers is not None:
            #     num_workers = fo.config.default_map_workers
            # else:
            num_workers = fou.recommend_process_pool_workers()

        if num_workers == 1:
            yield from super().map_samples(
                sample_collection,
                map_fcn,
                num_workers,
                shard_method,
                progress,
                save,
            )
            return

        sample_collections_and_counts = self.split_sample_collection(
            sample_collection, num_workers, shard_method
        )
        sample_collection_count = len(sample_collections_and_counts)

        q = queue.Queue()
        events: List[threading.Event] = []

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=sample_collection_count
        ) as executor:
            worker_progress = progress == "workers"
            for idx, (sample_collection, sample_count) in enumerate(
                sample_collections_and_counts
            ):
                events.append(threading.Event())
                executor.submit(
                    self.sample_map_worker,
                    sample_collection,
                    sample_count,
                    idx + 1,
                    sample_collection_count,
                    q,
                    events[-1],
                    map_fcn=map_fcn,
                    save=save,
                    progress=worker_progress,
                )

            def get_results(q, events):
                while True:
                    try:
                        yield q.get(timeout=0.1)
                    except queue.Empty:
                        events = [
                            event for event in events if not event.is_set()
                        ]

                        if events:
                            continue

                        break

            results = get_results(q, events)

            if progress is True:
                results = tqdm(
                    results,
                    total=sum(
                        count for _, count in sample_collections_and_counts
                    ),
                )

            yield from results

    def map_samples(
        self,
        sample_collection: fomm.SampleCollection[T],
        map_fcn: Callable[[T], R],
        num_workers: Optional[int] = None,
        shard_method: str = Literal["id", "slice"],
        progress: Optional[bool] = None,
        save: Optional[bool] = None,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        yield from self.parallelize_samples(
            sample_collection,
            map_fcn,
            num_workers,
            shard_method,
            progress,
            save,
        )

    def update_samples(
        self,
        sample_collection: fomm.SampleCollection[T],
        update_fcn: Callable[[T], None],
        num_workers: Optional[int] = None,
        shard_method: str = Literal["id", "slice"],
        progress: Optional[bool] = None,
    ) -> None:
        for _ in self.parallelize_samples(
            sample_collection,
            update_fcn,
            num_workers,
            shard_method,
            progress,
            True,
        ):
            ...
