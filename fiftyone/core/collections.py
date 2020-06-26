"""
Base classes for collections of samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import inspect
import logging

import eta.core.serial as etas

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class SampleCollection(object):
    """Abstract class representing a collection of
    :class:`fiftyone.core.sample.Sample` instances.
    """

    def __str__(self):
        return self.summary()

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

    def __getitem__(self, sample_id):
        raise NotImplementedError("Subclass must implement __getitem__()")

    def __iter__(self):
        return self.iter_samples()

    def summary(self):
        """Returns a string summary of the collection.

        Returns:
            a string summary
        """
        raise NotImplementedError("Subclass must implement summary()")

    def iter_samples(self):
        """Returns an iterator over the samples in the collection.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
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
                :class:``fiftyone.core.odm.ODMEmbeddedDocument``

        Returns:
             a dictionary mapping field names to field types
        """
        raise NotImplementedError("Subclass must implement get_field_schema()")

    def get_tags(self):
        """Returns the list of tags in the collection.

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

    def aggregate(self, pipeline=None):
        """Calls the current MongoDB aggregation pipeline on the collection.

        Args:
            pipeline (None): an optional aggregation pipeline (list of dicts)
                to aggregate on

        Returns:
            an iterable over the aggregation result
        """
        raise NotImplementedError("Subclass must implement aggregate()")

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
            dataset_type (None): the dataset type in which to export. Must be a
                subclass of :class:`fiftyone.types.BaseDataset`. If not
                specified, the default type for ``label_field`` is used
            dataset_exporter (None): a
                :class:`fiftyone.utils.data.DatasetExporter` to use to export
                the samples
            label_field (None): the name of the label field to export. If not
                specified, the first field of compatible type for the specified
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
        foud.export_samples(self, dataset_exporter, label_field=label_field)

    def to_dict(self):
        """Returns a JSON dictionary representation of the collection.

        The samples will be written as a list in a top-level ``samples`` field
        of the returned dictionary.

        Returns:
            a JSON dict
        """
        return {"samples": [s.to_dict() for s in self]}

    def to_json(self, pretty_print=False):
        """Returns a JSON string representation of the collection.

        The samples will be written as a list in a top-level ``samples`` field
        of the returned dictionary.

        Args:
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations

        Returns:
            a JSON string
        """
        return etas.json_to_str(self.to_dict(), pretty_print=pretty_print)

    def write_json(self, json_path, pretty_print=False):
        """Writes the colllection to disk in JSON format.

        Args:
            json_path: the path to write the JSON
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations
        """
        etas.write_json(self.to_dict(), json_path, pretty_print=pretty_print)


def _get_default_dataset_type(sample_collection, label_field):
    if label_field is None:
        return fot.ImageDirectory()

    sample = next(iter(sample_collection))
    label = sample[label_field]

    if isinstance(label, fol.Classification):
        return fot.ImageClassificationDataset()

    if isinstance(label, fol.Detections):
        return fot.ImageDetectionDataset()

    if isinstance(label, fol.ImageLabels):
        return fot.ImageLabelsDataset()

    raise ValueError("Unsupported label type %s" % type(label))


def _get_default_label_field_for_exporter(sample_collection, dataset_exporter):
    if isinstance(dataset_exporter, foud.UnlabeledImageDatasetExporter):
        return None

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

    raise ValueError("Unsupported dataset exporter type %s" % dataset_exporter)
