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
    Type,
    TypeVar,
    Union,
)

import dill as pickle
import bson
from tqdm.auto import tqdm

import fiftyone as fo
import fiftyone.core.config as focc
import fiftyone.core.utils as fou
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm
from fiftyone.core.map.typing import SampleCollection

fov = fou.lazy_import("fiftyone.core.view")


T = TypeVar("T")
R = TypeVar("R")


class ProcessMapper(fomm.LocalMapper):
    """Executes map_samples using multiprocessing."""

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
        if multiprocessing.current_process().daemon:
            num_workers = 1
        elif num_workers is None:
            num_workers = (
                config.default_process_pool_workers
                or fou.recommend_process_pool_workers()
            )

        if config.max_process_pool_workers is not None:
            num_workers = min(num_workers, config.max_process_pool_workers)

        return cls(batch_cls, num_workers, batch_size)

    def _map_samples_multiple_workers(
        self,
        sample_collection: SampleCollection[T],
        map_fcn: Callable[[T], R],
        *,
        progress: Union[bool, Literal["workers"], None],
        save: bool,
        skip_failures: bool,
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
        cancel_event = multiprocessing.Event()

        # Extract information from sample collection.
        if isinstance(sample_collection, fov.DatasetView):
            # pylint:disable-next=protected-access
            dataset_name = sample_collection._root_dataset.name
            # pylint:disable-next=protected-access
            view_stages = sample_collection._serialize()
        else:
            dataset_name = sample_collection.name
            view_stages = None

        sample_batches = self._batch_cls.split(
            sample_collection, self.num_workers, self.batch_size
        )

        pool = ctx.Pool(
            processes=self.num_workers,
            initializer=_init_worker,
            initargs=(
                dataset_name,
                view_stages,
                pickle.dumps(map_fcn),
                batch_count,
                sample_count,
                queue,
                cancel_event,
                save,
                worker_progress,
                skip_failures,
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

            sample_errors: List[Tuple[bson.ObjectId, Exception, None]] = []

            # Initialize backoff parameters
            initial_timeout = 0.1
            max_timeout = 5.0
            backoff_factor = 2
            current_timeout = initial_timeout

            while True:
                try:
                    sample_id, err, result = queue.get(timeout=current_timeout)
                    # Reset backoff on successful get
                    current_timeout = initial_timeout
                except Empty:
                    # Apply exponential backoff, but cap at max_timeout
                    current_timeout = min(
                        current_timeout * backoff_factor, max_timeout
                    )

                    # Reset backoff if we've hit too many consecutive timeouts
                    # This prevents getting stuck with very long timeouts
                    if current_timeout == max_timeout:
                        current_timeout = initial_timeout

                    # Check if done after applying backoff
                    if batch_count.value >= num_batches:
                        break
                else:
                    # Update progress bar
                    pb.update()

                    if err is not None:
                        # When skipping failures, simply yield the
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

            queue.close()
            queue.join_thread()

            # It is possible to aggregate one error per worker. There
            # might be a better way to handle this in the future but for
            # now, return the first error seen.
            if sample_errors:
                yield sample_errors[0]


def _init_worker(
    dataset_name: str,
    view_stages: Any,
    map_fcn: bytes,
    batch_count: Optional[multiprocessing.Value],  # type: ignore
    sample_count: Optional[multiprocessing.Value],  # type: ignore
    queue: Optional[multiprocessing.Queue],
    cancel_event: multiprocessing.Event,  # type: ignore
    save: bool,
    progress: bool,
    skip_failures: bool,
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
    global process_cancel_event
    global process_save
    global process_progress
    global process_skip_failures

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
    process_cancel_event = cancel_event
    process_save = save
    process_progress = progress
    process_skip_failures = skip_failures

    if lock is not None:
        tqdm.set_lock(lock)


def _map_batch(args: Tuple[int, int, fomb.SampleBatch]):
    i, num_batches, batch = args

    try:
        sample_collection = batch.create_subset(process_sample_collection)

        sample_iter = sample_collection.iter_samples(autosave=process_save)

        pb = None
        if process_progress:
            desc = f"Batch {i:0{len(str(num_batches))}}/{num_batches}"
            pb = tqdm(sample_iter, total=batch.total, desc=desc, position=i)

        while not process_cancel_event.is_set() and (
            sample := next(sample_iter, None)
        ):
            try:
                sample_output = process_map_fcn(sample)
            except Exception as err:
                # Add sample ID and error to the queue.
                process_queue.put((sample.id, err, None))

                # If not skipping failures, cancel workers as soon as possible.
                if not process_skip_failures:
                    process_cancel_event.set()
                    break
            else:
                # Add sample ID and result to the queue.
                process_queue.put((sample.id, None, sample_output))

            finally:
                if process_sample_count is not None:
                    with process_sample_count.get_lock():
                        process_sample_count.value += 1
                if pb is not None:
                    pb.update()
    finally:
        if process_batch_count is not None:
            with process_batch_count.get_lock():
                process_batch_count.value += 1
