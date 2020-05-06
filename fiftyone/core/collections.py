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
import fiftyone.core.odm as foo


class SampleCollection(object):
    """Abstract class representing a collection of
    :class:`fiftyone.core.sample.Sample` instances.
    """

    def __bool__(self):
        return len(self) > 0

    def __len__(self):
        return self._get_query_set().count()

    def __contains__(self, sample_id):
        samples = self._get_query_set(id=sample_id)
        return bool(samples)

    def __getitem__(self, sample_id):
        samples = self._get_query_set(id=sample_id)
        if not samples:
            raise ValueError("No sample found with ID '%s'" % sample_id)

        return self._sample_class(samples[0])

    def get_tags(self):
        """Returns the list of tags for this SampleCollection.

        Returns:
            a list of tags
        """
        return self._get_query_set().distinct("tags")

    def get_label_groups(self):
        """Returns the list of label groups attached to at least one sample
        in the SampleCollection.

        Returns:
            a list of groups
        """
        return self._get_query_set().distinct("labels.group")

    def get_insight_groups(self):
        """Returns the list of insight groups attached to at least one sample
        in the SampleCollection.

        Returns:
            a list of groups
        """
        return self._get_query_set().distinct("insights.group")

    def iter_samples(self, offset=None, limit=None):
        """Returns an iterator over the samples in the SampleCollection.

        Args:
            offset: the integer offset to start iterating at
            limit: the maximum number of samples to iterate over

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        query_set = self._get_query_set()

        if offset is not None:
            query_set = query_set.skip(offset)

        if limit is not None:
            query_set = query_set.limit(limit)

        for doc in query_set:
            yield self._sample_class(doc)

    def iter_samples_with_index(self, offset=None, limit=None):
        """Returns an iterator over the samples in the SampleCollection with
        integer indices.

        Args:
            offset: the integer offset to start iterating at
            limit: the maximum number of samples to iterate over

        Returns:
            an iterator over tuples of:
                - integer index relative to the offset
                        offset <= view_idx < offset + limit
                - :class:`fiftyone.core.sample.Sample` instances
        """
        iterator = self.iter_samples(offset=offset, limit=limit)
        for idx, sample in enumerate(iterator, start=offset):
            yield idx, sample

    def export(self, group, export_dir):
        """Exports the labeled samples in the collection for the given label
        group to disk in the specified directory.

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

    @property
    def _sample_class(self):
        raise NotImplementedError(
            "Subclass must implement _get_sample_class()"
        )

    def _get_query_set(self, **kwargs):
        raise NotImplementedError(
            "Subclass must implement _get_sample_objects()"
        )
