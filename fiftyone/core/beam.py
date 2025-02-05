"""
`Apache Beam <https://beam.apache.org>`_ utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import json
import logging
import os
import sys
import time

from bson import ObjectId
import inspect
import multiprocessing
import numpy as np
import tqdm.auto as tqdm
from typing import Any, Optional

import fiftyone as fo
import fiftyone.core.view as fov

os.environ["GRPC_VERBOSITY"] = "NONE"

import apache_beam as beam
from apache_beam.options.pipeline_options import PipelineOptions


def beam_map(
    sample_collection,
    map_fcn,
    reduce_fcn=None,
    save=None,
    shard_size=None,
    shard_method="id",
    num_workers=None,
    options=None,
    progress=False,
    verbose=False,
):
    """Applies the given function to each sample in the collection via
     `Apache Beam <https://beam.apache.org>`_.

    When only a ``map_fcn`` is provided, this function is a parallelized
    version of
    :meth:`iter_samples(autosave=True) <fiftyone.core.collections.SampleCollection.iter_samples>`
    that effectively performs the following operation with the outer loop
    in parallel::

        for batch_view in fou.iter_batches(sample_collection, shard_size):
            for sample in batch_view.iter_samples(autosave=True):
                map_fcn(sample)

    When a ``reduce_fcn`` is provided, this function effectively performs the
    following operation with the outer loop in parallel::

        values = {}
        for batch_view in fou.iter_batches(sample_collection, shard_size):
            for sample in batch_view.iter_samples(autosave=save):
                values[sample.id] = map_fcn(sample)

        output = reduce_fcn(sample_collection, values)

    Example::

        import fiftyone as fo
        import fiftyone.utils.beam as foub
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("cifar10", split="train")
        view = dataset.select_fields("ground_truth")

        #
        # Example 1: map
        #

        def map_fcn(sample):
            sample.ground_truth.label = sample.ground_truth.label.upper()

        foub.beam_map(view, map_fcn, progress=True)

        print(dataset.count_values("ground_truth.label"))

        #
        # Example 2: map-reduce
        #

        def map_fcn(sample):
            return sample.ground_truth.label.lower()

        def reduce_fcn(sample_collection, values):
            from collections import Counter
            return dict(Counter(values.values()))

        counts = foub.beam_map(view, map_fcn, reduce_fcn=reduce_fcn, progress=True)
        print(counts)

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        map_fcn: a function to apply to each sample
        reduce_fcn (None): an optional reduce function to apply to the map
            outputs. See the docstring above for usage information
        save (None): whether to save any sample edits applied by ``map_fcn``.
            By default this is True when no ``reduce_fcn`` is provided and
            False when a ``reduce_fcn`` is provided
        shard_size (None): an optional number of samples to distribute to each
            worker at a time. By default, samples are evenly distributed to
            workers with one shard per worker
        shard_method ("id"): whether to use IDs (``"id"``) or slices
            (``"slice"``) to assign samples to workers
        num_workers (None): the number of workers to use when no ``options``
            are provided. The default is
            :meth:`fiftyone.core.utils.recommend_process_pool_workers`
        options (None): a
            ``apache_beam.options.pipeline_options.PipelineOptions`` that
            configures how to run the pipeline. By default, the pipeline will
            be run via Beam's direct runner using multiprocessing with
            ``num_workers`` workers
        progress (False): whether to render progress bar(s) for each worker
        verbose (False): whether to log the Beam pipeline's messages

    Returns:
        the output of ``reduce_fcn``, or None
    """
    if shard_method == "slice":
        n = len(sample_collection)
    else:
        ids = sample_collection.values("id")
        n = len(ids)

    if num_workers is None:
        num_workers = recommend_process_pool_workers()

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
    print(slices)
    batches = list(
        zip(
            range(num_shards),
            itertools.repeat(num_shards),
            slices,
        )
    )

    if isinstance(sample_collection, fov.DatasetView):
        dataset_name = sample_collection._root_dataset.name
        view_stages = sample_collection._serialize()
    else:
        dataset_name = sample_collection.name
        view_stages = None

    if save is None:
        save = reduce_fcn is None

    map_batch = MapBatch(
        dataset_name,
        map_fcn,
        view_stages=view_stages,
        save=save,
        return_outputs=reduce_fcn is not None,
        progress=progress,
    )

    if reduce_fcn is not None:
        result_key = f"beam_map_{str(ObjectId())}"
        reduce_fn = ReduceFn(
            dataset_name,
            reduce_fcn,
            view_stages=view_stages,
            result_key=result_key,
        )
    else:
        result_key = None
        reduce_fn = None

    if options is None:
        options = PipelineOptions(
            runner="direct",
            direct_num_workers=min(num_workers, num_shards),
            direct_running_mode="multi_processing",
        )

    logger = logging.getLogger()
    level = logger.level if verbose else logging.CRITICAL
    with SetAttributes(logger, level=level):
        with beam.Pipeline(options=options) as pipeline:
            pcoll = (
                pipeline
                | "InitMap" >> beam.Create(batches)
                | "MapBatches" >> beam.ParDo(map_batch)
            )

            if reduce_fn is not None:
                _ = pcoll | "ReduceFn" >> beam.CombineGlobally(reduce_fn)

    sample_collection.reload()

    if result_key is not None:
        return _get_key(sample_collection, result_key)


class MapBatch(beam.DoFn):
    def __init__(
        self,
        dataset_name,
        map_fcn,
        view_stages=None,
        save=False,
        return_outputs=True,
        progress=False,
    ):
        self.dataset_name = dataset_name
        self.map_fcn = map_fcn
        self.view_stages = view_stages
        self.save = save
        self.return_outputs = return_outputs
        self.progress = progress
        self._sample_collection = None

    def setup(self):
        import fiftyone as fo
        import fiftyone.core.view as fov

        dataset = fo.load_dataset(self.dataset_name)

        if self.view_stages:
            sample_collection = fov.DatasetView._build(
                dataset, self.view_stages
            )
        else:
            sample_collection = dataset

        self._sample_collection = sample_collection

    def process(self, element, **kwargs):
        i, num_batches, batch = element

        if isinstance(batch, tuple):
            # Slice batches
            start, stop = batch
            total = stop - start
            batch_view = self._sample_collection[start:stop]
        else:
            # ID batches
            sample_ids = batch
            total = len(sample_ids)
            batch_view = fov.make_optimized_select_view(
                self._sample_collection, sample_ids
            )

        if self.progress:
            desc = f"Batch {i + 1:0{len(str(num_batches))}}/{num_batches}"
            with tqdm.tqdm(total=total, desc=desc, position=i) as pbar:
                for sample in batch_view.iter_samples(autosave=self.save):
                    result = self.map_fcn(sample)
                    if self.return_outputs and result is not None:
                        yield sample.id, result

                    pbar.update()
        else:
            for sample in batch_view.iter_samples(autosave=self.save):
                result = self.map_fcn(sample)
                if self.return_outputs and result is not None:
                    yield sample.id, result


class ReduceFn(beam.CombineFn):
    def __init__(
        self,
        dataset_name,
        reduce_fcn,
        view_stages=None,
        result_key=None,
    ):
        self.dataset_name = dataset_name
        self.reduce_fcn = reduce_fcn
        self.view_stages = view_stages
        self.result_key = result_key

        self._sample_collection = None

    def setup(self):
        import fiftyone as fo
        import fiftyone.core.view as fov

        dataset = fo.load_dataset(self.dataset_name)

        if self.view_stages:
            sample_collection = fov.DatasetView._build(
                dataset, self.view_stages
            )
        else:
            sample_collection = dataset

        self._sample_collection = sample_collection

    def create_accumulator(self):
        return {}

    def add_input(self, accumulator, input):
        sample_id, value = input
        accumulator[sample_id] = value
        return accumulator

    def merge_accumulators(self, accumulators):
        accumulator = {}
        for a in accumulators:
            accumulator.update(a)
        return accumulator

    def extract_output(self, accumulator):
        output = self.reduce_fcn(self._sample_collection, accumulator)
        if output is None or self.result_key is None:
            return

        _set_key(self._sample_collection, self.result_key, output)


def _set_key(sample_collection, key, value, ttl=60):
    print("Setting key", key)
    dataset_id = sample_collection._root_dataset._doc.id
    store = FileExecutionStore(dataset_id=dataset_id, base_path="beam")
    store.set(key, value, ttl=ttl)


def _get_key(sample_collection, key):
    print("Getting key", key)
    dataset_id = sample_collection._root_dataset._doc.id
    store = FileExecutionStore(dataset_id=dataset_id, base_path="beam")
    return store.get(key)


def _pop_first(x):
    xi = iter(x)

    try:
        x0 = next(xi)
    except StopIteration:
        x0 = None

    return x0, xi


def recommend_process_pool_workers(num_workers=None):
    """Recommends a number of workers for a process pool.

    If a ``fo.config.max_process_pool_workers`` is set, this limit is applied.

    Args:
        num_workers (None): a suggested number of workers

    Returns:
        a number of workers
    """
    if num_workers is None:
        if sys.platform.startswith("win"):
            # Windows tends to have multiprocessing issues
            num_workers = 1
        else:
            num_workers = multiprocessing.cpu_count()

    if fo.config.max_process_pool_workers is not None:
        num_workers = min(num_workers, fo.config.max_process_pool_workers)

    return num_workers


def recommend_thread_pool_workers(num_workers=None):
    """Recommends a number of workers for a thread pool.

    If a ``fo.config.max_thread_pool_workers`` is set, this limit is applied.

    Args:
        num_workers (None): a suggested number of workers

    Returns:
        a number of workers
    """
    if num_workers is None:
        num_workers = multiprocessing.cpu_count()

    if fo.config.max_thread_pool_workers is not None:
        num_workers = min(num_workers, fo.config.max_thread_pool_workers)

    return num_workers


class SetAttributes(object):
    """Context manager that temporarily sets the attributes of a class to new
    values.

    Args:
        obj: the object
        **kwargs: the attribute key-values to set while the context is active
    """

    def __init__(self, obj, **kwargs):
        self._obj = obj
        self._kwargs = kwargs
        self._orig_kwargs = None
        self._new_kwargs = None

    def __enter__(self):
        self._orig_kwargs = {}
        self._new_kwargs = set()
        for k, v in self._kwargs.items():
            if hasattr(self._obj, k):
                self._orig_kwargs[k] = getattr(self._obj, k)
            else:
                self._new_kwargs.add(k)

            setattr(self._obj, k, v)

        return self

    def __exit__(self, *args):
        for k, v in self._orig_kwargs.items():
            setattr(self._obj, k, v)

        for k in self._new_kwargs:
            delattr(self._obj, k)


def extract_kwargs_for_function(cls_or_fcn, kwargs):
    this_kwargs = {}
    other_kwargs = {}
    spec = inspect.getfullargspec(cls_or_fcn)
    for k, v in kwargs.items():
        if k in spec.args:
            this_kwargs[k] = v
        else:
            other_kwargs[k] = v

    return this_kwargs, other_kwargs


class FileExecutionStore(object):
    def __init__(self, dataset_id: Any, base_path: str = ".store"):
        self.dataset_id = str(dataset_id)
        self.base_path = base_path
        self.store_path = os.path.join(self.base_path, self.dataset_id)
        os.makedirs(self.store_path, exist_ok=True)

    def _get_file_path(self, key: str) -> str:
        """Get the file path for a key"""
        return os.path.join(self.store_path, f"{key}.json")

    def set(self, key: str, value: Any, ttl: int = 60) -> None:
        """Store value with expiration time in a file"""
        file_path = self._get_file_path(key)
        data = {"value": value, "expiration": time.time() + ttl}
        with open(file_path, "w") as f:
            json.dump(data, f)

    def get(self, key: str) -> Optional[Any]:
        """Retrieve value from file if exists and not expired"""
        file_path = self._get_file_path(key)

        if not os.path.exists(file_path):
            return None

        with open(file_path, "r") as f:
            data = json.load(f)

        if time.time() > data["expiration"]:
            os.remove(file_path)
            return None

        return data["value"]
