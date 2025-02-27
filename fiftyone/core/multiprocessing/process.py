"""
Multiprocessing utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import multiprocessing
from queue import Empty
import time

from bson import ObjectId
import dill as pickle
import numpy as np
from tqdm.auto import tqdm

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

from .map import MapBackend


class ProcessMapBackend(MapBackend):
    """Executes map_samples using multiprocessing."""

    def map_samples(
        self,
        sample_collection,
        map_fcn,
        reduce_fcn=None,
        aggregate_fcn=None,
        return_outputs=True,
        save=False,
        num_workers=None,
        shard_size=None,
        shard_method="id",
        progress=None,
    ):
        """Applies the given function to each sample in the collection via a
        multiprocessing pool, optionally saving any sample edits and
        reducing/aggregating the outputs.

        When only a ``map_fcn`` is provided, this function effectively performs
        the following map operation with the outer loop in parallel::

            for batch_view in fou.iter_slices(sample_collection, shard_size):
                for sample in batch_view.iter_samples(autosave=save):
                    sample_output = map_fcn(sample)
                    yield sample.id, sample_output

        When a ``reduce_fcn`` is provided, this function effectively performs the
        following map-reduce operation with the outer loop in parallel::

            reducer = reduce_fcn(sample_collection)
            reducer.init()

            for batch_view in fou.iter_slices(sample_collection, shard_size):
                for sample in batch_view.iter_samples(autosave=save):
                    sample_output = map_fcn(sample)
                    reducer.add(sample.id, sample_output)

            output = reducer.finalize()

        When an ``aggregate_fcn`` is provided, this function effectively performs
        the following map-aggregate operation with the outer loop in parallel::

            outputs = {}

            for batch_view in fou.iter_slices(sample_collection, shard_size):
                for sample in batch_view.iter_samples(autosave=save):
                    outputs[sample.id] = map_fcn(sample)

            output = aggregate_fcn(sample_collection, outputs)

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

            #
            # Example 3: map-reduce
            #

            def map_fcn(sample):
                return sample.ground_truth.label.lower()

            class ReduceFcn(fo.ReduceFcn):
                def init(self):
                    self.accumulator = Counter()

                def add(self, sample_id, output):
                    self.accumulator[output] += 1

                def finalize(self):
                    return dict(self.accumulator)

            counts = foum.map_samples(view, map_fcn, reduce_fcn=ReduceFcn)
            print(counts)

            #
            # Example 4: map-aggregate
            #

            def map_fcn(sample):
                return sample.ground_truth.label.lower()

            def aggregate_fcn(sample_collection, outputs):
                return dict(Counter(outputs.values()))

            counts = foum.map_samples(view, map_fcn, aggregate_fcn=aggregate_fcn)
            print(counts)

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`
            map_fcn: a function to apply to each sample
            reduce_fcn (None): an optional :class:`ReduceFcn` subclass to reduce
                the map outputs. See above for usage information
            aggregate_fcn (None): an optional function to aggregate the map
                outputs. See above for usage information
            return_outputs (True): whether to return the map outputs. This has no
                effect when a ``reduce_fcn`` or ``aggregate_fcn`` is provided
            save (False): whether to save any sample edits applied by ``map_fcn``
            num_workers (None): the number of workers to use. The default is
                :meth:`fiftyone.core.utils.recommend_process_pool_workers`. If this
                value is <= 1, all work is done in the main process
            shard_size (None): an optional number of samples to distribute to each
                worker at a time. By default, samples are evenly distributed to
                workers with one shard per worker
            shard_method ("id"): whether to use IDs (``"id"``) or slices
                (``"slice"``) to assign samples to workers
            progress (None): whether to render a progress bar (True/False), use the
                default value ``fiftyone.config.show_progress_bars`` (None), or a
                progress callback function to invoke instead, or "workers" to
                render per-worker progress bars

        Returns:
            one of the following:

            -   the output of ``reduce_fcn`` or ``aggregate_fcn``, if provided
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
                reduce_fcn=reduce_fcn,
                aggregate_fcn=aggregate_fcn,
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

        batches, num_workers, num_samples = _init_batches(
            sample_collection,
            shard_size=shard_size,
            shard_method=shard_method,
            num_workers=num_workers,
        )

        ctx = fou.get_multiprocessing_context()

        if reduce_fcn is not None:
            reducer = reduce_fcn(sample_collection)
        elif aggregate_fcn is not None:
            reducer = ReduceFcn(sample_collection, aggregate_fcn=aggregate_fcn)
        else:
            reducer = None

        if reducer is not None:
            return_outputs = True

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

        if reducer is not None:
            return _do_map_reduce_samples(
                pool, pb, batches, batch_count, queue, reducer
            )
        elif queue is not None:
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


def _do_map_reduce_samples(pool, pb, batches, batch_count, queue, reducer):
    num_batches = len(batches)

    reducer.init()

    with pool, pb:
        pool.map_async(_map_batch, batches)

        while True:
            try:
                result = queue.get(timeout=0.01)
                pb.update()
                reducer.add(*result)
            except Empty:
                if batch_count.value >= num_batches:
                    break

        queue.close()
        queue.join_thread()

        pool.close()
        pool.join()

    return reducer.finalize()


def _map_samples_single(
    sample_collection,
    map_fcn,
    reduce_fcn=None,
    aggregate_fcn=None,
    return_outputs=True,
    save=False,
    progress=None,
):
    if reduce_fcn is not None:
        reducer = reduce_fcn(sample_collection)
    elif aggregate_fcn is not None:
        reducer = ReduceFcn(sample_collection, aggregate_fcn=aggregate_fcn)
    else:
        reducer = None

    if progress == "workers":
        progress = True

    if reducer is not None:
        return _do_map_reduce_samples_single(
            sample_collection, map_fcn, reducer, save=save, progress=progress
        )
    elif return_outputs:
        return _do_map_samples_single(
            sample_collection, map_fcn, save=save, progress=progress
        )
    else:
        return _do_update_samples_single(
            sample_collection, map_fcn, save=save, progress=progress
        )


def _do_update_samples_single(
    sample_collection, map_fcn, save=False, progress=None
):
    for sample in sample_collection.iter_samples(
        autosave=save, progress=progress
    ):
        map_fcn(sample)


def _do_map_samples_single(
    sample_collection, map_fcn, save=False, progress=None
):
    for sample in sample_collection.iter_samples(
        autosave=save, progress=progress
    ):
        sample_output = map_fcn(sample)
        yield sample.id, sample_output


def _do_map_reduce_samples_single(
    sample_collection, map_fcn, reducer, save=False, progress=None
):
    reducer.init()

    for sample in sample_collection.iter_samples(
        autosave=save, progress=progress
    ):
        sample_output = map_fcn(sample)
        reducer.add(sample.id, sample_output)

    return reducer.finalize()


class ReduceFcn(object):
    """Base class for reducers for use with :func:`map_samples`.

    Subclasses may optionally override :meth:`init`, :meth:`add`,
    :meth:`update`, and :meth:`finalize` as necessary.
    """

    def __init__(self, sample_collection, aggregate_fcn=None):
        self.sample_collection = sample_collection
        self.aggregate_fcn = aggregate_fcn
        self.accumulator = None

    def init(self):
        """Initializes the reducer."""
        self.accumulator = {}

    def add(self, sample_id, output):
        """Adds a map output to the reducer.

        Args:
            sample_id: a sample ID
            output: a map output
        """
        self.accumulator[sample_id] = output

    def update(self, outputs):
        """Adds a batch of map outputs to the reducer.

        Args:
            outputs: a dict mapping sample IDs to map outputs
        """
        self.accumulator.update(outputs)

    def finalize(self):
        """Finalizes the reducer and returns the result, if any.

        Returns:
            the final output, or None
        """
        if self.aggregate_fcn is not None:
            return self.aggregate_fcn(self.sample_collection, self.accumulator)


def _init_batches(
    sample_collection,
    shard_size=None,
    shard_method="id",
    num_workers=None,
):
    if shard_method == "slice":
        n = len(sample_collection)
    else:
        ids = sample_collection.values("id")
        n = len(ids)

    if num_workers is None:
        num_workers = fou.recommend_process_pool_workers()

    # Must cap size of select(ids) stages
    if shard_method == "id":
        max_shard_size = fou.recommend_batch_size_for_value(
            ObjectId(), max_size=100000
        )

        if shard_size is not None:
            shard_size = min(shard_size, max_shard_size)
        elif n > num_workers * max_shard_size:
            shard_size = max_shard_size

    if shard_size is not None:
        # Fixed size shards
        edges = list(range(0, n + 1, shard_size))
        if edges[-1] < n:
            edges.append(n)
    else:
        # Split collection into exactly `num_workers` shards
        edges = [int(round(b)) for b in np.linspace(0, n, num_workers + 1)]

    if shard_method == "slice":
        # Slice batches
        slices = list(zip(edges[:-1], edges[1:]))
    else:
        # ID batches
        slices = [ids[i:j] for i, j in zip(edges[:-1], edges[1:])]

    num_shards = len(slices)
    batches = list(
        zip(
            range(num_shards),
            itertools.repeat(num_shards),
            slices,
        )
    )

    num_workers = min(num_workers, num_shards)

    return batches, num_workers, n


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
