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

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from copy import copy, deepcopy
import numbers

from bson import ObjectId, json_util
from pymongo import ASCENDING, DESCENDING

import fiftyone.core.collections as foc
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos


class DatasetView(foc.SampleCollection):
    """A view into a :class:`fiftyone.core.dataset.Dataset`.

    Dataset views represent read-only collections of
    :class:`fiftyone.core.sample.Sample` instances in a dataset.

    Operations on dataset views are designed to be chained together to yield
    the desired subset of the dataset, which is then iterated over to directly
    access the samples.

    Example use::

        # Print the paths for 5 random samples in the dataset
        view = dataset.default_view().sample(5)
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
            result = self._aggregate([{"$count": "count"}])
            return next(result)["count"]
        except StopIteration:
            pass

        return 0

    def __getitem__(self, sample_id):
        if isinstance(sample_id, numbers.Integral):
            raise ValueError(
                "Accessing samples by numeric index is not supported. "
                "Use sample IDs or slices"
            )

        if isinstance(sample_id, slice):
            return self._slice(sample_id)

        try:
            # Ensure `sample_id` is in the view
            pipeline = [{"$match": {"_id": ObjectId(sample_id)}}]
            next(self._aggregate(pipeline))
        except StopIteration:
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
        pipeline_str = "\t" + "\n\t".join(
            [
                "%d. %s" % (idx, str(d))
                for idx, d in enumerate(self._pipeline, start=1)
            ]
        )

        return "\n".join(
            [
                "Num samples:    %d" % len(self),
                "Tags:           %s" % self.get_tags(),
                "Label groups:   %s" % self.get_label_groups(),
                "Insight groups: %s" % self.get_insight_groups(),
                "Pipeline stages:\n%s" % pipeline_str,
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
            return next(self._aggregate(pipeline))["all_tags"]
        except StopIteration:
            pass
        return []

    def iter_samples(self):
        """Returns an iterator over the samples in the view.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for d in self._aggregate():
            yield self._deserialize_sample(d)

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

    def match_tag(self, tag):
        """Filters the samples in the view to have the tag.

        Args:
            tag: a sample tag string

        Returns:
            a :class:`DatasetView`
        """
        return self.match({"tags": tag})

    def match_insight(self, insight_group):
        """Filters the samples in the view to have the insight group. Filtering
        ensures that the insight exists on the sample.

        Args:
            insight_group: an insight group string

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage(
            {"$match": {"insights.%s" % insight_group: {"$exists": True}}}
        )

    def match_labels(self, label_group):
        """Filters the samples in the view to have the label group. Filtering
        ensures that the label exists on the sample.

        Args:
            label_group: a label group string

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage(
            {"$match": {"labels.%s" % label_group: {"$exists": True}}}
        )

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

    def skip(self, skip):
        """Omits the given number of samples from the head of the view.

        Args:
            skip: the number of samples to skip

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage({"$skip": skip})

    def limit(self, limit):
        """Limits the view to the given number of samples.

        Args:
            num: the maximum number of samples to return

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage({"$limit": limit})

    def sample(self, size):
        """Randomly samples the given number of samples from the view.

        Args:
            size: the number of samples to return

        Returns:
            a :class:`DatasetView`
        """
        return self._copy_with_new_stage({"$sample": {"size": size}})

    def select(self, sample_ids):
        """Selects the samples with the given IDs from the view.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`DatasetView`
        """
        sample_ids = [ObjectId(id) for id in sample_ids]
        return self._copy_with_new_stage(
            {"$match": {"_id": {"$in": sample_ids}}}
        )

    def exclude(self, sample_ids):
        """Excludes the samples with the given IDs from the view.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`DatasetView`
        """
        sample_ids = [ObjectId(id) for id in sample_ids]
        return self._copy_with_new_stage(
            {"$match": {"_id": {"$not": {"$in": sample_ids}}}}
        )

    def _aggregate(self, pipeline=None):
        """Calls the current MongoDB aggregation pipeline on the view.

        Args:
            pipeline (None): an optional aggregation pipeline (list of dicts)
                to append to the view's pipeline before aggregation.

        Returns:
            an iterable over the aggregation result
        """
        if pipeline is None:
            pipeline = []

        return self._get_ds_qs().aggregate(self._pipeline + pipeline)

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

    def _get_label_distributions(self):
        pipeline = self._pipeline + _LABEL_DISTRIBUTIONS_PIPELINE
        return list(self._get_ds_qs().aggregate(pipeline))

    def _get_facets(self):
        pipeline = self._pipeline + _FACETS_PIPELINE
        return list(self._get_ds_qs().aggregate(pipeline))

    def _get_ds_qs(self, **kwargs):
        return self._dataset._get_query_set(**kwargs)

    def _deserialize_sample(self, d):
        doc = foo.ODMSample.from_dict(d, created=False, extended=False)
        return self._load_sample(doc)

    def _load_sample(self, doc):
        sample = fos.Sample.from_doc(doc)
        sample._set_dataset(self._dataset)
        return sample

    def _copy_with_new_stage(self, stage):
        view = copy(self)
        view._pipeline.append(stage)
        return view

    def _get_latest_offset(self):
        for stage in self._pipeline[::-1]:
            if "$skip" in stage:
                return stage["$skip"]

        return 0


_LABEL_DISTRIBUTIONS_PIPELINE = [
    {"$project": {"label": {"$objectToArray": "$labels"}}},
    {"$unwind": "$label"},
    {"$project": {"group": "$label.k", "label": "$label.v.label"}},
    {
        "$group": {
            "_id": {"group": "$group", "label": "$label"},
            "count": {"$sum": 1},
        }
    },
    {
        "$group": {
            "_id": "$_id.group",
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
            "labels": [
                {"$project": {"label": {"$objectToArray": "$labels"}}},
                {"$unwind": "$label"},
                {
                    "$project": {
                        "group": "$label.k",
                        "label": "$label.v.label",
                    }
                },
                {
                    "$group": {
                        "_id": {"group": "$group", "label": "$label"},
                        "count": {"$sum": 1},
                    }
                },
                {
                    "$group": {
                        "_id": "$_id.group",
                        "labels": {
                            "$push": {
                                "label": "$_id.label",
                                "count": "$count",
                            }
                        },
                    }
                },
            ],
        }
    }
]
