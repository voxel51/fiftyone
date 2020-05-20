"""
Dataset views.

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
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from copy import copy, deepcopy
import numbers

from bson import ObjectId, json_util
from pymongo import ASCENDING, DESCENDING

import fiftyone.core.collections as foc


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


# Keeps track of all DatasetView operations
operation = _make_registrar()


class DatasetView(foc.SampleCollection):
    """A view into a :class:`fiftyone.core.dataset.Dataset`.

    Dataset views represent read-only collections of
    :class:`fiftyone.core.sample.Sample` instances in a dataset.

    Operations on dataset views are designed to be chained together to yield
    the desired subset of the dataset, which is then iterated over to directly
    access the samples.

    Example use::

        # Print the paths for 5 random samples in the dataset
        view = dataset.default_view().take(5)
        for sample in view:
            print(sample.filepath)

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
    """

    def __init__(self, dataset):
        self._dataset = dataset
        self._pipeline = []

    def __len__(self):
        try:
            result = self.aggregate([{"$count": "count"}])
            return next(result)["count"]
        except StopIteration:
            pass

        return 0

    def __getitem__(self, sample_id):
        if isinstance(sample_id, numbers.Integral):
            raise KeyError(
                "Accessing samples by numeric index is not supported. "
                "Use sample IDs or slices"
            )

        if isinstance(sample_id, slice):
            return self._slice(sample_id)

        # Ensure `sample_id` is in the view
        view = self.match({"_id": ObjectId(sample_id)})
        if not view:
            raise KeyError("No sample found with ID '%s'" % sample_id)

        return self._dataset[sample_id]

    def __copy__(self):
        view = self.__class__(self._dataset)
        view._pipeline = deepcopy(self._pipeline)
        return view

    def summary(self):
        """Returns a string summary of the view.

        Returns:
            a string summary
        """
        fields_str = self._dataset._get_fields_str()

        pipeline_str = "    " + "\n    ".join(
            [
                "%d. %s" % (idx, str(d))
                for idx, d in enumerate(self._pipeline, start=1)
            ]
        )

        return "\n".join(
            [
                "Dataset:        %s" % self._dataset.name,
                "Num samples:    %d" % len(self),
                "Tags:           %s" % list(self.get_tags()),
                "Sample fields:",
                fields_str,
                "Pipeline stages:",
                pipeline_str,
            ]
        )

    def head(self, num_samples=3):
        """Returns a string representation of the first few samples in the
        view.

        Args:
            num_samples (3): the number of samples

        Returns:
            a string representation of the samples
        """
        return "\n".join(str(s) for s in self[:num_samples])

    def tail(self, num_samples=3):
        """Returns a string representation of the last few samples in the view.

        Args:
            num_samples (3): the number of samples

        Returns:
            a string representation of the samples
        """
        return "\n".join(str(s) for s in self[-num_samples:])

    def first(self):
        """Returns the first :class:`fiftyone.core.sample.Sample` in the view.

        Returns:
            a :class:`fiftyone.core.sample.Sample`
        """
        try:
            return next(self.iter_samples())
        except StopIteration:
            raise ValueError("View is empty")

    def get_tags(self):
        """Returns the list of tags in the collection.

        Returns:
            a list of tags
        """
        pipeline = [
            {"$project": {"tags": "$tags"}},
            {"$unwind": "$tags"},
            {"$group": {"_id": "None", "all_tags": {"$addToSet": "$tags"}}},
        ]
        try:
            return next(self.aggregate(pipeline))["all_tags"]
        except StopIteration:
            pass

        return []

    def iter_samples(self):
        """Returns an iterator over the samples in the view.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for d in self.aggregate():
            yield self._dataset._load_sample_from_dict(d)

    def iter_samples_with_index(self):
        """Returns an iterator over the samples in the view together with
        their integer index in the collection.

        Returns:
            an iterator that emits ``(index, sample)`` tuples, where:
                - ``index`` is an integer index relative to the offset, where
                  ``offset <= view_idx < offset + limit``
                - ``sample`` is a :class:`fiftyone.core.sample.Sample`
        """
        offset = self._get_latest_offset()
        iterator = self.iter_samples()
        for idx, sample in enumerate(iterator, start=offset):
            yield idx, sample

    @classmethod
    def get_operation_names(cls):
        """Returns a list of all available :class:`DatasetView` operations,
        i.e., operations that return another :class:`DatasetView`.

        Returns:
            a list of method names
        """
        return list(operation.all)

    @operation
    def match(self, filter):
        """Filters the samples in the view by the given filter.

        Args:
            filter: a MongoDB query dict. See
                https://docs.mongodb.com/manual/tutorial/query-documents
                for details

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage({"$match": filter})

    @operation
    def match_tag(self, tag):
        """Returns a view containing the samples that have the given tag.

        Args:
            tag: a tag

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage({"$match": {"tags": tag}})

    @operation
    def match_tags(self, tags):
        """Returns a view containing the samples that have any of the given
        tags.

        To match samples that contain multiple tags, simply chain
        :func:`match_tag` or :func:`match_tags` calls together.

        Args:
            tags: an iterable of tags

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage(
            {"$match": {"tags": {"$in": list(tags)}}}
        )

    @operation
    def exists(self, field):
        """Returns a view containing the samples that have a non-``None`` value
        for the given field.

        Args:
            field: the field

        Returns:
            a :class:`DatasetView`
        """
        return self.match({field: {"$exists": True, "$ne": None}})

    @operation
    def sort_by(self, field, reverse=False):
        """Sorts the samples in the view by the given field.

        Args:
            field: the field to sort by. Example fields::

                filename
                metadata.size_bytes
                metadata.frame_size[0]

            reverse (False): whether to return the results in descending order

        Returns:
            a :class:`DatasetView`
        """
        order = DESCENDING if reverse else ASCENDING
        return self._copy_with_new_stage({"$sort": {field: order}})

    @operation
    def skip(self, skip):
        """Omits the given number of samples from the head of the view.

        Args:
            skip: the number of samples to skip

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage({"$skip": skip})

    @operation
    def limit(self, limit):
        """Limits the view to the given number of samples.

        Args:
            num: the maximum number of samples to return

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage({"$limit": limit})

    @operation
    def take(self, size):
        """Randomly samples the given number of samples from the view.

        Args:
            size: the number of samples to return

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage({"$sample": {"size": size}})

    @operation
    def select(self, sample_ids):
        """Selects the samples with the given IDs from the view.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`DatasetView`
        """
        sample_ids = [ObjectId(id) for id in sample_ids]
        return self.match({"_id": {"$in": sample_ids}})

    @operation
    def exclude(self, sample_ids):
        """Excludes the samples with the given IDs from the view.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`DatasetView`
        """
        sample_ids = [ObjectId(id) for id in sample_ids]
        return self.match({"_id": {"$not": {"$in": sample_ids}}})

    def aggregate(self, pipeline=None):
        """Calls the current MongoDB aggregation pipeline on the view.

        Args:
            pipeline (None): an optional aggregation pipeline (list of dicts)
                to append to the view's pipeline before aggregation.

        Returns:
            an iterable over the aggregation result
        """
        if pipeline is None:
            pipeline = []

        return self._dataset._get_query_set().aggregate(
            self._pipeline + pipeline
        )

    def serialize(self):
        """Serializes the view.

        Returns:
            a JSON representation of the view
        """
        return {
            "dataset": self._dataset.serialize(),
            "view": json_util.dumps(self._pipeline),
        }

    def _slice(self, s):
        if s.step is not None and s.step != 1:
            raise ValueError(
                "Unsupported slice '%s'; step is not supported" % s
            )

        _len = None

        start = s.start
        if start is not None and start < 0:
            _len = len(self)
            start += _len

        stop = s.stop
        if stop is not None and stop < 0:
            if _len is None:
                _len = len(self)

            stop += _len

        if start is None:
            if stop is None:
                return self

            return self.limit(stop)

        if stop is None:
            return self.skip(start)

        return self.skip(start).limit(stop - start)

    def _get_field_distributions(self):
        return list(self.aggregate(_FIELD_DISTRIBUTIONS_PIPELINE))

    def _get_facets(self):
        return list(self.aggregate(_FACETS_PIPELINE))

    def _copy_with_new_stage(self, stage):
        view = copy(self)
        view._pipeline.append(stage)
        return view

    def _get_latest_offset(self):
        for stage in self._pipeline[::-1]:
            if "$skip" in stage:
                return stage["$skip"]

        return 0


_FIELD_DISTRIBUTIONS_PIPELINE = [
    {"$project": {"field": {"$objectToArray": "$$ROOT"}}},
    {"$unwind": "$field"},
    {"$project": {"field": "$field.k", "detection": "$field.v.detections"}},
    {"$unwind": "$detection"},
    {
        "$group": {
            "_id": {"field": "$field", "label": "$detection.label"},
            "count": {"$sum": 1},
        }
    },
    {
        "$group": {
            "_id": "$_id.field",
            "labels": {"$push": {"label": "$_id.label", "count": "$count"}},
        }
    },
]


_FACETS_PIPELINE = [
    {
        "$facet": {
            "tags": [
                {"$project": {"tag": "$tags"}},
                {
                    "$unwind": {
                        "path": "$tag",
                        "preserveNullAndEmptyArrays": True,
                    }
                },
                {"$group": {"_id": "$tag", "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}},
            ],
        }
    }
]
