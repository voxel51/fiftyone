"""
Core definitions of FiftyOne dataset views.

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

import fiftyone.core.collections as foc


class DatasetView(foc.SampleCollection):
    """A view into a :class:`fiftyone.core.dataset.Dataset`.

    Dataset views represent read-only collections of
    :class:`fiftyone.core.sample.Sample` instances in a dataset.

    Operations on dataset views are designed to be chained together to yield
    the desired subset of the dataset, which is then iterated over to directly
    access the samples.

    Example use::

        # Print the metadata of the five largest samples in the dataset
        view = (dataset.view()
            sort_by("metadata.size_bytes")
            take(5)
        )
        for sample in view:
            print(sample.metadata)

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
    """

    def __init__(self, dataset):
        self._dataset = dataset
        self._query_kwargs = {}
        self._sort_by_arg = None

    @property
    def dataset(self):
        return self._dataset

    # VIEW OPERATIONS #########################################################

    def sort_by(self, field, reverse=False):
        """Sorts the samples in the view by the given field.

        Args:
            field: the field to sort by. Example fields::

                filename
                metadata.size_bytes
                metadata.frame_size[0]

            reverse (False): whether to return the results in descending order
        """
        if reverse:
            # descending
            field = "-" + field
        self._sort_by_arg = field
        return self

    def take(self, size, random=False):
        """Takes the given number of samples from the view.

        Args:
            size: the number of samples to return
            random (False): whether to randomly select the samples

        Returns:
            a :class:`DatasetView`
        """
        if random:
            stage = {"$sample": {"size": size}}

        stage = {"$limit": size}

        raise NotImplementedError("TODO")

    def filter(
        self, tag=None, insight_group=None, labels_group=None, filter=None
    ):
        """Filters the samples in the view by the given filter.

        Args:
            tag: a sample tag string
            insight_group: an insight group string
            labels_group: a labels group string
            filter: a MongoDB query dict
                ref: https://docs.mongodb.com/manual/tutorial/query-documents/
        """
        if tag is not None:
            self._query_kwargs["tags"] = tag

        if insight_group is not None:
            # @todo(Tyler) should this filter the insights as well? or just
            # filter the samples based on whether or not the insight is
            # present?
            self._query_kwargs["insights__group"] = insight_group

        if labels_group is not None:
            # @todo(Tyler) should this filter the labels as well? or just
            # filter the samples based on whether or not the label is
            # present?
            self._query_kwargs["labels__group"] = insight_group

        if filter is not None:
            self._query_kwargs["__raw__"] = filter

        return self

    def select_samples(self, sample_ids):
        """Selects only the samples with the given IDs from the view.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`DatasetView`
        """
        raise NotImplementedError("Not yet implemented")

    def remove_samples(self, sample_ids):
        """Removes the samples with the given IDS from the view.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`DatasetView`
        """
        raise NotImplementedError("Not yet implemented")

    @property
    def _sample_class(self):
        return self.dataset._sample_class

    def _get_query_set(self, **kwargs):
        # apply query kwargs
        kwargs = kwargs.copy()
        kwargs.update(self._query_kwargs)
        query_set = self.dataset._get_query_set(**kwargs)

        # sort
        if self._sort_by_arg:
            query_set = query_set.order_by(self._sort_by_arg)

        return query_set
