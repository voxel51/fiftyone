"""
`Apache Beam <https://beam.apache.org>`_ utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import os

from bson import ObjectId
import numpy as np
from tqdm.auto import tqdm

import fiftyone.core.dataset as fod
import fiftyone.core.utils as fou
import fiftyone.core.view as fov
import fiftyone.operators.store as foos

os.environ["GRPC_VERBOSITY"] = "NONE"
fou.ensure_import("apache_beam")

import apache_beam as beam
from apache_beam.options.pipeline_options import PipelineOptions


def beam_import(
    dataset,
    samples,
    parse_fcn=None,
    expand_schema=True,
    dynamic=False,
    validate=True,
    options=None,
    verbose=False,
):
    """Imports the given samples into the dataset via
    `Apache Beam <https://beam.apache.org>`_.

    This function is a parallelized alternative to
    :meth:`fiftyone.core.dataset.Dataset.add_samples`.

    .. note::

        The insertion order of the samples is not guaranteed.

    Example::

        import fiftyone as fo
        import fiftyone.utils.beam as foub

        samples = range(10000)

        def make_sample(idx):
            return fo.Sample(filepath="image%d.png" % idx, uuid=idx)

        #
        # Option 1: build the samples on the workers
        #

        dataset = fo.Dataset()

        foub.beam_import(dataset, samples, parse_fcn=make_sample)
        print(dataset)

        #
        # Option 2: build the samples in the main thread
        #
        # This is generally not preferred but may be necessary if your
        # ``parse_fcn`` is not serializable
        #

        dataset = fo.Dataset()

        samples = map(make_sample, samples)

        foub.beam_import(dataset, samples)
        print(dataset)

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        samples: an iterable of samples. If no ``parse_fcn`` is provided, these
            must be :class:`fiftyone.core.sample.Sample` instances. If a
            ``parse_fcn`` is provided, these are passed to it for parsing
        parse_fcn (None): an optional function that converts elements of
            ``samples`` to :class:`fiftyone.core.sample.Sample` instances
        expand_schema (True): whether to dynamically add new sample fields
            encountered to the dataset schema. If False, an error is raised
            if a sample's schema is not a subset of the dataset schema
        dynamic (False): whether to declare dynamic attributes of embedded
            document fields that are encountered
        validate (True): whether to validate that the fields of each sample
            are compliant with the dataset schema before adding it
        options (None): a
            ``apache_beam.options.pipeline_options.PipelineOptions`` that
            configures how to run the pipeline. By default, the pipeline will
            be run via Beam's direct runner using threads
        verbose (False): whether to log the Beam pipeline's messages
    """
    if options is None:
        options = PipelineOptions(
            runner="direct",
            direct_num_workers=fou.recommend_thread_pool_workers(),
            direct_running_mode="multi_threading",
        )

    sample0, samples = _pop_first(samples)

    if sample0 is None:
        return  # empty

    if parse_fcn is not None:
        sample0 = parse_fcn(sample0)

    # Manually insert first sample to reduce chances of parallel schema changes
    dataset.add_sample(
        sample0,
        expand_schema=expand_schema,
        dynamic=dynamic,
        validate=validate,
    )

    if parse_fcn is None:
        # `Sample` objects are not serializable so we must manually serialize
        # and deserialize in `ImportBatch`
        samples = map(lambda s: s.to_mongo_dict(include_id=True), samples)

    import_batch = ImportBatch(
        dataset.name,
        parse_fcn=parse_fcn,
        expand_schema=expand_schema,
        dynamic=dynamic,
        validate=validate,
    )

    logger = logging.getLogger()
    level = logger.level if verbose else logging.CRITICAL
    with fou.SetAttributes(logger, level=level):
        with beam.Pipeline(options=options) as pipeline:
            _ = (
                pipeline
                | "InitImport" >> beam.Create(samples)
                | "ImportBatches" >> beam.ParDo(import_batch)
            )

    # The dataset's schema may have changed in another process
    dataset.reload()


def beam_merge(
    dataset, samples, parse_fcn=None, options=None, verbose=False, **kwargs
):
    """Merges the given samples into the dataset via
    `Apache Beam <https://beam.apache.org>`_.

    This function is a parallelized alternative to
    :meth:`fiftyone.core.dataset.Dataset.merge_samples`.

    .. note::

        This function is only useful for merging **in-memory samples** into a
        dataset. If you are merging a sample collection, simply call
        :meth:`fiftyone.core.dataset.Dataset.merge_samples`.

    Example::

        import fiftyone as fo
        import fiftyone.utils.beam as foub
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart").clone()

        samples = iter(dataset.select_fields("predictions"))

        foub.beam_merge(dataset, samples, fields={"predictions": "predictions2"})

        print(dataset.count("predictions.detections"))
        print(dataset.count("predictions2.detections"))

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        samples: an iterable of samples. If no ``parse_fcn`` is provided, these
            must be :class:`fiftyone.core.sample.Sample` instances. If a
            ``parse_fcn`` is provided, these are passed to it for parsing
        parse_fcn (None): an optional function that converts elements of
            ``samples`` to :class:`fiftyone.core.sample.Sample` instances
        options (None): a
            ``apache_beam.options.pipeline_options.PipelineOptions`` that
            configures how to run the pipeline. By default, the pipeline will
            be run via Beam's direct runner using threads
        verbose (False): whether to log the Beam pipeline's messages
        **kwargs: keyword arguments for
            :meth:`fiftyone.core.dataset.Dataset.merge_samples`
    """

    # If the merge does not require a `key_fcn`, then it is fastest to import
    # the samples into a temporary collection and then merge that
    if kwargs.get("key_fcn", None) is None:
        tmp_dataset = fod.Dataset()

        try:
            beam_import(
                tmp_dataset,
                samples,
                parse_fcn=parse_fcn,
                options=options,
                verbose=verbose,
            )

            dataset.merge_samples(tmp_dataset, **kwargs)
        finally:
            tmp_dataset.delete()

        return

    if options is None:
        options = PipelineOptions(
            runner="direct",
            direct_num_workers=fou.recommend_thread_pool_workers(),
            direct_running_mode="multi_threading",
        )

    if parse_fcn is None:
        # `Sample` objects are not serializable so we must manually serialize
        # and deserialize in `MergeBatch`
        samples = map(lambda s: s.to_mongo_dict(include_id=True), samples)

    merge_batch = MergeBatch(dataset.name, parse_fcn=parse_fcn, **kwargs)

    logger = logging.getLogger()
    level = logger.level if verbose else logging.CRITICAL
    with fou.SetAttributes(logger, level=level):
        with beam.Pipeline(options=options) as pipeline:
            _ = (
                pipeline
                | "InitMerge" >> beam.Create(samples)
                | "MergeBatches" >> beam.ParDo(merge_batch)
            )

    # The dataset's schema may have changed in another process
    dataset.reload()


def beam_export(
    sample_collection,
    num_shards,
    options=None,
    verbose=False,
    render_kwargs=None,
    **kwargs,
):
    """Exports the given sample collection in the specified number shards via
    `Apache Beam <https://beam.apache.org>`_.

    This function is a parallelized alternative to
    :meth:`fiftyone.core.collections.SampleCollection.export` that effectively
    performs the following sharded export in parallel::

        for idx, (first, last) in enumerate(shards, 1):
            _kwargs = render_kwargs(kwargs, idx)
            sample_collection[first:last].export(**_kwargs)

    Example::

        from apache_beam.options.pipeline_options import PipelineOptions

        import fiftyone as fo
        import fiftyone.utils.beam as foub
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        # Use multithreading instead of the default multiprocessing
        options = PipelineOptions(
            runner="direct",
            direct_num_workers=10,
            direct_running_mode="multi_threading",
        )

        foub.beam_export(
            dataset,
            num_shards=20,
            options=options,
            dataset_type=fo.types.TFObjectDetectionDataset,
            label_field="ground_truth",
            tf_records_path="/tmp/beam/tf.records-%05d-of-00020",
        )

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        num_shards: the number of shards to write
        options (None): a
            ``apache_beam.options.pipeline_options.PipelineOptions`` that
            configures how to run the pipeline. By default, the pipeline will
            be run via Beam's direct runner using multiprocessing
        verbose (False): whether to log the Beam pipeline's messages
        render_kwargs (None): a function that renders ``kwargs`` for the
            current shard. The function should have signature
            ``def render_kwargs(kwargs, idx) -> kwargs``, where ``idx`` in
            ``[1, num_shards]`` is the shard index. By default, any
            string-valued arguments that contain format patterns like ``%05d``
            will be rendered via ``value % idx``
        **kwargs: keyword arguments for
            :meth:`fiftyone.core.collections.SampleCollection.export`
    """
    if options is None:
        num_workers = min(num_shards, fou.recommend_process_pool_workers())
        options = PipelineOptions(
            runner="direct",
            direct_num_workers=num_workers,
            direct_running_mode="multi_processing",
        )

    if isinstance(sample_collection, fov.DatasetView):
        dataset_name = sample_collection._root_dataset.name
        view_stages = sample_collection._serialize()
    else:
        dataset_name = sample_collection.name
        view_stages = None

    export_batch = ExportBatch(
        dataset_name,
        view_stages=view_stages,
        render_kwargs=render_kwargs,
    )

    n = len(sample_collection)
    edges = [int(round(b)) for b in np.linspace(0, n, num_shards + 1)]

    batches = [
        {"idx": idx, "start": start, "stop": stop}
        for idx, (start, stop) in enumerate(zip(edges[:-1], edges[1:]), 1)
    ]

    logger = logging.getLogger()
    level = logger.level if verbose else logging.CRITICAL
    with fou.SetAttributes(logger, level=level):
        with beam.Pipeline(options=options) as pipeline:
            _ = (
                pipeline
                | "InitExport" >> beam.Create(batches)
                | "ExportBatches" >> beam.ParDo(export_batch, **kwargs)
            )


def beam_map(
    sample_collection,
    map_fcn,
    reduce_fcn=None,
    aggregate_fcn=None,
    save=False,
    batch_method="id",
    batch_size=None,
    num_workers=None,
    options=None,
    progress=False,
    verbose=False,
):
    """Applies the given function to each sample in the collection via
     `Apache Beam <https://beam.apache.org>`_.

    When only a ``map_fcn`` is provided, this function effectively performs
    the following map operation with the outer loop in parallel::

        for batch_view in fou.iter_slices(sample_collection, batch_size):
            for sample in batch_view.iter_samples(autosave=save):
                map_fcn(sample)

    When a ``reduce_fcn`` is provided, this function effectively performs the
    following map-reduce operation with the outer loop in parallel:

        reducer = reduce_fcn(...)

        for batch_view in fou.iter_slices(sample_collection, batch_size):
            for sample in batch_view.iter_samples(autosave=save):
                sample_output = sample.map_fcn(sample)

                # Outputs are fed to reducer.add_input()
                yield sample.id, sample_output

        output = reducer.extract_output(...)

    When a ``aggregate_fcn`` is provided, this function effectively performs
    the following map-aggregate operation with the outer loop in parallel::

        outputs = {}

        for batch_view in fou.iter_slices(sample_collection, batch_size):
            for sample in batch_view.iter_samples(autosave=save):
                outputs[sample.id] = map_fcn(sample)

        output = aggregate_fcn(sample_collection, outputs)

    Example::

        import fiftyone as fo
        import fiftyone.utils.beam as foub
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("cifar10", split="train")
        view = dataset.select_fields("ground_truth")

        #
        # Example 1: map-save
        #

        def map_fcn(sample):
            sample.ground_truth.label = sample.ground_truth.label.upper()

        foub.beam_map(view, map_fcn, save=True, progress=True)

        print(dataset.count_values("ground_truth.label"))

        #
        # Example 2: map-reduce
        #

        def map_fcn(sample):
            return sample.ground_truth.label.lower()

        class ReduceFcn(foub.ReduceFcn):
            def create_accumulator(self):
                from collections import Counter
                return Counter()

            def add_input(self, accumulator, input):
                sample_id, value = input
                accumulator[value] += 1
                return accumulator

            def merge_accumulators(self, accumulators):
                from collections import Counter
                accumulator = Counter()
                for a in accumulators:
                    accumulator.update(a)
                return accumulator

            def extract_output(self, accumulator):
                counts = dict(accumulator)
                self._store_output(counts)

        counts = foub.beam_map(view, map_fcn, reduce_fcn=ReduceFcn, progress=True)
        print(counts)

        #
        # Example 3: map-aggregate
        #

        def map_fcn(sample):
            return sample.ground_truth.label.lower()

        def aggregate_fcn(sample_collection, values):
            from collections import Counter
            return dict(Counter(values.values()))

        counts = foub.beam_map(view, map_fcn, aggregate_fcn=aggregate_fcn, progress=True)
        print(counts)

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        map_fcn: a function to apply to each sample
        reduce_fcn (None): an optional :class:`fiftyone.utils.beam.ReduceFcn`
            to reduce the map outputs. See above for usage information
        aggregate_fcn (None): an optional function to aggregate the map
            outputs. See above for usage information
        save (False): whether to save any sample edits applied by ``map_fcn``
        batch_method ("id"): whether to use IDs (``"id"``) or slices
            (``"slice"``) to assign samples to workers
        batch_size (None): an optional number of samples to distribute to each
            worker at a time. By default, samples are evenly distributed to
            workers with one batch per worker
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
        the output of ``reduce_fcn`` or ``aggregate_fcn`` if provided, else
        None
    """
    if batch_method == "slice":
        n = len(sample_collection)
    else:
        ids = sample_collection.values("id")
        n = len(ids)

    if num_workers is None:
        num_workers = fou.recommend_process_pool_workers()

    # Must cap size of select(ids) stages
    if batch_method == "id":
        max_batch_size = fou.recommend_batch_size_for_value(
            ObjectId(), max_size=100000
        )

        if batch_size is not None:
            batch_size = min(batch_size, max_batch_size)
        elif n > num_workers * max_batch_size:
            batch_size = max_batch_size

    if batch_size is not None:
        # Fixed size batches
        edges = list(range(0, n + 1, batch_size))
        if edges[-1] < n:
            edges.append(n)
    else:
        # Split collection into exactly `num_workers` batches
        edges = [int(round(b)) for b in np.linspace(0, n, num_workers + 1)]

    if batch_method == "slice":
        # Slice batches
        slices = list(zip(edges[:-1], edges[1:]))
    else:
        # ID batches
        slices = [ids[i:j] for i, j in zip(edges[:-1], edges[1:])]

    num_batches = len(slices)
    batches = list(
        zip(
            range(num_batches),
            itertools.repeat(num_batches),
            slices,
        )
    )

    if isinstance(sample_collection, fov.DatasetView):
        dataset_name = sample_collection._root_dataset.name
        view_stages = sample_collection._serialize()
    else:
        dataset_name = sample_collection.name
        view_stages = None

    has_reducer = reduce_fcn is not None or aggregate_fcn is not None

    map_batch = MapBatch(
        dataset_name,
        map_fcn,
        view_stages=view_stages,
        save=save,
        return_outputs=has_reducer,
        progress=progress,
    )

    if has_reducer:
        result_key = f"beam_map_{str(ObjectId())}"

        if reduce_fcn is not None:
            reduce_cls = reduce_fcn
        else:
            reduce_cls = ReduceFcn

        reduce_fn = reduce_cls(
            dataset_name,
            view_stages=view_stages,
            aggregate_fcn=aggregate_fcn,
            result_key=result_key,
        )
    else:
        result_key = None
        reduce_fn = None

    if options is None:
        options = PipelineOptions(
            runner="direct",
            direct_num_workers=min(num_workers, num_batches),
            direct_running_mode="multi_processing",
        )

    logger = logging.getLogger()
    level = logger.level if verbose else logging.CRITICAL
    with fou.SetAttributes(logger, level=level):
        with beam.Pipeline(options=options) as pipeline:
            pcoll = (
                pipeline
                | "InitMap" >> beam.Create(batches)
                | "MapBatches" >> beam.ParDo(map_batch)
            )

            if reduce_fn is not None:
                _ = pcoll | "ReduceFcn" >> beam.CombineGlobally(reduce_fn)

    sample_collection.reload()

    if result_key is not None:
        return _get_key(sample_collection, result_key)


class ImportBatch(beam.DoFn):
    def __init__(
        self,
        dataset_name,
        parse_fcn=None,
        expand_schema=True,
        dynamic=False,
        validate=True,
    ):
        self.dataset_name = dataset_name
        self.parse_fcn = parse_fcn
        self.expand_schema = expand_schema
        self.dynamic = dynamic
        self.validate = validate

        self._dataset = None
        self._samples = None

    def setup(self):
        import fiftyone as fo

        self._dataset = fo.load_dataset(self.dataset_name)

    def start_bundle(self):
        self._samples = []

    def process(self, sample):
        import fiftyone as fo

        if self.parse_fcn is not None:
            sample = self.parse_fcn(sample)
        else:
            sample = fo.Sample.from_dict(sample)

        self._samples.append(sample)

    def finish_bundle(self):
        if not self._samples:
            return

        self._dataset.add_samples(
            self._samples,
            expand_schema=self.expand_schema,
            dynamic=self.dynamic,
            validate=self.validate,
            progress=False,
        )


class MergeBatch(beam.DoFn):
    def __init__(
        self,
        dataset_name,
        parse_fcn=None,
        key_field="filepath",
        key_fcn=None,
        expand_schema=True,
        **kwargs,
    ):
        self.dataset_name = dataset_name
        self.parse_fcn = parse_fcn
        self.key_field = key_field
        self.key_fcn = key_fcn
        self.expand_schema = expand_schema
        self.kwargs = kwargs

        self._dataset = None
        self._id_map = None
        self._key_fcn = None
        self._samples = None

    def setup(self):
        import fiftyone as fo

        dataset = fo.load_dataset(self.dataset_name)

        if self.key_fcn is None:
            key_field = self.key_field
            key_fcn = lambda sample: sample[key_field]
            id_map = {k: v for k, v in zip(*dataset.values([key_field, "id"]))}
        else:
            key_fcn = self.key_fcn
            id_map = {key_fcn(s): s.id for s in dataset}

        self._dataset = dataset
        self._key_fcn = key_fcn
        self._id_map = id_map

    def start_bundle(self):
        self._samples = []

    def process(self, sample):
        import fiftyone as fo

        if self.parse_fcn is not None:
            sample = self.parse_fcn(sample)
        else:
            sample = fo.Sample.from_dict(sample)

        self._samples.append(sample)

    def finish_bundle(self):
        import fiftyone.core.dataset as fod
        import fiftyone.core.utils as fou

        if not self._samples:
            return

        kwargs, _ = fou.extract_kwargs_for_function(
            fod._make_merge_samples_generator, self.kwargs
        )

        samples = fod._make_merge_samples_generator(
            self._dataset,
            self._samples,
            self._key_fcn,
            self._id_map,
            expand_schema=self.expand_schema,
            **kwargs,
        )

        self._dataset._upsert_samples(
            samples,
            expand_schema=self.expand_schema,
            progress=False,
        )


class ExportBatch(beam.DoFn):
    def __init__(self, dataset_name, view_stages=None, render_kwargs=None):
        self.dataset_name = dataset_name
        self.view_stages = view_stages
        self.render_kwargs = render_kwargs or self.default_render_kwargs

        self._sample_collection = None

    @staticmethod
    def default_render_kwargs(kwargs, idx):
        _kwargs = {}
        for k, v in kwargs.items():
            if isinstance(v, str):
                try:
                    _kwargs[k] = v % idx
                except:
                    _kwargs[k] = v
            else:
                _kwargs[k] = v

        return _kwargs

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
        import fiftyone as fo
        import fiftyone.core.utils as fou

        idx = element["idx"]
        start = element["start"]
        stop = element["stop"]
        kwargs = self.render_kwargs(kwargs, idx)
        kwargs["progress"] = False

        self._sample_collection[start:stop].export(**kwargs)


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
            with tqdm(total=total, desc=desc, position=i) as pbar:
                for sample in batch_view.iter_samples(autosave=self.save):
                    result = self.map_fcn(sample)
                    if self.return_outputs:
                        yield sample.id, result

                    pbar.update()
        else:
            for sample in batch_view.iter_samples(autosave=self.save):
                result = self.map_fcn(sample)
                if self.return_outputs:
                    yield sample.id, result


class ReduceFcn(beam.CombineFn):
    def __init__(
        self,
        dataset_name,
        view_stages=None,
        aggregate_fcn=None,
        result_key=None,
    ):
        self.dataset_name = dataset_name
        self.view_stages = view_stages
        self.aggregate_fcn = aggregate_fcn
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
        if self.aggregate_fcn is None:
            return

        output = self.aggregate_fcn(self._sample_collection, accumulator)
        if output is None:
            return

        self._store_output(output)

    def _store_output(self, output):
        if self.result_key is None:
            return

        _set_key(self._sample_collection, self.result_key, output)


def _set_key(sample_collection, key, value, ttl=60):
    dataset_id = sample_collection._root_dataset._doc.id
    store = foos.ExecutionStore.create("beam", dataset_id=dataset_id)
    store.set(key, value, ttl=ttl)


def _get_key(sample_collection, key):
    dataset_id = sample_collection._root_dataset._doc.id
    store = foos.ExecutionStore.create("beam", dataset_id=dataset_id)
    return store.get(key)


def _pop_first(x):
    xi = iter(x)

    try:
        x0 = next(xi)
    except StopIteration:
        x0 = None

    return x0, xi
