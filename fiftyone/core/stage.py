"""
FiftyOne stage definitions.

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

from copy import copy
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from eta.core.config import Config, ConfigBuilder
import eta.core.utils as etau


class ViewStage(object):
    """Abstract base class for all :class:`fiftyone.core.view.DatasetView` stages.

    Args:
        **kwargs: the concrete :class:`fiftyone.core.stage.ViewStage` arguments
    """

    def __init__(self, **kwargs):
        builder = ConfigBuilder(
            etau.get_class(etau.get_class_name(self) + "Config")
        )
        self._kwargs = copy(kwargs)
        builder = builder.set(**self._kwargs)
        builder.validate()
        self.config = builder.build()

    def __call__(self, view):
        return view._copy_with_new_stage(self)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.ViewStage`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        raise NotImplementedError("subclasses must implement `resolve()`")

    def _serialize(self):
        return {
            "name": self.__class__.__name__,
            "kwargs": self._kwargs,
            "_cls": etau.get_class_name(self),
        }

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
        super(Exclude, self).__init__(sample_ids=sample_ids)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.Exclude`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        sample_ids = [ObjectId(id) for id in self.config.sample_ids]
        return Match({"_id": {"$not": {"$in": sample_ids}}}).resolve()


class ExcludeConfig(Config):
    """Config for :class:`Exclude`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        self.sample_ids = self.parse_object_array(d, "sample_ids", str)


class Exists(ViewStage):
    """Returns a view containing the samples that have a non-``None`` value
    for the given field.

    Args:
        field: the field
    """

    def __init__(self, field):
        super(Exists, self).__init__(field=field)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.Exists`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return Match(
            {self.config.field: {"$exists": True, "$ne": None}}
        ).resolve()


class ExistsConfig(Config):
    """Config for :class:`Exists`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        self.field = self.parse_string(d, "field")


class Limit(ViewStage):
    """Limits the view to the given number of samples.

    Args:
        num: the maximum number of samples to return. If a non-positive
            number is provided, an empty view is returned
    """

    def __init__(self, limit):
        super(Limit, self).__init__(limit=limit)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.Limit`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return {"$limit": self.config.limit}


class LimitConfig(Config):
    """Config for :class:`Limit`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        self.limit = self.parse_number(d, "limit")

        if self.limit < 0 or not isinstance(self.limit, int):
            raise ViewStageError("Invalid limit value %s" % str(self.limit))


class Match(ViewStage):
    """Filters the samples in the stage by the given filter.

    Args:
        filter: a MongoDB query dict. See
            https://docs.mongodb.com/manual/tutorial/query-documents
            for details

    Returns:
        a :class:`DatasetView`
    """

    def __init__(self, filter):
        super(Match, self).__init__(filter=filter)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.Match`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return {"$match": self.config.filter}


class MatchConfig(Config):
    """Config for :class:`Match`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        self.filter = self.parse_dict(d, "filter")


class MatchTag(ViewStage):
    """Returns a view containing the samples that have the given tag.

    Args:
        tag: a tag
    """

    def __init__(self, tag):
        super(MatchTag, self).__init__(tag=tag)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.MatchTag`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return Match({"tags": self.config.tag}).resolve()


class MatchTagConfig(Config):
    """Config for :class:`MatchTag`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        self.tag = self.parse_string(d, "tag")


class MatchTags(ViewStage):
    """Returns a view containing the samples that have any of the given
    tags.

    To match samples that contain a single, use :class:`MatchTag`

    Args:
        tags: an iterable of tags
    """

    def __init__(self, tags):
        super(MatchTags, self).__init__(tags=tags)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.MatchTags`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return Match({"tags": {"$in": self.config.tags}}).resolve()


class MatchTagsConfig(Config):
    """Config for :class:`MatchTags`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        if "tags" in d:
            d = {"tags": list(d["tags"])}

        self.tags = self.parse_object_array(d, "tags", str)


class Select(ViewStage):
    """Selects the samples with the given IDs from the view.

    Args:
        sample_ids: an iterable of sample IDs
    """

    def __init__(self, sample_ids):
        super(Select, self).__init__(sample_ids=sample_ids)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.Select`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        sample_ids = [ObjectId(id) for id in self.config.sample_ids]
        return Match({"_id": {"$in": sample_ids}}).resolve()


class SelectConfig(Config):
    """Config for :class:`Select`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        self.sample_ids = self.parse_object_array(d, "sample_ids", str)


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
        super(SortBy, self).__init__(field=field, reverse=reverse)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.SortBy`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        order = DESCENDING if self.config.reverse else ASCENDING
        return {"$sort": {self.config.field: order}}


class SortByConfig(Config):
    """Config for :class:`SortBy`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        self.field = self.parse_string(d, "field")
        self.reverse = self.parse_bool(d, "reverse")


class Skip(ViewStage):
    """Omits the given number of samples from the head of the view.

    Args:
        skip: the number of samples to skip. If a non-positive number is
            provided, no samples are omitted
    """

    def __init__(self, skip):
        super(Skip, self).__init__(skip=skip)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.Skip`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        return {"$skip": self.config.skip}


class SkipConfig(Config):
    """Config for :class:`Skip`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        self.skip = self.parse_number(d, "skip")

        if self.skip < 0 or not isinstance(self.skip, int):
            raise ViewStageError("Invalid skip value %s" % str(self.skip))


class Take(ViewStage):
    """Randomly samples the given number of samples from the view.

    Args:
        size: the number of samples to return. If a non-positive number is
            provided, an empty view is returned
    """

    def __init__(self, size):
        super(Take, self).__init__(size=size)

    def resolve(self):
        """Returns the MongoDB version of the :class:`fiftyone.core.stage.Take`
        instance

        Returns:
            a MongoDB aggregation pipeline stage dict
        """
        size = self.config.size

        if size <= 0:
            return Match({"_id": None}).resolve()

        return {"$sample": {"size": size}}


class TakeConfig(Config):
    """Config for :class:`Take`.

    Args:
        d: the config dict
    """

    def __init__(self, d):
        self.size = self.parse_number(d, "size")
