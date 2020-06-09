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
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
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

    def get_tags(self):
        """Returns the list of tags in the collection.

        Returns:
            a list of tags
        """
        raise NotImplementedError("Subclass must implement get_tags()")

    def iter_samples(self):
        """Returns an iterator over the samples in the collection.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        raise NotImplementedError("Subclass must implement iter_samples()")

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

    # @todo give user more control over export format/schema here...
    def export(self, label_field, export_dir):
        """Exports the samples in the collection to disk as a labeled dataset,
        using the given label field as labels.

        The format of the dataset on disk will depend on the
        :class:`fiftyone.core.labels.Label` class of the labels in the
        specified group.

        Args:
            label_field: the name of the label field to export
            export_dir: the directory to which to export
        """
        if not self:
            logger.warning("No samples to export; returning now")
            return

        label = next(self.iter_samples())
        if isinstance(label, fol.Classification):
            foud.export_image_classification_dataset(
                self, label_field, export_dir
            )
        elif isinstance(label, fol.Detections):
            foud.export_image_detection_dataset(self, label_field, export_dir)
        elif isinstance(label, fol.ImageLabels):
            foud.export_image_labels_dataset(self, label_field, export_dir)
        else:
            raise ValueError(
                "Cannot export labels of type '%s'"
                % etau.get_class_name(label)
            )

    def to_dict(self):
        """Returns a JSON dictionary representation of the collection.

        The samples will be written as a list in a top-level ``samples`` field
        of the returned dictionary.

        Returns:
            a JSON dict
        """
        samples = [s.to_dict(extended=True, include_id=False) for s in self]
        return {"samples": samples}

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
