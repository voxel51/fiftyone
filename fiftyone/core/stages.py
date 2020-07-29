"""
FiftyOne :class:`fiftyone.core.view.DatasetView` stage definitions.

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

from fiftyone.core.expressions import ViewExpression

import eta.core.utils as etau


class _StageRepr(reprlib.Repr):
    def repr_ViewExpression(self, expr, level):
        return self.repr1(expr.to_mongo(), level=level)


_aRepr = _StageRepr()
_aRepr.maxlevel = 2
_aRepr.maxlist = 3


class ViewStage(object):
    """Abstract base class for all :class:`fiftyone.core.view.DatasetView`
    stages.

    :class:`ViewStage` instances represent a logical operation to apply to a
    :class:`fiftyone.core.view.DatasetView`, which may decide what subset of
    samples in a view should pass though the stage, and also what subset of the
    contents of each :class:`fiftyone.core.sample.Sample` should be passed.

    Args:
        **kwargs: the concrete :class:`fiftyone.core.stages.ViewStage`
            arguments
    """

    def __str__(self):
        return repr(self)

    def __repr__(self):
        kwargs_str = ", ".join(
            ["%s=%s" % (k, _aRepr.repr(v)) for k, v in self._kwargs().items()]
        )

        return "%s(%s)" % (self.__class__.__name__, kwargs_str)

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.ViewStage` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        raise NotImplementedError("subclasses must implement `to_mongo()`")

    def _serialize(self):
        """Returns a JSON dict representation of the :class:`ViewStage`.

        Returns:
            a JSON dict
        """
        return {
            "kwargs": self._kwargs(),
            "_cls": etau.get_class_name(self),
        }

    def _kwargs(self):
        """Returns a JSON dict describing the keyword arguments that define the
        ViewStage.

        Returns:
            a JSON dict
        """
        raise NotImplementedError("subclasses must implement `_kwargs()`")

    @classmethod
    def _from_dict(cls, d):
        """Creates a :class:`ViewStage` instance from a serialized JSON dict
        representation of it.

        Args:
            d: a JSON dict

        Returns:
            a :class:`ViewStage`
        """
        view_stage_cls = etau.get_class(d["_cls"])
        return view_stage_cls(**d["kwargs"])


class ViewStageError(Exception):
    """An error raise by a :class:`ViewStage`"""

    pass


class Exclude(ViewStage):
    """Excludes the samples with the given IDs from the view.

    Args:
        sample_ids: an iterable of sample IDs
    """

    def __init__(self, sample_ids):
        self._sample_ids = list(sample_ids)

    @property
    def sample_ids(self):
        """The list of sample IDs to exclude."""
        return self._sample_ids

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Exclude` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        sample_ids = [ObjectId(id) for id in self._sample_ids]
        return Match({"_id": {"$not": {"$in": sample_ids}}}).to_mongo()

    def _kwargs(self):
        return {"sample_ids": self._sample_ids}


class ExcludeFields(ViewStage):
    """Excludes the fields with the given names from the returned
        :class:`fiftyone.core.sample.SampleView` instances.

    Args:
        field_names: a list of names of sample fields to omit
    """

    def __init__(self, field_names):
        if "id" in field_names or "_id" in field_names:
            raise ValueError("Cannot exclude ID field.")
        self._field_names = field_names

    @property
    def field_names(self):
        """The list of field names to exclude."""
        return self._field_names

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.ExcludeFields` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$unset": self._field_names}]

    def _kwargs(self):
        return {"field_names": self._field_names}


class Exists(ViewStage):
    """Returns a view containing the samples that have a non-``None`` value
    for the given field.

    Args:
        field: the field
    """

    def __init__(self, field):
        self._field = field

    @property
    def field(self):
        """The field to check if exists."""
        return self._field

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Exists` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return Match({self._field: {"$exists": True, "$ne": None}}).to_mongo()

    def _kwargs(self):
        return {"field": self._field}


class _FilterList(ViewStage):
    """Abstract class that specifies how to filter a list field to a subset of
    elements.

    Args:
        field: the field to filter, which must be a list or an object that
            contains a list
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
    """

    def __init__(self, field, filter):
        self._field = field
        self._filter = filter
        self._validate()

    @property
    def field(self):
        """The field that fully specifies what to filter."""
        return self._field

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    @property
    def list_field(self):
        """The field (which must be a list) that is filtered."""
        return self.field

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Match` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [
            {
                "$addFields": {
                    self.list_field: {
                        "$filter": {
                            "input": "$" + self.list_field,
                            "cond": self._get_mongo_filter(),
                        }
                    }
                }
            }
        ]

    def _get_mongo_filter(self):
        if isinstance(self._filter, ViewExpression):
            return self._filter.to_mongo(in_list=True)

        return self._filter

    def _kwargs(self):
        return {"field": self._field, "filter": self._get_mongo_filter()}

    def _validate(self):
        if not isinstance(self._filter, (ViewExpression, dict)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB expression; "
                "found '%s'" % self._filter
            )


class FilterClassifications(_FilterList):
    """Filters the :class:`fiftyone.core.labels.Classification` elements in the
    specified :class:`fiftyone.core.labels.Classifications` field of the
    samples in the stage.

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Classifications`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
    """

    @property
    def list_field(self):
        """The field (which must be a list) that is filtered."""
        return ".".join([self.field, "classifications"])


class FilterDetections(_FilterList):
    """Filters the :class:`fiftyone.core.labels.Detection` elements in the
    specified :class:`fiftyone.core.labels.Detections` field of the samples in
    the stage.

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Detections`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
    """

    @property
    def list_field(self):
        """The field (which must be a list) that is filtered."""
        return ".".join([self.field, "detections"])


class Limit(ViewStage):
    """Limits the view to the given number of samples.

    Args:
        num: the maximum number of samples to return. If a non-positive
            number is provided, an empty view is returned
    """

    def __init__(self, limit):
        self._limit = limit

    @property
    def limit(self):
        """The maximum number of samples to return."""
        return self._limit

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Limit` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$limit": self._limit}]

    def _kwargs(self):
        return {"limit": self._limit}


class Match(ViewStage):
    """Filters the samples in the stage by the given filter.

    Args:
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
    """

    def __init__(self, filter):
        self._filter = filter
        self._validate()

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Match` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$match": self._get_mongo_filter()}]

    def _get_mongo_filter(self):
        if isinstance(self._filter, ViewExpression):
            return {"$expr": self._filter.to_mongo()}

        return self._filter

    def _kwargs(self):
        return {"filter": self._get_mongo_filter()}

    def _validate(self):
        if not isinstance(self._filter, (ViewExpression, dict)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB expression; "
                "found '%s'" % self._filter
            )


class MatchTag(ViewStage):
    """Returns a view containing the samples that have the given tag.

    Args:
        tag: a tag
    """

    def __init__(self, tag):
        self._tag = tag

    @property
    def tag(self):
        """The tag to match."""
        return self._tag

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.MatchTag` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return Match({"tags": self._tag}).to_mongo()

    def _kwargs(self):
        return {"tag": self._tag}


class MatchTags(ViewStage):
    """Returns a view containing the samples that have any of the given
    tags.

    To match samples that contain a single, use :class:`MatchTag`.

    Args:
        tags: an iterable of tags
    """

    def __init__(self, tags):
        self._tags = list(tags)

    @property
    def tags(self):
        """The list of tags to match."""
        return self._tags

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.MatchTags` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return Match({"tags": {"$in": self._tags}}).to_mongo()

    def _kwargs(self):
        return {"tags": self._tags}


class Mongo(ViewStage):
    """View stage defined by a raw MongoDB aggregation pipeline.

    See `MongoDB aggregation pipelines <https://docs.mongodb.com/manual/core/aggregation-pipeline/>`_
    for more details.

    Args:
        pipeline: a MongoDB aggregation pipeline (list of dicts)
    """

    def __init__(self, pipeline):
        self._pipeline = pipeline

    @property
    def pipeline(self):
        """The MongoDB aggregation pipeline."""
        return self._pipeline

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Mongo` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return self._pipeline

    def _kwargs(self):
        return {"pipeline": self._pipeline}


class Select(ViewStage):
    """Selects the samples with the given IDs from the view.

    Args:
        sample_ids: an iterable of sample IDs
    """

    def __init__(self, sample_ids):
        self._sample_ids = list(sample_ids)

    @property
    def sample_ids(self):
        """The list of sample IDs to select."""
        return self._sample_ids

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Select` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        sample_ids = [ObjectId(id) for id in self._sample_ids]
        return Match({"_id": {"$in": sample_ids}}).to_mongo()

    def _kwargs(self):
        return {"sample_ids": self._sample_ids}


class SelectFields(ViewStage):
    """Selects the fields with the given names as the only fields present
    in the returned :class:`fiftyone.core.sample.SampleView` instances.

    Args:
        field_names: a list of names of sample fields to omit
    """

    def __init__(self, field_names):
        self._field_names = [
            fn for fn in field_names if fn not in ["id", "_id"]
        ]
        if len(field_names) != len(self.field_names):
            raise Warning("ID field is always selected.")

    @property
    def field_names(self):
        """The list of field names to exclude."""
        return self._field_names

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.ExcludeFields` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$project": {fn: True for fn in self.field_names}}]

    def _kwargs(self):
        return {"field_names": self._field_names}


class SortBy(ViewStage):
    """Sorts the samples in the view by the given field or expression.

    When sorting by an expression, ``field_or_expr`` can either be a
    :class:`fiftyone.core.expressions.ViewExpression` or a
    `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
    that defines the quantity to sort by.

    Args:
        field_or_expr: the field or expression to sort by
        reverse (False): whether to return the results in descending order
    """

    def __init__(self, field_or_expr, reverse=False):
        self._field_or_expr = field_or_expr
        self._reverse = reverse

    @property
    def field_or_expr(self):
        """The field or expression to sort by."""
        return self._field_or_expr

    @property
    def reverse(self):
        """Whether to return the results in descending order."""
        return self._reverse

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.SortBy` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        order = DESCENDING if self._reverse else ASCENDING

        field_or_expr = self._get_mongo_field_or_expr()

        if not isinstance(field_or_expr, dict):
            return [{"$sort": {field_or_expr: order}}]

        return [
            {"$addFields": {"_sort_field": field_or_expr}},
            {"$sort": {"_sort_field": order}},
            {"$unset": "_sort_field"},
        ]

    def _get_mongo_field_or_expr(self):
        if isinstance(self._field_or_expr, ViewExpression):
            return self._field_or_expr.to_mongo()

        return self._field_or_expr

    def _kwargs(self):
        return {
            "field_or_expr": self._get_mongo_field_or_expr(),
            "reverse": self._reverse,
        }


class Skip(ViewStage):
    """Omits the given number of samples from the head of the view.

    Args:
        skip: the number of samples to skip. If a non-positive number is
            provided, no samples are omitted
    """

    def __init__(self, skip):
        self._skip = skip

    @property
    def skip(self):
        """The number of samples to skip."""
        return self._skip

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Skip` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$skip": self._skip}]

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

    @property
    def size(self):
        """The number of samples to return."""
        return self._size

    def to_mongo(self):
        """Returns the MongoDB version of the
        :class:`fiftyone.core.stages.Take` instance.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        size = self._size

        if size <= 0:
            return Match({"_id": None}).to_mongo()

        return [{"$sample": {"size": size}}]

    def _kwargs(self):
        return {"size": self._size}
