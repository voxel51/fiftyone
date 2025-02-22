"""
Multiprocessing utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import multiprocessing

from bson import ObjectId
import dill as pickle
import numpy as np
from tqdm.auto import tqdm

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.core.view as fov


def map_samples(
    sample_collection,
    map_fcn,
    reduce_fcn=None,
    aggregate_fcn=None,
    save=None,
    num_workers=None,
    shard_size=None,
    shard_method="id",
    progress=None,
):
    """Applies the given function to each sample in the collection via a
    multiprocessing pool.

    When only a ``map_fcn`` is provided, this function effectively performs
    the following map operation with the outer loop in parallel::

        for batch_view in fou.iter_slices(sample_collection, shard_size):
            for sample in batch_view.iter_samples(autosave=True):
                map_fcn(sample)

    When a ``reduce_fcn`` is provided, this function effectively performs the
    following map-reduce operation with the outer loop in parallel::

        reducer = reduce_fcn(sample_collection)
        reducer.init()

        for batch_view in fou.iter_slices(sample_collection, shard_size):
            outputs = {}
            for sample in batch_view.iter_samples(autosave=True):
                outputs[sample.id] = map_fcn(sample)

            reducer.update(outputs)

        output = reducer.finalize()

    When an ``aggregate_fcn`` is provided, this function effectively performs
    the following map-aggregate operation with the outer loop in parallel::

        outputs = {}

        for batch_view in fou.iter_slices(sample_collection, shard_size):
            for sample in batch_view.iter_samples(autosave=True):
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
        # Example 1: map
        #

        def map_fcn(sample):
            sample.ground_truth.label = sample.ground_truth.label.upper()

        foum.map_samples(view, map_fcn)

        print(dataset.count_values("ground_truth.label"))

        #
        # Example 2: map-reduce
        #

        def map_fcn(sample):
            return sample.ground_truth.label.lower()

        class ReduceFcn(fo.ReduceFcn):
            def init(self):
                self.accumulator = Counter()

            def update(self, outputs):
                self.accumulator.update(Counter(outputs.values()))

            def finalize(self):
                return dict(self.accumulator)

        counts = foum.map_samples(view, map_fcn, reduce_fcn=ReduceFcn)
        print(counts)

        #
        # Example 3: map-aggregate
        #

        def map_fcn(sample):
            return sample.ground_truth.label.lower()

        def aggregate_fcn(sample_collection, values):
            return dict(Counter(values.values()))

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
        save (None): whether to save any sample edits applied by ``map_fcn``.
            By default this is True when no ``reduce_fcn`` or ``aggregate_fcn``
            is provided and False otherwise
        num_workers (None): the number of workers to use. The default is
            :meth:`fiftyone.core.utils.recommend_process_pool_workers`
        shard_size (None): an optional number of samples to distribute to each
            worker at a time. By default, samples are evenly distributed to
            workers with one shard per worker
        shard_method ("id"): whether to use IDs (``"id"``) or slices
            (``"slice"``) to assign samples to workers
        progress (None): whether to render a progress bar for each worker
            (True/False), use the default value
            ``fiftyone.config.show_progress_bars`` (None), or "global" to
            render a single global progress bar, or a progress callback
            function to invoke instead

    Returns:
        the output of ``reduce_fcn`` or ``aggregate_fcn``, if provided, else
        None
    """
    if isinstance(sample_collection, fov.DatasetView):
        dataset_name = sample_collection._root_dataset.name
        view_stages = sample_collection._serialize()
    else:
        dataset_name = sample_collection.name
        view_stages = None

    batches, num_workers = _init_batches(
        sample_collection,
        shard_size=shard_size,
        shard_method=shard_method,
        num_workers=num_workers,
    )

    if reduce_fcn is not None:
        reducer = reduce_fcn(sample_collection)
    elif aggregate_fcn is not None:
        reducer = ReduceFcn(sample_collection, aggregate_fcn=aggregate_fcn)
    else:
        reducer = None

    if save is None:
        save = reducer is None

    if progress is None:
        progress = fo.config.show_progress_bars

    return_outputs = reducer is not None
    global_progress = False
    lock = None

    ctx = fou.get_multiprocessing_context()

    if progress is True:
        lock = ctx.RLock()
        tqdm.set_lock(lock)
    elif progress == "global":
        global_progress = True
        progress = False
    elif callable(progress):
        global_progress = progress
        progress = False

    pool = ctx.Pool(
        processes=num_workers,
        initializer=_init_worker,
        initargs=(
            dataset_name,
            view_stages,
            pickle.dumps(map_fcn),
            save,
            return_outputs,
            progress,
            lock,
        ),
    )

    pb = fou.ProgressBar(
        total=len(batches),
        progress=global_progress,
        iters_str="batches",
    )

    if reducer is not None:
        reducer.init()

    with pb, pool:
        for _outputs in pb(pool.imap_unordered(_map_batch, batches)):
            if _outputs is not None:
                reducer.update(_outputs)

    if reducer is not None:
        return reducer.finalize()


class ReduceFcn(object):
    """Base class for reducers for use with :func:`map_samples`.

    Subclasses may optionally override :meth:`init`, :meth:`update`, and
    :meth:`finalize` as necessary.
    """

    def __init__(self, sample_collection, aggregate_fcn=None):
        self.sample_collection = sample_collection
        self.aggregate_fcn = aggregate_fcn
        self.accumulator = None

    def init(self):
        """Initializes the reducer."""
        self.accumulator = {}

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

    return batches, num_workers


def _init_worker(dataset_name, view_stages, m, s, r, p, l):
    from tqdm.auto import tqdm

    import fiftyone as fo
    import fiftyone.core.odm.database as food
    import fiftyone.core.view as fov

    global sample_collection, map_fcn, save, return_outputs, progress

    # Ensure that each process creates its own MongoDB clients
    # https://pymongo.readthedocs.io/en/stable/faq.html#using-pymongo-with-multiprocessing
    food._disconnect()

    dataset = fo.load_dataset(dataset_name)
    if view_stages:
        sample_collection = fov.DatasetView._build(dataset, view_stages)
    else:
        sample_collection = dataset

    map_fcn = pickle.loads(m)
    save = s
    return_outputs = r
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

    if return_outputs:
        values = {}

    if progress:
        desc = f"Batch {i + 1:0{len(str(num_batches))}}/{num_batches}"
        with tqdm(total=total, desc=desc, position=i) as pb:
            for sample in batch_view.iter_samples(autosave=save):
                result = map_fcn(sample)
                if return_outputs and result is not None:
                    values[sample.id] = result

                pb.update()
    else:
        for sample in batch_view.iter_samples(autosave=save):
            result = map_fcn(sample)
            if return_outputs and result is not None:
                values[sample.id] = result

    if return_outputs:
        return values
