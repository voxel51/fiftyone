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
        pipeline = self._pipeline + [{"$count": "count"}]
        result = next(dataset_or_view._c.aggregate(pipeline))["count"]
        dataset_or_view.view = {"pipeline": pipeline, "count": result}
        return result

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
