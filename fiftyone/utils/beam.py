"""
`Apache Beam <https://beam.apache.org>`_ utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import multiprocessing
import numpy as np

import fiftyone.core.utils as fou
import fiftyone.core.view as fov

fou.ensure_import("apache_beam")

import apache_beam as beam
from apache_beam.options.pipeline_options import PipelineOptions


def beam_export(
    sample_collection, num_shards, options=None, render_kwargs=None, **kwargs
):
    """Exports the given sample collection in the specified number shards via
    `Apache Beam <https://beam.apache.org>`_.

    This function is a parallelized alternative to directly calling
    :meth:`fiftyone.core.collections.SampleCollection.export`.

    Example::

        from apache_beam.options.pipeline_options import PipelineOptions
        import eta.core.utils as etau

        import fiftyone as fo
        import fiftyone.utils.beam as foub
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        options = PipelineOptions(
            runner="direct",
            direct_num_workers=10,
            direct_running_mode="multi_threading",
        )

        etau.ensure_dir("/tmp/beam")

        foub.beam_export(
            dataset,
            num_shards=10,
            options=options,
            dataset_type=fo.types.TFObjectDetectionDataset,
            label_field="ground_truth",
            tf_records_path="/tmp/beam/tf.records-%05d-of-00010",
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
        dataset_name, view_stages=view_stages, render_kwargs=render_kwargs,
    )

    n = len(sample_collection)
    edges = [int(round(b)) for b in np.linspace(0, n, num_shards + 1)]

    batches = [
        {"idx": idx, "start": start, "stop": stop}
        for idx, (start, stop) in enumerate(zip(edges[:-1], edges[1:]), 1)
    ]

    with beam.Pipeline(options=options) as pipeline:
        _ = (
            pipeline
            | "CreateBatches" >> beam.Create(batches)
            | "ExportBatches" >> beam.ParDo(export_batch, **kwargs)
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
