"""
Multiprocessing utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import multiprocessing
from queue import Empty
from typing import (
    Any,
    Callable,
    Iterable,
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

import fiftyone.core.config as focc
import fiftyone.core.utils as fou
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm
from fiftyone.core.map.typing import SampleCollection

fov = fou.lazy_import("fiftyone.core.view")


T = TypeVar("T")
R = TypeVar("R")
U = TypeVar("U")


class _BatchDone:
    """Sentinel a worker enqueues after the last result of a batch."""


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
        num_workers = fou.recommend_process_pool_workers(num_workers)

        return super(ProcessMapper, cls).create(
            config=config,
            batch_cls=batch_cls,
            num_workers=num_workers,
            batch_size=batch_size,
        )

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
        ctx = fou.get_multiprocessing_context()

        if progress == "workers":
            worker_progress = True
            progress = False
            lock = ctx.RLock()
            tqdm.set_lock(lock)
        else:
            worker_progress = False
            lock = None

        queue = multiprocessing.Queue()
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
                pickle.dumps(iter_fcn),
                pickle.dumps(map_fcn),
                sample_count,
                queue,
                cancel_event,
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

            # Each batch enqueues a _BatchDone sentinel after its last
            # result. Queue puts from a given worker arrive in order, so
            # once every sentinel has been received no results can remain
            # in flight.
            num_batches_done = 0

            while num_batches_done < num_batches:
                try:
                    item = queue.get(timeout=1.0)
                except Empty:
                    continue

                if isinstance(item, _BatchDone):
                    num_batches_done += 1
                    continue

                sample_id, err, result = item

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

            # All sentinels received means the workers are idle; join
            # them so the context exit's terminate() never overlaps
            # live worker processes (filelock>=3.30 installs a fork
            # guard that aborts concurrent os.fork calls)
            pool.close()
            pool.join()

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
    iter_fcn: bytes,
    map_fcn: bytes,
    sample_count: Optional[multiprocessing.Value],  # type: ignore
    queue: Optional[multiprocessing.Queue],
    cancel_event: multiprocessing.Event,  # type: ignore
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
    global process_iter_fcn
    global process_map_fcn
    global process_sample_count
    global process_queue
    global process_cancel_event
    global process_progress
    global process_skip_failures

    # Ensure that each process creates its own MongoDB clients
    # https://pymongo.readthedocs.io/en/stable/faq.html#using-pymongo-with-multiprocessing
    # pylint:disable-next=protected-access
    food._disconnect()

    dataset = fo.load_dataset(dataset_name, reload=True)
    if view_stages:
        # pylint:disable-next=protected-access
        process_sample_collection = fov.DatasetView._build(
            dataset, view_stages
        )
    else:
        process_sample_collection = dataset

    process_map_fcn = pickle.loads(map_fcn)
    process_iter_fcn = pickle.loads(iter_fcn)
    process_sample_count = sample_count
    process_queue = queue
    process_cancel_event = cancel_event
    process_progress = progress
    process_skip_failures = skip_failures

    if lock is not None:
        tqdm.set_lock(lock)


def _map_batch(args: Tuple[int, int, fomb.SampleBatch]):
    i, num_batches, batch = args

    try:
        sample_collection = batch.create_subset(process_sample_collection)

        sample_iter = process_iter_fcn(sample_collection)

        pb = None
        if process_progress:
            desc = f"Batch {i:0{len(str(num_batches))}}/{num_batches}"
            pb = tqdm(sample_iter, total=batch.total, desc=desc, position=i)

        while not process_cancel_event.is_set() and (
            value := next(sample_iter, None)
        ):
            sample_id, sample = value

            try:
                sample_output = process_map_fcn(sample)
            except Exception as err:
                # Add sample ID and error to the queue.
                process_queue.put((sample_id, err, None))

                # If not skipping failures, cancel workers as soon as possible.
                if not process_skip_failures:
                    process_cancel_event.set()
                    break
            else:
                # Add sample ID and result to the queue.
                process_queue.put((sample_id, None, sample_output))

            finally:
                if process_sample_count is not None:
                    with process_sample_count.get_lock():
                        process_sample_count.value += 1
                if pb is not None:
                    pb.update()
    finally:
        process_queue.put(_BatchDone())
