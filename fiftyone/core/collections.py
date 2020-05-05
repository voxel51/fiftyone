"""
Core definitions of FiftyOne sample collections.

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

import eta.core.utils as etau

import fiftyone.core.labels as fol


class SampleCollection(object):
    """Abstract class representing a collection of
    :class:`fiftyone.core.sample.Sample` instances.
    """

    def __len__(self):
        raise NotImplementedError("Subclass must implement __len__()")

    def __getitem__(self, sample_id):
        raise NotImplementedError("Subclass must implement __getitem__()")

    def get_tags(self):
        raise NotImplementedError("Subclass must implement get_tags()")

    def get_label_groups(self):
        raise NotImplementedError("Subclass must implement get_label_groups()")

    def get_insight_groups(self):
        raise NotImplementedError(
            "Subclass must implement get_insight_groups()"
        )

    def iter_samples(self):
        raise NotImplementedError("Subclass must implement iter_samples()")

    def export(self, group, export_dir):
        """Exports the view to disk in the specified directory.

        Args:
            group: the label group to export
            export_dir: the directory to which to write the export
        """
        data_paths = []
        labels = []
        for sample in self.iter_samples():
            data_paths.append(sample.filepath)
            labels.append(
                sample.labels[group]
            )  # @todo `labels` is not yet a dict...

        if not labels:
            return

        if isinstance(labels[0], fol.ClassificationLabel):
            # @todo export as classification dataset
            #
            # proposal:
            #   labels.json
            #   images/
            #       <filename>.<ext>
            #
            raise ValueError("Not yet implemented")
        if isinstance(labels[0], fol.DetectionLabels):
            # @todo export as a detection dataset
            #
            # proposal:
            #   labels.json
            #   images/
            #       <filename>.<ext>
            #
            raise ValueError("Not yet implemented")
        elif isinstance(labels[0], fol.ImageLabels):
            # @todo Export as ``eta.core.datasets.LabeledImageDataset``
            raise ValueError("Not yet implemented")
        else:
            raise ValueError(
                "Cannot export labels of type '%s'"
                % etau.get_class_name(labels[0])
            )
