"""
Multiprocessing utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import multiprocessing
from queue import Empty
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

    def _map_sample_batches(
        self,
        sample_batches: List[fomb.SampleBatch],
        map_fcn: Callable[[T], R],
        /,
        progress: Union[bool, Literal["workers"]],
        save: bool,
        halt_on_error: bool,
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
        err_event = multiprocessing.Event()

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
                err_event,
                save,
                worker_progress,
                halt_on_error,
                lock,
            ),
        )

        pb = fou.ProgressBar(
            total=sum(batch.total for batch in sample_batches),
            progress=progress,
        )

        num_batches = len(sample_batches)
        with pool, pb:
            pool.map_async(
                _map_batch,
                (
                    (idx + 1, num_batches, batch)
                    for idx, batch in enumerate(sample_batches)
                ),
            )

            while True:
                try:
                    result = queue.get(timeout=0.01)
                    pb.update()
                    yield result
                except Empty:
                    if batch_count.value >= num_batches:
                        break

            queue.close()
            queue.join_thread()


def _init_worker(
    dataset_name: str,
    view_stages: Any,
    map_fcn: bytes,
    batch_count: Optional[multiprocessing.Value],  # type: ignore
    sample_count: Optional[multiprocessing.Value],  # type: ignore
    queue: Optional[multiprocessing.Queue],
    err_event: multiprocessing.Event,  # type: ignore
    save: bool,
    progress: bool,
    halt_on_error: bool,
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
    global process_err_event
    global process_save
    global process_progress
    global process_halt_on_error

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
    process_err_event = err_event
    process_save = save
    process_progress = progress
    process_halt_on_error = halt_on_error

    if lock is not None:
        tqdm.set_lock(lock)


def _map_batch(args: Tuple[int, int, fomb.SampleBatch]):
    i, num_batches, batch = args

    try:
        sample_collection = batch.create_subset(process_sample_collection)

        sample_iter = sample_collection.iter_samples(autosave=process_save)

        if process_progress:
            desc = f"Batch {i + 1:0{len(str(num_batches))}}/{num_batches}"
            sample_iter = tqdm(
                sample_iter, total=batch.total, desc=desc, position=i
            )

        while not process_err_event.is_set() and (
            sample := next(sample_iter, None)
        ):
            try:
                sample_output = process_map_fcn(sample)
            except Exception as err:
                if process_halt_on_error:
                    process_err_event.set()

                process_queue.put((sample.id, err))

                if process_halt_on_error:
                    break
            else:
                process_queue.put((sample.id, sample_output))

            finally:
                if process_sample_count is not None:
                    with process_sample_count.get_lock():
                        process_sample_count.value += 1
    finally:
        if process_batch_count is not None:
            with process_batch_count.get_lock():
                process_batch_count.value += 1
