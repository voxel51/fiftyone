"""
`Apache Beam <https://beam.apache.org>`_ utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import multiprocessing
import numpy as np

import fiftyone.core.dataset as fod
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

fou.ensure_import("apache_beam")

import apache_beam as beam
from apache_beam.options.pipeline_options import PipelineOptions


def beam_import(
    dataset,
    samples,
    parse_fcn=None,
    expand_schema=True,
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
        validate (True): whether to validate that the fields of each sample
            are compliant with the dataset schema before adding it
        options (None): a
            ``apache_beam.options.pipeline_options.PipelineOptions`` that
            configures how to run the pipeline. By default, the pipeline will
            be run via Beam's direct runner using
            ``multiprocessing.cpu_count()`` threads
        verbose (False): whether to log the Beam pipeline's messages
    """
    if options is None:
        options = PipelineOptions(
            runner="direct",
            direct_num_workers=multiprocessing.cpu_count(),
            direct_running_mode="multi_threading",
        )

    sample0, samples = _pop_first(samples)

    if sample0 is None:
        return  # empty

    if parse_fcn is not None:
        sample0 = parse_fcn(sample0)

    # Manually insert first sample to reduce chances of parallel schema changes
    dataset.add_sample(sample0, expand_schema=expand_schema, validate=validate)

    if parse_fcn is None:
        # `Sample` objects are not serializable so we must manually serialize
        # and deserialize in `ImportBatch`
        samples = map(lambda s: s.to_mongo_dict(include_id=True), samples)

    import_batch = ImportBatch(
        dataset.name,
        parse_fcn=parse_fcn,
        expand_schema=expand_schema,
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
            be run via Beam's direct runner using
            ``multiprocessing.cpu_count()`` threads
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
            direct_num_workers=multiprocessing.cpu_count(),
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
            be run via Beam's direct runner using
            ``min(num_shards, multiprocessing.cpu_count())`` processes
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
        num_workers = min(num_shards, multiprocessing.cpu_count())
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


class ImportBatch(beam.DoFn):
    def __init__(
        self, dataset_name, parse_fcn=None, expand_schema=True, validate=True
    ):
        self.dataset_name = dataset_name
        self.parse_fcn = parse_fcn
        self.expand_schema = expand_schema
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
        if self._samples:
            self._dataset._add_samples_batch(
                self._samples, self.expand_schema, self.validate
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

        self._dataset._upsert_samples_batch(
            list(samples), self.expand_schema, True
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

        with fou.SetAttributes(fo.config, show_progress_bars=False):
            self._sample_collection[start:stop].export(**kwargs)


def _pop_first(x):
    xi = iter(x)

    try:
        x0 = next(xi)
    except StopIteration:
        x0 = None

    return x0, xi
