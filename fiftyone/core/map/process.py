"""
Multiprocessing utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import multiprocessing
from queue import Empty
import time
from typing import Iterator, Any, Optional, Union

import dill as pickle
from tqdm.auto import tqdm

import fiftyone as fo
import fiftyone.core.utils as fou

from .batcher import initialize_batches
from .map import MapBackend
from .sequential import SequentialMapBackend

fov = fou.lazy_import("fiftyone.core.view")


class ProcessMapBackend(MapBackend):
    """Executes map_samples using multiprocessing."""

    def update_samples(
        self,
        sample_collection,
        map_fcn,
        num_workers: Optional[int] = None,
        shard_method: str = "id",
        progress: Optional[Union[str, bool]] = None,
    ):
        return self._map_samples(
            sample_collection,
            map_fcn,
            return_outputs=False,
            save=True,
            num_workers=num_workers,
            shard_method=shard_method,
            progress=progress,
        )

    def map_samples(
        self,
        sample_collection,
        map_fcn,
        save: Optional[bool] = None,
        num_workers: Optional[int] = None,
        shard_method: str = "id",
        progress: Optional[Union[str, bool]] = None,
    ) -> Iterator[Any]:
        return self._map_samples(
            sample_collection,
            map_fcn,
            return_outputs=True,
            save=save,
            num_workers=num_workers,
            shard_method=shard_method,
            progress=progress,
        )

    def _map_samples(
        self,
        sample_collection,
        map_fcn,
        return_outputs: bool = True,
        save: Optional[bool] = False,
        num_workers: Optional[int] = None,
        shard_method: str = "id",
        progress: Optional[Union[str, bool]] = None,
    ):
        """Applies the given function to each sample in the collection via a
        multiprocessing pool, optionally saving any sample edits.

        This function effectively performs the following map operation with the
        outer loop in parallel::

            for batch_view in fou.iter_slices(sample_collection, batch_size):
                for sample in batch_view.iter_samples(autosave=save):
                    sample_output = map_fcn(sample)
                    yield sample.id, sample_output


        Example::

            from collections import Counter

            import fiftyone as fo
            import fiftyone.utils.multiprocessing as foum
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("cifar10", split="train")
            view = dataset.select_fields("ground_truth")

            #
            # Example 1: update
            #

            def map_fcn(sample):
                sample.ground_truth.label = sample.ground_truth.label.upper()

            foum.map_samples(view, map_fcn, return_outputs=False, save=True)

            print(dataset.count_values("ground_truth.label"))

            #
            # Example 2: map
            #

            def map_fcn(sample):
                return sample.ground_truth.label.lower()

            counter = Counter()
            for _, label in foum.map_samples(view, map_fcn):
                counter[label] += 1

            print(dict(counter))

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`
            map_fcn: a function to apply to each sample
            return_outputs (True): whether to return the map outputs.
            save (False): whether to save any sample edits applied by ``map_fcn``
            num_workers (None): the number of workers to use. The default is
                :meth:`fiftyone.core.utils.recommend_process_pool_workers`. If this
                value is <= 1, all work is done in the main process
            shard_method ("id"): whether to use IDs (``"id"``) or slices
                (``"slice"``) to assign samples to workers
            progress (None): whether to render a progress bar (True/False), use the
                default value ``fiftyone.config.show_progress_bars`` (None), or a
                progress callback function to invoke instead, or "workers" to
                render per-worker progress bars

        Returns:
            one of the following:
            -   a generator that emits ``(sample_id, map_output)`` tuples, if
                ``return_outputs`` is True
            -   None, otherwise
        """
        if num_workers is None:
            if multiprocessing.current_process().daemon:
                num_workers = 1
            elif fo.config.default_map_workers is not None:
                num_workers = fo.config.default_map_workers
            else:
                num_workers = fou.recommend_process_pool_workers()

        if num_workers <= 1:
            return _map_samples_single(
                sample_collection,
                map_fcn,
                return_outputs=return_outputs,
                save=save,
                progress=progress,
            )

        if isinstance(sample_collection, fov.DatasetView):
            dataset_name = sample_collection._root_dataset.name
            view_stages = sample_collection._serialize()
        else:
            dataset_name = sample_collection.name
            view_stages = None

        batches, num_workers, num_samples = initialize_batches(
            sample_collection,
            shard_method=shard_method,
            num_workers=num_workers,
        )

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

        if return_outputs:
            batch_count = multiprocessing.Value("i", 0)
            sample_count = None
            queue = multiprocessing.Queue()
        elif progress != False:
            batch_count = multiprocessing.Value("i", 0)
            sample_count = multiprocessing.Value("i", 0)
            queue = None
        else:
            batch_count = None
            sample_count = None
            queue = None

        pool = ctx.Pool(
            processes=num_workers,
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

        pb = fou.ProgressBar(total=num_samples, progress=progress)

        if queue is not None:
            return _do_map_samples(pool, pb, batches, batch_count, queue)
        else:
            return _do_update_samples(
                pool, pb, batches, batch_count, sample_count
            )


def _do_update_samples(pool, pb, batches, batch_count, sample_count):
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


def _do_map_samples(pool, pb, batches, batch_count, queue):
    num_batches = len(batches)

    with pool, pb:
        pool.map_async(_map_batch, batches)

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

        pool.close()
        pool.join()


def _map_samples_single(
    sample_collection,
    map_fcn,
    return_outputs=True,
    save=False,
    progress=None,
) -> Optional[Iterator[Any]]:
    if progress == "workers":
        progress = True

    sequential_backend = SequentialMapBackend()

    if return_outputs:
        return sequential_backend.map_samples(
            sample_collection, map_fcn, save=save, progress=progress
        )
    else:
        return sequential_backend.update_samples(
            sample_collection, map_fcn, progress=progress
        )


def _init_worker(dataset_name, view_stages, m, bc, sc, q, s, p, l):
    from tqdm.auto import tqdm

    import fiftyone as fo
    import fiftyone.core.odm.database as food
    import fiftyone.core.view as fov

    global sample_collection
    global map_fcn
    global batch_count
    global sample_count
    global queue
    global save
    global progress

    # Ensure that each process creates its own MongoDB clients
    # https://pymongo.readthedocs.io/en/stable/faq.html#using-pymongo-with-multiprocessing
    food._disconnect()

    dataset = fo.load_dataset(dataset_name)
    if view_stages:
        sample_collection = fov.DatasetView._build(dataset, view_stages)
    else:
        sample_collection = dataset

    map_fcn = pickle.loads(m)
    batch_count = bc
    sample_count = sc
    queue = q
    save = s
    progress = p

    if l is not None:
        tqdm.set_lock(l)


def _map_batch(input):
    i, num_batches, batch = input

    if isinstance(batch, tuple):
        # Slice batches
        start, stop = batch
        total = stop - start
        batch_view = sample_collection[start:stop]
    else:
        # ID batches
        sample_ids = batch
        total = len(sample_ids)
        batch_view = fov.make_optimized_select_view(
            sample_collection, sample_ids
        )

    if progress:
        desc = f"Batch {i + 1:0{len(str(num_batches))}}/{num_batches}"
        with tqdm(total=total, desc=desc, position=i) as pb:
            for sample in batch_view.iter_samples(autosave=save):
                sample_output = map_fcn(sample)
                if queue is not None:
                    queue.put((sample.id, sample_output))

                pb.update()
    else:
        for sample in batch_view.iter_samples(autosave=save):
            sample_output = map_fcn(sample)
            if queue is not None:
                queue.put((sample.id, sample_output))

            if sample_count is not None:
                with sample_count.get_lock():
                    sample_count.value += 1

    if batch_count is not None:
        with batch_count.get_lock():
            batch_count.value += 1
