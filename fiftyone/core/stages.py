"""
FiftyOne :class:`DatasetView` stage definitions.

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

import reprlib

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

import fiftyone.core.expressions as foe

import eta.core.utils as etau


# max number of list elements to print
reprlib.aRepr.maxlist = 3


class ViewStage(object):
    """Abstract base class for all :class:`fiftyone.core.view.DatasetView`
    stages.

    Args:
        **kwargs: the concrete :class:`fiftyone.core.stages.ViewStage`
            arguments
    """

    def __str__(self):
        kwarg_str = ", ".join(
            ["%s=%s" % (k, reprlib.repr(v)) for k, v in self._kwargs().items()]
        )

        return "%s(%s)" % (self.__class__.__name__, kwarg_str)

    def __repr__(self):
        return str(self)

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.ViewStage` instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        raise NotImplementedError("subclasses must implement `to_mongo()`")

    def _serialize(self):
        return {
            "kwargs": self._kwargs(),
            "_cls": etau.get_class_name(self),
        }

    def _kwargs(self):
        raise NotImplementedError("subclasses must implement `_kwargs()`")

    @classmethod
    def _from_dict(cls, d):
        return etau.get_class(d["_cls"])(**d["kwargs"])


class ViewStageError(Exception):
    """An error raise by a :class:`ViewStage`"""

    pass


class Exclude(ViewStage):
    """Excludes the samples with the given IDs from the view.

    Args:
        sample_ids: an iterable of sample IDs
    """

    def __init__(self, sample_ids):
        self._sample_ids = sample_ids

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Exclude` instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        sample_ids = [ObjectId(id) for id in self._sample_ids]
        return Match({"_id": {"$not": {"$in": sample_ids}}}).to_mongo()

    def _kwargs(self):
        return {"sample_ids": self._sample_ids}


class Exists(ViewStage):
    """Returns a view containing the samples that have a non-``None`` value
    for the given field.

    Args:
        field: the field
    """

    def __init__(self, field):
        self._field = field

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Exists` instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return Match({self._field: {"$exists": True, "$ne": None}}).to_mongo()

    def _kwargs(self):
        return {"field": self._field}


class Limit(ViewStage):
    """Limits the view to the given number of samples.

    Args:
        num: the maximum number of samples to return. If a non-positive
            number is provided, an empty view is returned
    """

    def __init__(self, limit):
        self._limit = limit

    def to_mongo(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stages.Limit`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return {"$limit": self._limit}

    def _kwargs(self):
        return {"limit": self._limit}


class ListFilter(ViewStage):
    """Filters the list elements in the samples in the stage.

    Args:
        field: the field to filter, which must be a list
        filter: a :class:`fiftyone.core.expressions.MatchExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            describing the filter to apply
    """

    def __init__(self, field, filter):
        self._field = field
        self._filter = filter
        self._validate()

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Match` instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        filt = self._filter
        if isinstance(filt, foe.MatchExpression):
            filt = filt.to_mongo(in_list=True)

        return {
            "$addFields": {
                self._field: {
                    "$filter": {"input": "$" + self._field, "cond": filt}
                }
            }
        }

    def _kwargs(self):
        return {"field": self._field, "filter": self._filter}

    def _validate(self):
        if not isinstance(self._filter, (foe.MatchExpression, dict)):
            raise ValueError(
                "Filter must be a MatchExpression or a MongoDB query dict; "
                "found '%s'" % self._filter
            )


class Match(ViewStage):
    """Filters the samples in the stage by the given filter.

    Args:
        filter: a :class:`fiftyone.core.expressions.MatchExpression` or
            `MongoDB query dict <https://docs.mongodb.com/manual/tutorial/query-documents>`_
            describing the filter to apply
    """

    def __init__(self, filter):
        self._filter = filter
        self._validate()

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Match` instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        filt = self._filter
        if isinstance(filt, foe.MatchExpression):
            filt = {"$expr": filt.to_mongo()}

        return {"$match": filt}

    def _kwargs(self):
        return {"filter": self._filter}

    def _validate(self):
        if not isinstance(self._filter, (foe.MatchExpression, dict)):
            raise ValueError(
                "Filter must be a MatchExpression or a MongoDB query dict; "
                "found '%s'" % self._filter
            )


class MatchTag(ViewStage):
    """Returns a view containing the samples that have the given tag.

    Args:
        tag: a tag
    """

    def __init__(self, tag):
        self._tag = tag

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.MatchTag` instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return Match({"tags": self._tag}).to_mongo()

    def _kwargs(self):
        return {"tag": self._tag}


class MatchTags(ViewStage):
    """Returns a view containing the samples that have any of the given
    tags.

    To match samples that contain a single, use :class:`MatchTag`

    Args:
        tags: an iterable of tags
    """

    def __init__(self, tags):
        self._tags = tags

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.MatchTags` instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return Match({"tags": {"$in": self._tags}}).to_mongo()

    def _kwargs(self):
        return {"tags": self._tags}


class Select(ViewStage):
    """Selects the samples with the given IDs from the view.

    Args:
        sample_ids: an iterable of sample IDs
    """

    def __init__(self, sample_ids):
        self._sample_ids = sample_ids

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Select` instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        sample_ids = [ObjectId(id) for id in self._sample_ids]
        return Match({"_id": {"$in": sample_ids}}).to_mongo()

    def _kwargs(self):
        return {"sample_ids": self._sample_ids}


class SortBy(ViewStage):
    """Sorts the samples in the view by the given field.

    Args:
        field: the field to sort by. Example fields::

            filename
            metadata.size_bytes
            metadata.frame_size[0]

        reverse (False): whether to return the results in descending order
    """

    def __init__(self, field, reverse=False):
        self._field = field
        self._reverse = reverse

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.SortBy` instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        order = DESCENDING if self._reverse else ASCENDING
        return {"$sort": {self._field: order}}

    def _kwargs(self):
        return {"field": self._field, "reverse": self._reverse}


class Skip(ViewStage):
    """Omits the given number of samples from the head of the view.

    Args:
        skip: the number of samples to skip. If a non-positive number is
            provided, no samples are omitted
    """

    def __init__(self, skip):
        self._skip = skip

    def to_mongo(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stages.Skip`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return {"$skip": self._skip}

    def _kwargs(self):
        return {"skip": self._skip}


class Take(ViewStage):
    """Randomly samples the given number of samples from the view.

    Args:
        size: the number of samples to return. If a non-positive number is
            provided, an empty view is returned
    """

    def __init__(self, size):
        self._size = size

    def to_mongo(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stages.Take`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        size = self._size

        if size <= 0:
            return Match({"_id": None}).to_mongo()

        return {"$sample": {"size": size}}

    def _kwargs(self):
        return {"size": self._size}
