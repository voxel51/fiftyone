"""
View stages.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import reprlib

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from fiftyone.core.expressions import ViewExpression
from fiftyone.core.odm.sample import default_sample_fields

import eta.core.utils as etau


class ViewStage(object):
    """Abstract base class for all :class:`fiftyone.core.view.DatasetView`
    stages.

    :class:`ViewStage` instances represent a logical operation to apply to a
    :class:`fiftyone.core.view.DatasetView`, which may decide what subset of
    samples in a view should pass though the stage, and also what subset of the
    contents of each :class:`fiftyone.core.sample.Sample` should be passed.
    """

    def __str__(self):
        return repr(self)

    def __repr__(self):
        kwargs_str = ", ".join(
            ["%s=%s" % (k, _repr.repr(v)) for k, v in self._kwargs()]
        )

        return "%s(%s)" % (self.__class__.__name__, kwargs_str)

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

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
        """Returns a list of ``[name, value]`` lists describing the parameters
        that define the stage.

        Returns:
            a JSON dict
        """
        raise NotImplementedError("subclasses must implement `_kwargs()`")

    @classmethod
    def _params(self):
        """Returns a list of JSON dicts describing the parameters that define
        the stage.

        Returns:
            a list of JSON dicts
        """
        raise NotImplementedError("subclasses must implement `_params()`")

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
        return view_stage_cls(**{k: v for (k, v) in d["kwargs"]})


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
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        sample_ids = [ObjectId(id) for id in self._sample_ids]
        return Match({"_id": {"$not": {"$in": sample_ids}}}).to_mongo()

    def _kwargs(self):
        return [["sample_ids", self._sample_ids]]

    @classmethod
    def _params(cls):
        return [{"name": "sample_ids", "type": ["list", "str"]}]


class ExcludeFields(ViewStage):
    """Excludes the fields with the given names from the samples in the view.

    Note: Default fields cannot be excluded.

    Args:
        field_names: a field name or iterable of field names to exclude
    """

    def __init__(self, field_names):
        if etau.is_str(field_names):
            field_names = [field_names]

        self._field_names = list(field_names)
        self._validate()

    @property
    def field_names(self):
        """The list of field names to exclude."""
        return self._field_names

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$unset": self._field_names}]

    def _kwargs(self):
        return [["field_names", self._field_names]]

    @classmethod
    def _params(self):
        return [{"name": "field_names", "type": ["list", "str"]}]

    def _validate(self):
        invalid_fields = set(self._field_names) & set(default_sample_fields())
        if invalid_fields:
            raise ValueError(
                "Cannot exclude default fields: %s" % list(invalid_fields)
            )


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
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return Match({self._field: {"$exists": True, "$ne": None}}).to_mongo()

    def _kwargs(self):
        return [["field", self._field]]

    @classmethod
    def _params(cls):
        return [{"name": "field", "type": "str"}]


class _FilterList(ViewStage):
    """Base class for stages that filter elements of a list field of a
    document.

    The actual document field to filter is exposed via the
    :meth:`_FilterList.list_field` property, which may be computed from the
    provided ``field``.

    Args:
        field: the field to filter
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
        """The field to filter."""
        return self._field

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    @property
    def list_field(self):
        """The *actual* list field to filter, which may be computed from
        `self.field`.
        """
        return self.field

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

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
        return [["field", self._field], ["filter", self._get_mongo_filter()]]

    @classmethod
    def _params(self):
        return [
            {"name": "field", "type": "str"},
            {"name": "filter", "type": "dict"},
        ]

    def _validate(self):
        if not isinstance(self._filter, (ViewExpression, dict)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB expression; "
                "found '%s'" % self._filter
            )


class FilterClassifications(_FilterList):
    """Filters the :class:`fiftyone.core.labels.Classification` elements in the
    specified :class:`fiftyone.core.labels.Classifications` field of the
    samples in a view.

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Classifications`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
    """

    @property
    def list_field(self):
        return self.field + ".classifications"


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
        return self.field + ".detections"


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
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$limit": self._limit}]

    def _kwargs(self):
        return [["limit", self._limit]]

    @classmethod
    def _params(cls):
        return [{"name": "limit", "type": "int"}]


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
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$match": self._get_mongo_filter()}]

    def _get_mongo_filter(self):
        if isinstance(self._filter, ViewExpression):
            return {"$expr": self._filter.to_mongo()}

        return self._filter

    def _kwargs(self):
        return [["filter", self._get_mongo_filter()]]

    def _validate(self):
        if not isinstance(self._filter, (ViewExpression, dict)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB expression; "
                "found '%s'" % self._filter
            )

    @classmethod
    def _params(cls):
        return [{"name": "filter", "type": "dict"}]


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
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return Match({"tags": self._tag}).to_mongo()

    def _kwargs(self):
        return [["tag", self._tag]]

    @classmethod
    def _params(cls):
        return [{"name": "tag", "type": "str"}]


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
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return Match({"tags": {"$in": self._tags}}).to_mongo()

    def _kwargs(self):
        return [["tags", self._tags]]

    @classmethod
    def _params(cls):
        return [{"name": "tags", "type": ["list", "str"]}]


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
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return self._pipeline

    def _kwargs(self):
        return [["pipeline", self._pipeline]]

    @classmethod
    def _params(self):
        return [{"name": "pipeline", "type": "dict"}]


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
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        sample_ids = [ObjectId(id) for id in self._sample_ids]
        return Match({"_id": {"$in": sample_ids}}).to_mongo()

    def _kwargs(self):
        return [["sample_ids", self._sample_ids]]

    @classmethod
    def _params(cls):
        return [{"name": "sample_ids", "type": ["list", "str"]}]


class SelectFields(ViewStage):
    """Selects *only* the fields with the given names from the samples in the
    view. All other fields are excluded.

    Note: Default sample fields are always selected and will be added if not
    included in ``field_names``.

    Args:
        field_names (None): a field name or iterable of field names to select.
            If not specified, just the default fields will be selected
    """

    def __init__(self, field_names=None):
        default_fields = default_sample_fields()

        if field_names:
            if etau.is_str(field_names):
                field_names = [field_names]

            self._field_names = list(set(field_names) | set(default_fields))
        else:
            self._field_names = list(default_fields)

    @property
    def field_names(self):
        """The list of field names to select."""
        return self._field_names

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$project": {fn: True for fn in self.field_names}}]

    def _kwargs(self):
        return [["field_names", self._field_names]]

    @classmethod
    def _params(self):
        return [{"name": "field_names", "type": ["list", "str"]}]


class Shuffle(ViewStage):
    """Randomly shuffles the samples in the view.

    Args:
        seed (None): an optional random seed to use when shuffling the samples
    """

    def __init__(self, seed=None):
        self._seed = seed
        self._randint = _get_rng(seed).randint(1e7, 1e10)

    @property
    def seed(self):
        """The random seed to use, or ``None``."""
        return self._seed

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        # @todo avoid creating new field here?
        return [
            {"$set": {"_rand_shuffle": {"$mod": [self._randint, "$_rand"]}}},
            {"$sort": {"_rand_shuffle": ASCENDING}},
            {"$unset": "_rand_shuffle"},
        ]

    def _kwargs(self):
        return [["seed", self._seed]]

    @classmethod
    def _params(self):
        return [{"name": "seed", "type": "float"}]


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
        """Returns the MongoDB version of the stage.

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
        return [
            ["field_or_expr", self._get_mongo_field_or_expr()],
            ["reverse", self._reverse],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field_or_expr", "type": "dict|str"},
            {"name": "reverse", "type": "bool"},
        ]


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
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$skip": self._skip}]

    def _kwargs(self):
        return [["skip", self._skip]]

    @classmethod
    def _params(cls):
        return [{"name": "skip", "type": "int"}]


class Take(ViewStage):
    """Randomly samples the given number of samples from the view.

    Args:
        size: the number of samples to return. If a non-positive number is
            provided, an empty view is returned
        seed (None): an optional random seed to use when selecting the samples
    """

    def __init__(self, size, seed=None):
        self._seed = seed
        self._size = size
        self._randint = _get_rng(seed).randint(1e7, 1e10)

    @property
    def size(self):
        """The number of samples to return."""
        return self._size

    @property
    def seed(self):
        """The random seed to use, or ``None``."""
        return self._seed

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        if self._size <= 0:
            return Match({"_id": None}).to_mongo()

        # @todo avoid creating new field here?
        return [
            {"$set": {"_rand_take": {"$mod": [self._randint, "$_rand"]}}},
            {"$sort": {"_rand_take": ASCENDING}},
            {"$limit": self._size},
            {"$unset": "_rand_take"},
        ]

    def _kwargs(self):
        return [["size", self._size], ["seed", self._seed]]

    @classmethod
    def _params(cls):
        return [
            {"name": "size", "type": "int"},
            {"name": "seed", "type": "float"},
        ]


def _get_rng(seed):
    if seed is None:
        return random

    _random = random.Random()
    _random.seed(seed)
    return _random


class _ViewStageRepr(reprlib.Repr):
    def repr_ViewExpression(self, expr, level):
        return self.repr1(expr.to_mongo(), level=level - 1)


_repr = _ViewStageRepr()
_repr.maxlevel = 2
_repr.maxdict = 3
_repr.maxlist = 3
_repr.maxtuple = 3
_repr.maxset = 3
_repr.maxstring = 30
_repr.maxother = 30


# Simple registry for the server to grab available view stages
_STAGES = [
    Exclude,
    ExcludeFields,
    Exists,
    FilterClassifications,
    FilterDetections,
    Limit,
    Match,
    MatchTag,
    MatchTags,
    Mongo,
    Shuffle,
    Select,
    SelectFields,
    SortBy,
    Skip,
    Take,
]
