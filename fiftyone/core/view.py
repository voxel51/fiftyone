"""
Core Module for `fiftyone` DatasetView class

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
from copy import deepcopy
import os
import shutil

import eta.core.utils as etau


ASCENDING = 1
DESCENDING = -1


class SampleCollection(object):
    def __len__(self):
        raise NotImplementedError("Subclass must implement")

    def __getitem__(self, sample_id):
        raise NotImplementedError("Subclass must implement")

    def get_tags(self):
        raise NotImplementedError("Subclass must implement")

    def get_label_groups(self):
        raise NotImplementedError("Subclass must implement")

    def get_insight_groups(self):
        raise NotImplementedError("Subclass must implement")

    def iter_samples(self):
        raise NotImplementedError("Subclass must implement")

    def export(self, export_dir, pretty_print=False):
        """Export the view to a location on disk

        Args:
            dataset_or_view: the fiftyone.core.dataset.(Dataset or DatasetView)
                to be queried
            export_dir: the name of the directory to export to
        """
        export_dir = os.path.expanduser(export_dir)

        etau.ensure_empty_dir(export_dir)

        data_dir = os.path.join(export_dir, "data")
        labels_dir = os.path.join(export_dir, "labels")
        etau.ensure_dir(data_dir)
        etau.ensure_dir(labels_dir)

        for _, sample in self.iter_samples():
            # @todo(Tyler) this doesn't check for duplicate filenames
            data_filepath = os.path.join(data_dir, sample.filename)
            labels_filepath = os.path.join(
                labels_dir, os.path.splitext(sample.filename)[0] + ".json"
            )

            shutil.copy(sample.filepath, data_filepath)
            sample.labels.write_json(
                labels_filepath, pretty_print=pretty_print
            )


class DatasetView(SampleCollection):
    def __init__(self, dataset):
        """... """
        self.dataset = dataset
        self._pipeline = []

    def __len__(self):
        """Count the number of samples returned by this view"""
        return next(
            self.dataset._c.aggregate(self._pipeline + [{"$count": "count"}])
        )["count"]

    def __getitem__(self, sample_id):
        return self.dataset[sample_id]

    def iter_samples(self):
        """Iterate over the samples in the view

        Returns:
            an iterator over the matching samples
        """
        for s in self.dataset._c.aggregate(self._pipeline):
            yield self.dataset._deserialize(s)

    def iter_samples_with_view_index(self):
        """Query a dataset

        Returns:
            an iterator of tuples over the matching samples:
                view_idx: the index relative to the last `offset`. i.e.
                    offset <= view_idx < offset + limit
                the fiftyone.core.sample.Sample object
        """
        view_idx = self._get_latest_offset() - 1
        for s in self.dataset._c.aggregate(self._pipeline):
            view_idx += 1
            yield view_idx, self.dataset._deserialize(s)


    # VIEW OPERATIONS #########################################################

    def filter(self, filter):
        """
        Args:
            filter: a MongoDB query dict

        Returns:
            DatasetView instance

        ref: https://docs.mongodb.com/manual/tutorial/query-documents
        """
        return self._create_new_view(stage={"$match": filter})

    def sort(self, field, sort_order=ASCENDING):
        """
        Args:
            field: string field to sort by. Examples:
                    "_id", "filename", "metadata.size_bytes",
                    "metadata.frame_size[0]"
            sort_order: ...

        Returns:
            DatasetView instance
        """
        return self._create_new_view(stage={"$sort": {field: sort_order}})

    def offset(self, offset):
        """
        Args:
            offset: ...

        Returns:
            DatasetView instance
        """
        return self._create_new_view(stage={"$skip": offset})

    def limit(self, limit):
        """
        Args:
            limit: ...

        Returns:
            DatasetView instance
        """
        return self._create_new_view(stage={"$limit": limit})

    def sample(self, size):
        """
        Args:
            limit: ...

        Returns:
            DatasetView instance
        """
        return self._create_new_view(stage={"$sample": {"size": size}})

    # PRIVATE #################################################################

    def _create_new_view(self, stage=None):
        new_view = self.__class__(dataset=self.dataset)
        new_view._pipeline = deepcopy(self._pipeline)
        if stage:
            new_view._pipeline.append(stage)
        return new_view

    def _get_latest_offset(self):
        """Get the offset of the last $skip stage"""
        for stage in self._pipeline[::-1]:
            if "$skip" in stage:
                return stage["$skip"]
        return 0
