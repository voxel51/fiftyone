"""
Core Module for `fiftyone` DatasetQuery class

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


class DatasetQuery(object):
    def __init__(self):
        """... """
        self._pipeline = []

    def count(self, dataset_or_view=None):
        """Count the number of samples returned by this query

        Args:
            dataset_or_view: the fiftyone.core.dataset.(Dataset or DatasetView)
                to be queried
        """
        return next(
            dataset_or_view._c.aggregate(
                self._pipeline + [{"$count": "count"}]
            )
        )["count"]

    def iter_samples(self, dataset_or_view):
        """Query a dataset

        Args:
            dataset_or_view: the fiftyone.core.dataset.(Dataset or DatasetView)
                to be queried

        Returns:
            an iterator of tuples over the matching samples:
                query_idx: the index relative to the last `offset`. i.e.
                    offset <= query_idx < offset + limit
                the fiftyone.core.sample.Sample object
        """
        query_idx = self._get_latest_offset() - 1
        for s in dataset_or_view._c.aggregate(self._pipeline):
            query_idx += 1
            yield query_idx, dataset_or_view._deserialize(s)

    def export(self, dataset_or_view, export_dir, pretty_print=False):
        """Export the query output to a location on disk

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

        for _, sample in self.iter_samples(dataset_or_view):
            # @todo(Tyler) this doesn't check for duplicate filenames
            data_filepath = os.path.join(data_dir, sample.filename)
            labels_filepath = os.path.join(
                labels_dir, os.path.splitext(sample.filename)[0] + ".json"
            )

            shutil.copy(sample.filepath, data_filepath)
            sample.labels.write_json(
                labels_filepath, pretty_print=pretty_print
            )

    # QUERY OPERATIONS ########################################################

    def filter(self, filter):
        """
        Args:
            filter: a MongoDB query dict

        Returns:
            DatasetQuery instance

        ref: https://docs.mongodb.com/manual/tutorial/query-documents
        """
        return self._create_new_query(stage={"$match": filter})

    def sort(self, field, sort_order=ASCENDING):
        """
        Args:
            field: string field to sort by. Examples:
                    "_id", "filename", "metadata.size_bytes",
                    "metadata.frame_size[0]"
            sort_order: ...

        Returns:
            DatasetQuery instance
        """
        return self._create_new_query(stage={"$sort": {field: sort_order}})

    def offset(self, offset):
        """
        Args:
            offset: ...

        Returns:
            DatasetQuery instance
        """
        return self._create_new_query(stage={"$skip": offset})

    def limit(self, limit):
        """
        Args:
            limit: ...

        Returns:
            DatasetQuery instance
        """
        return self._create_new_query(stage={"$limit": limit})

    def sample(self, size):
        """
        Args:
            limit: ...

        Returns:
            DatasetQuery instance
        """
        return self._create_new_query(stage={"$sample": {"size": size}})

    # PRIVATE #################################################################

    def _create_new_query(self, stage=None):
        new_query = self.__class__()
        new_query._pipeline = deepcopy(self._pipeline)
        if stage:
            new_query._pipeline.append(stage)
        return new_query

    def _get_latest_offset(self):
        """Get the offset of the last $skip stage"""
        for stage in self._pipeline[::-1]:
            if "$skip" in stage:
                return stage["$skip"]
        return 0
