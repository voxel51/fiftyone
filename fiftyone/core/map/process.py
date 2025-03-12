"""
Multiprocessing utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import multiprocessing
from queue import Empty
import time
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

import dill as pickle
import bson
from tqdm.auto import tqdm

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm
from fiftyone.core.map.typing import SampleCollection

fov = fou.lazy_import("fiftyone.core.view")


T = TypeVar("T")
R = TypeVar("R")


class ProcessMapper(fomm.Mapper[T]):
    """Executes map_samples using multiprocessing."""

    def __init__(
        self,
        sample_collection: SampleCollection[T],
        workers: Optional[int] = None,
        batch_method: Optional[str] = None,
        **kwargs,
    ):
        # Check if running in sub-process and if so limit "workers" to 1.
        if multiprocessing.current_process().daemon:
            workers = 1
        elif workers is None:
            workers = fou.recommend_process_pool_workers()

        super().__init__(sample_collection, workers, batch_method, **kwargs)

    def _map_samples_parallel(
        self,
        sample_batches: List[fomb.SampleBatch],
        map_fcn: Callable[[T], R],
        progress: Union[bool, Literal["workers"]],
        save: bool = False,
    ) -> Iterator[Tuple[bson.ObjectId, R]]:
        ctx = fou.get_multiprocessing_context()

        if progress is None:
            progress = fo.config.show_progress_bars

        if progress == "workers":
            worker_progress = True
            progress = False
            lock = ctx.RLock()
            tqdm.set_lock(lock)
        else:
            worker_progress = False
            lock = None

        queue = multiprocessing.Queue()
        batch_count = multiprocessing.Value("i", 0)
        sample_count = (
            multiprocessing.Value("i", 0) if progress is not False else None
        )

        # Extract information from sample collection.
        if isinstance(self._sample_collection, fov.DatasetView):
            # pylint:disable-next=protected-access
            dataset_name = self._sample_collection._root_dataset.name
            # pylint:disable-next=protected-access
            view_stages = self._sample_collection._serialize()
        else:
            dataset_name = self._sample_collection.name
            view_stages = None

        pool = ctx.Pool(
            processes=len(sample_batches),
            initializer=_init_worker,
            initargs=(
                dataset_name,
                view_stages,
                pickle.dumps(map_fcn),
                batch_count,
                sample_count,
                queue,
                save,
                worker_progress,
                lock,
            ),
        )

        pb = fou.ProgressBar(
            total=sum(batch.total for batch in sample_batches),
            progress=progress,
        )

        if queue is not None:
            return _do_map_samples(
                pool, pb, sample_batches, batch_count, queue
            )
        else:

            return _do_update_samples(
                pool, pb, sample_batches, batch_count, sample_count
            )


def _do_update_samples(
    pool: multiprocessing.Pool,  # type: ignore
    pb: fou.ProgressBar,
    batches: List[fomb.SampleBatch],
    batch_count: multiprocessing.Value,  # type: ignore
    sample_count: multiprocessing.Value,  # type: ignore
):
    num_batches = len(batches)

    with pool, pb:
        pool.map_async(_map_batch, batches)

        if batch_count is not None:
            while batch_count.value < num_batches:
                pb.set_iteration(sample_count.value)
                time.sleep(0.01)

            pb.set_iteration(sample_count.value)

        pool.close()
        pool.join()


def _do_map_samples(
    pool: multiprocessing.Pool,  # type: ignore
    pb: fou.ProgressBar,
    batches: List[fomb.SampleBatch],
    batch_count: multiprocessing.Value,  # type: ignore
    queue: multiprocessing.Queue,
):
    num_batches = len(batches)

    with pool, pb:
        pool.map_async(
            _map_batch,
            (
                (idx + 1, num_batches, batch)
                for idx, batch in enumerate(batches)
            ),
        )

        count = 0
        while True:
            try:
                result = queue.get(timeout=0.01)
                pb.update()
                yield result
                count += 1
            except Empty:
                if batch_count.value >= num_batches:
                    break

        queue.close()
        queue.join_thread()

        pool.close()
        pool.join()


def _init_worker(
    dataset_name: str,
    view_stages: Any,
    map_fcn: bytes,
    batch_count: Optional[multiprocessing.Value],  # type: ignore
    sample_count: Optional[multiprocessing.Value],  # type: ignore
    queue: Optional[multiprocessing.Queue],
    save: bool,
    progress: bool,
    lock: Optional[multiprocessing.RLock],  # type: ignore
):
    # pylint:disable=import-outside-toplevel
    # pylint:disable=reimported
    # pylint:disable=redefined-outer-name
    from tqdm.auto import tqdm

    import fiftyone as fo
    import fiftyone.core.odm.database as food
    import fiftyone.core.view as fov

    # pylint:disable=global-variable-undefined
    global process_sample_collection
    global process_map_fcn
    global process_batch_count
    global process_sample_count
    global process_queue
    global process_save
    global process_progress

    # Ensure that each process creates its own MongoDB clients
    # https://pymongo.readthedocs.io/en/stable/faq.html#using-pymongo-with-multiprocessing
    # pylint:disable-next=protected-access
    food._disconnect()

    dataset = fo.load_dataset(dataset_name)
    if view_stages:
        # pylint:disable-next=protected-access
        process_sample_collection = fov.DatasetView._build(
            dataset, view_stages
        )
    else:
        process_sample_collection = dataset

    process_map_fcn = pickle.loads(map_fcn)
    process_batch_count = batch_count
    process_sample_count = sample_count
    process_queue = queue
    process_save = save
    process_progress = progress

    if lock is not None:
        tqdm.set_lock(lock)


def _map_batch(args: Tuple[int, int, fomb.SampleBatch]):
    i, num_batches, batch = args

    sample_collection = batch.create_subset(process_sample_collection)

    if process_progress:
        desc = f"Batch {i + 1:0{len(str(num_batches))}}/{num_batches}"
        with tqdm(total=batch.total, desc=desc, position=i) as pb:
            for sample in sample_collection.iter_samples(
                autosave=process_save
            ):
                sample_output = process_map_fcn(sample)
                if process_queue is not None:
                    process_queue.put((sample.id, sample_output))

                pb.update()
    else:
        for sample in sample_collection.iter_samples(autosave=process_save):
            sample_output = process_map_fcn(sample)
            if process_queue is not None:
                process_queue.put((sample.id, sample_output))

            if process_sample_count is not None:
                with process_sample_count.get_lock():
                    process_sample_count.value += 1

    if process_batch_count is not None:
        with process_batch_count.get_lock():
            process_batch_count.value += 1
