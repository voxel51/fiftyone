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

import logging

import eta.core.serial as etas

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.coco as fouco
import fiftyone.utils.cvat as foucv
import fiftyone.utils.data as foud
import fiftyone.utils.tf as fout
import fiftyone.utils.voc as fouv


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
        ``overwrite == True`.

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
        self, export_dir, label_field=None, dataset_type=None, **kwargs
    ):
        """Exports the samples in the collection to disk as a labeled dataset.

        Args:
            export_dir: the directory to which to export
            label_field (None): the name of the label field to export. If not
                specified, the first field of compatible type to
                ``dataset_type`` is exported
            dataset_type (None): the :class:`fiftyone.types.Dataset` format in
                which to export. If not specified, the default type for
                ``label_field`` is used
        """
        if label_field is None:
            label_fields = self.get_field_schema(
                ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
            )
            # @todo implement this

        if dataset_type is None:
            sample = next(self.iter_samples())
            label = sample[label_field]
            label_type = type(label)
            # @todo implement this

        if isinstance(dataset_type, fot.ImageClassificationDataset):
            foud.export_image_classification_dataset(
                self, label_field, export_dir, **kwargs
            )
        elif isinstance(dataset_type, fot.TFImageClassificationDataset):
            fout.export_tf_image_classification_dataset(
                self, label_field, export_dir, **kwargs
            )
        elif isinstance(dataset_type, fot.ImageDetectionDataset):
            foud.export_image_detection_dataset(
                self, label_field, export_dir, **kwargs
            )
        elif isinstance(dataset_type, fot.COCODetectionDataset):
            return fouco.export_coco_detection_dataset(
                self, label_field, export_dir, **kwargs
            )
        elif isinstance(dataset_type, fot.VOCDetectionDataset):
            return fouv.export_voc_detection_dataset(
                self, label_field, export_dir, **kwargs
            )
        elif isinstance(dataset_type, fot.TFObjectDetectionDataset):
            return fout.export_tf_object_detection_dataset(
                self, label_field, export_dir, **kwargs
            )
        elif isinstance(dataset_type, fot.CVATImageDataset):
            return foucv.export_cvat_image_dataset(
                self, label_field, export_dir, **kwargs
            )
        elif isinstance(dataset_type, fot.ImageLabelsDataset):
            foud.export_image_labels_dataset(
                self, label_field, export_dir, **kwargs
            )
        else:
            raise ValueError("Unsupported dataset type '%s'" % dataset_type)

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
        """Writes the colllection to disk

        Args:
            json_path: the path to write the JSON
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations
        """
        etas.write_json(self.to_dict(), json_path, pretty_print=pretty_print)
