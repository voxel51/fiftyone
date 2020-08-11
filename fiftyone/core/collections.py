"""
Base classes for collections of samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect
import logging
import os

import eta.core.serial as etas

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.core.stages as fos
import fiftyone.types as fot
import fiftyone.utils.annotations as foua
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


def _make_registrar():
    """Makes a decorator that keeps a registry of all functions decorated by
    it.

    Usage::

        my_decorator = _make_registrar()
        my_decorator.all  # dictionary mapping names to functions
    """
    registry = {}

    def registrar(func):
        registry[func.__name__] = func
        # Normally a decorator returns a wrapped function, but here we return
        # `func` unmodified, after registering it
        return func

    registrar.all = registry
    return registrar


# Keeps track of all view stage methods
view_stage = _make_registrar()


class SampleCollection(object):
    """Abstract class representing an ordered collection of
    :class:`fiftyone.core.sample.Sample` instances in a
    :class:`fiftyone.core.dataset.Dataset`.
    """

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return self.summary()

    def __bool__(self):
        return len(self) > 0

    def __len__(self):
        raise NotImplementedError("Subclass must implement __len__()")

    def __contains__(self, sample_id):
        try:
            self[sample_id]
        except KeyError:
            return False

        return True

    def __getitem__(self, sample_id_or_slice):
        raise NotImplementedError("Subclass must implement __getitem__()")

    def __iter__(self):
        return self.iter_samples()

    @property
    def name(self):
        """The name of the collection."""
        raise NotImplementedError("Subclass must implement name")

    def summary(self):
        """Returns a string summary of the collection.

        Returns:
            a string summary
        """
        raise NotImplementedError("Subclass must implement summary()")

    def first(self):
        """Returns the first sample in the collection.

        Returns:
            a :class:`fiftyone.core.sample.Sample` or
            :class:`fiftyone.core.sample.SampleView`

        Raises:
            ValueError: if the collection is empty
        """
        try:
            return next(iter(self))
        except StopIteration:
            raise ValueError("%s is empty" % self.__class__.__name__)

    def last(self):
        """Returns the last sample in the collection.

        Returns:
            a :class:`fiftyone.core.sample.Sample` or
            :class:`fiftyone.core.sample.SampleView`

        Raises:
            ValueError: if the collection is empty
        """
        return self[-1:].first()

    def head(self, num_samples=3):
        """Returns a list of the first few samples in the collection.

        If fewer than ``num_samples`` samples are in the collection, only
        the available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [s for s in self[:num_samples]]

    def tail(self, num_samples=3):
        """Returns a list of the last few samples in the collection.

        If fewer than ``num_samples`` samples are in the collection, only
        the available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [s for s in self[-num_samples:]]

    def iter_samples(self):
        """Returns an iterator over the samples in the collection.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` or
            :class:`fiftyone.core.sample.SampleView` instances
        """
        raise NotImplementedError("Subclass must implement iter_samples()")

    def get_field_schema(self, ftype=None, embedded_doc_type=None):
        """Returns a schema dictionary describing the fields of the samples in
        the collection.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:``fiftyone.core.fields.Field``
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:``fiftyone.core.odm.BaseEmbeddedDocument``

        Returns:
             a dictionary mapping field names to field types
        """
        raise NotImplementedError("Subclass must implement get_field_schema()")

    def get_tags(self):
        """Returns the list of unique tags of samples in the collection.

        Returns:
            a list of tags
        """
        raise NotImplementedError("Subclass must implement get_tags()")

    def compute_metadata(self, overwrite=False):
        """Populates the ``metadata`` field of all samples in the collection.

        Any samples with existing metadata are skipped, unless
        ``overwrite == True``.

        Args:
            overwrite (False): whether to overwrite existing metadata
        """
        with fou.ProgressBar() as pb:
            for sample in pb(self):
                if sample.metadata is None or overwrite:
                    sample.compute_metadata()

    @classmethod
    def list_view_stages(cls):
        """Returns a list of all available methods on this collection that
        apply :class:`fiftyone.core.stages.ViewStage` operations that return
        :class:`fiftyone.core.view.DatasetView` instances.

        Returns:
            a list of :class:`SampleCollection` method names
        """
        return list(view_stage.all)

    @view_stage
    def exclude(self, sample_ids):
        """Excludes the samples with the given IDs from the collection.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Exclude(sample_ids))

    @view_stage
    def exclude_fields(self, field_names):
        """Excludes the fields with the given names from the returned
        :class:`fiftyone.core.sample.SampleView` instances.

        Note: Default fields cannot be excluded.

        Args:
            field_names: a field name or iterable of field names to exclude

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.ExcludeFields(field_names))

    @view_stage
    def exists(self, field):
        """Returns a view containing the samples that have a non-``None`` value
        for the given field.

        Args:
            field: the field

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Exists(field))

    @view_stage
    def filter_classifications(self, field, filter):
        """Filters the classifications of the given
        :class:`fiftyone.core.labels.Classifications` field.

        Elements of ``<field>.classifications`` for which ``filter`` returns
        ``False`` are omitted from the field.

        Args:
            field: the :class:`fiftyone.core.labels.Classifications` field
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.FilterClassifications(field, filter))

    @view_stage
    def filter_detections(self, field, filter):
        """Filters the detections of the given
        :class:`fiftyone.core.labels.Detections` field.

        Elements of ``<field>.detections`` for which ``filter`` returns
        ``False`` are omitted from the field.

        Args:
            field: the :class:`fiftyone.core.labels.Detections` field
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.FilterDetections(field, filter))

    @view_stage
    def limit(self, limit):
        """Returns a view with at most the given number of samples.

        Args:
            limit: the maximum number of samples to return. If a non-positive
                number is provided, an empty view is returned

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Limit(limit))

    @view_stage
    def match(self, filter):
        """Filters the samples in the collection by the given filter.

        Samples for which ``filter`` returns ``False`` are omitted.

        Args:
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Match(filter))

    @view_stage
    def match_tag(self, tag):
        """Returns a view containing the samples that have the given tag.

        Args:
            tag: a tag

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.MatchTag(tag))

    @view_stage
    def match_tags(self, tags):
        """Returns a view containing the samples that have any of the given
        tags.

        To match samples that must contain multiple tags, chain multiple
        :meth:`match_tag` or :meth:`match_tags` calls together.

        Args:
            tags: an iterable of tags

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.MatchTags(tags))

    @view_stage
    def mongo(self, pipeline):
        """Adds a view stage defined by a raw MongoDB aggregation pipeline.

        See `MongoDB aggregation pipelines <https://docs.mongodb.com/manual/core/aggregation-pipeline/>`_
        for more details.

        Args:
            pipeline: a MongoDB aggregation pipeline (list of dicts)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Mongo(pipeline))

    @view_stage
    def select(self, sample_ids):
        """Returns a view containing only the samples with the given IDs.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Select(sample_ids))

    @view_stage
    def select_fields(self, field_names=None):
        """Selects the fields with the given names as the *only* fields
        present in the returned :class:`fiftyone.core.sample.SampleView`
        instances. All other fields are excluded.

        Note: Default sample fields are always selected and will be added if
        not included in ``field_names``.

        Args:
            field_names (None): a field name or iterable of field names to
                select. If not specified, just the default fields will be
                selected

        Returns:
            a :class:`DatasetView`
        """
        return self._add_view_stage(fos.SelectFields(field_names))

    @view_stage
    def shuffle(self, seed=None):
        """Randomly shuffles the samples in the collection.

        Args:
            seed (None): an optional random seed to use when shuffling the
                samples

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Shuffle(seed=seed))

    @view_stage
    def skip(self, skip):
        """Omits the given number of samples from the head of the collection.

        Args:
            skip: the number of samples to skip. If a non-positive number is
                provided, no samples are omitted

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Skip(skip))

    @view_stage
    def sort_by(self, field_or_expr, reverse=False):
        """Sorts the samples in the collection by the given field or
        expression.

        When sorting by an expression, ``field_or_expr`` can either be a
        :class:`fiftyone.core.expressions.ViewExpression` or a
        `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
        that defines the quantity to sort by.

        Args:
            field_or_expr: the field or expression to sort by
            reverse (False): whether to return the results in descending order

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.SortBy(field_or_expr, reverse=reverse))

    @view_stage
    def take(self, size, seed=None):
        """Randomly samples the given number of samples from the collection.

        Args:
            size: the number of samples to return. If a non-positive number is
                provided, an empty view is returned
            seed (None): an optional random seed to use when selecting the
                samples

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Take(size, seed=seed))

    def draw_labels(self, anno_dir, label_fields=None, annotation_config=None):
        """Renders annotated versions of the samples in the collection with
        label field(s) overlaid to the given directory.

        The filenames of the sample data are maintained, unless a name conflict
        would occur in ``anno_dir``, in which case an index of the form
        ``"-%d" % count`` is appended to the base filename.

        Images are written in format ``fo.config.default_image_ext``.

        Args:
            anno_dir: the directory to write the annotated files
            label_fields (None): a list of :class:`fiftyone.core.labels.Label`
                fields to render. By default, all
                :class:`fiftyone.core.labels.Label` fields are drawn
            annotation_config (None): an
                :class:`fiftyone.utils.annotations.AnnotationConfig` specifying
                how to render the annotations

        Returns:
            the list of paths to the labeled images
        """
        label_fields_schema = self.get_field_schema(
            ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
        )

        if label_fields is None:
            label_fields = list(label_fields_schema.keys())

        non_image_label_fields = [
            lf
            for lf in label_fields
            if not issubclass(
                label_fields_schema[lf].document_type, fol.ImageLabel
            )
        ]

        if non_image_label_fields:
            raise ValueError(
                "Cannot draw label fields %s; only "
                "`fiftyone.core.labels.ImageLabel` fields are supported"
            )

        # Draw labeled images
        return foua.draw_labeled_images(
            self, label_fields, anno_dir, annotation_config=annotation_config,
        )

    def export(
        self,
        export_dir=None,
        dataset_type=None,
        dataset_exporter=None,
        label_field=None,
        **kwargs
    ):
        """Exports the samples in the collection to disk.

        Provide either ``export_dir`` and ``dataset_type`` or
        ``dataset_exporter`` to perform an export.

        Args:
            export_dir (None): the directory to which to export the samples in
                format ``dataset_type``
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type to write. If
                not specified, the default type for ``label_field`` is used
            dataset_exporter (None): a
                :class:`fiftyone.utils.data.exporters.DatasetExporter` to use
                to export the samples
            label_field (None): the name of the label field to export, if
                applicable. If not specified and the requested output type is
                a labeled dataset, the first field of compatible type for the
                output format is used
            **kwargs: optional keyword arguments to pass to
                ``dataset_type.get_dataset_exporter_cls(export_dir, **kwargs)``
        """
        if dataset_type is not None and inspect.isclass(dataset_type):
            dataset_type = dataset_type()

        # If no dataset type or exporter was provided, choose the default type
        # for the label field
        if dataset_type is None and dataset_exporter is None:
            dataset_type = _get_default_dataset_type(self, label_field)

        # If no dataset exporter was provided, construct one based on the
        # dataset type
        if dataset_exporter is None:
            dataset_exporter_cls = dataset_type.get_dataset_exporter_cls()
            dataset_exporter = dataset_exporter_cls(export_dir, **kwargs)

        # If no label field was provided, choose the first label field that is
        # compatible with the dataset exporter
        if label_field is None:
            label_field = _get_default_label_field_for_exporter(
                self, dataset_exporter
            )

        # Export the dataset
        foud.export_samples(
            self, dataset_exporter=dataset_exporter, label_field=label_field
        )

    def aggregate(self, pipeline=None):
        """Calls the collection's current MongoDB aggregation pipeline.

        Args:
            pipeline (None): an optional aggregation pipeline (list of dicts)
                to append to the collections's pipeline before calling it

        Returns:
            an iterable over the aggregation result
        """
        raise NotImplementedError("Subclass must implement aggregate()")

    def to_dict(self, rel_dir=None):
        """Returns a JSON dictionary representation of the collection.

        Args:
            rel_dir (None): a relative directory to remove from the
                ``filepath`` of each sample, if possible. The path is converted
                to an absolute path (if necessary) via
                ``os.path.abspath(os.path.expanduser(rel_dir))``. The typical
                use case for this argument is that your source data lives in
                a single directory and you wish to serialize relative, rather
                than absolute, paths to the data within that directory

        Returns:
            a JSON dict
        """
        if rel_dir is not None:
            rel_dir = (
                os.path.abspath(os.path.expanduser(rel_dir)) + os.path.sep
            )
            len_rel_dir = len(rel_dir)

        # Get field schema
        fields = self.get_field_schema()

        # Serialize samples
        samples = []
        with fou.ProgressBar() as pb:
            for sample in pb(self):
                d = sample.to_dict()
                if rel_dir and d["filepath"].startswith(rel_dir):
                    d["filepath"] = d["filepath"][len_rel_dir:]

                samples.append(d)

        return {
            "name": self.name,
            "num_samples": len(self),
            "tags": self.get_tags(),
            "sample_fields": {
                field_name: str(field) for field_name, field in fields.items()
            },
            "samples": samples,
        }

    def to_json(self, rel_dir=None, pretty_print=False):
        """Returns a JSON string representation of the collection.

        The samples will be written as a list in a top-level ``samples`` field
        of the returned dictionary.

        Args:
            rel_dir (None): a relative directory to remove from the
                ``filepath`` of each sample, if possible. The path is converted
                to an absolute path (if necessary) via
                ``os.path.abspath(os.path.expanduser(rel_dir))``. The typical
                use case for this argument is that your source data lives in
                a single directory and you wish to serialize relative, rather
                than absolute, paths to the data within that directory
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations

        Returns:
            a JSON string
        """
        return etas.json_to_str(
            self.to_dict(rel_dir=rel_dir), pretty_print=pretty_print
        )

    def write_json(self, json_path, rel_dir=None, pretty_print=False):
        """Writes the colllection to disk in JSON format.

        Args:
            json_path: the path to write the JSON
            rel_dir (None): a relative directory to remove from the
                ``filepath`` of each sample, if possible. The path is converted
                to an absolute path (if necessary) via
                ``os.path.abspath(os.path.expanduser(rel_dir))``. The typical
                use case for this argument is that your source data lives in
                a single directory and you wish to serialize relative, rather
                than absolute, paths to the data within that directory
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations
        """
        etas.write_json(
            self.to_dict(rel_dir=rel_dir),
            json_path,
            pretty_print=pretty_print,
        )

    def _add_view_stage(self, stage):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        contents of the collection with the given
        :class:fiftyone.core.stages.ViewStage` appended to its aggregation
        pipeline.

        Args:
            a :class:fiftyone.core.stages.ViewStage`

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        raise NotImplementedError("Subclass must implement _add_view_stage()")


def _get_default_dataset_type(sample_collection, label_field):
    if label_field is None:
        return fot.ImageDirectory()

    sample = next(iter(sample_collection))
    label = sample[label_field]

    if isinstance(label, fol.Classification):
        return fot.FiftyOneImageClassificationDataset()

    if isinstance(label, fol.Detections):
        return fot.FiftyOneImageDetectionDataset()

    if isinstance(label, fol.ImageLabels):
        return fot.FiftyOneImageLabelsDataset()

    raise ValueError("Unsupported label type %s" % type(label))


def _get_default_label_field_for_exporter(sample_collection, dataset_exporter):
    if isinstance(dataset_exporter, foud.LabeledImageDatasetExporter):
        label_cls = dataset_exporter.label_cls
        label_fields = sample_collection.get_field_schema(
            ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
        )
        for field, field_type in label_fields.items():
            if issubclass(field_type.document_type, label_cls):
                return field

        raise ValueError(
            "No compatible label field of type %s found" % label_cls
        )

    return None
