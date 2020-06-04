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

    def serialize(self):
        return {
            "name": self.__class__,
            "kwargs": self._kwargs,
            "_cls": etau.get_class_name(self),
        }

    def resolve(self):
        raise NotImplementedError("subclasses must implement `resolve()`")

    @classmethod
    def from_dict(cls, d):
        return etau.get_class(d["_cls"])(**d["kwargs"])


class ViewStageError(Exception):
    pass


class Exclude(ViewStage):
    def __init__(self, sample_ids):
        super(Exclude, self).__init__(sample_ids=sample_ids)

    def resolve(self):
        sample_ids = [ObjectId(id) for id in self.config.sample_ids]
        return Match({"_id": {"$not": {"$in": sample_ids}}}).resolve()


class ExcludeConfig(Config):
    def __init__(self, d):
        self.sample_ids = self.parse_object_array(d, "samples_ids", str)


class Exists(ViewStage):
    def __init__(self, field):
        super(Exists, self).__init__(field=field)

    def resolve(self):
        return Match(
            {self.config.field: {"$exists": True, "$ne": None}}
        ).resolve()


class ExistsConfig(Config):
    def __init__(self, d):
        self.field = self.parse_string(d, "field")


class Limit(ViewStage):
    def __init__(self, limit):
        super(Limit, self).__init__(limit=limit)

    def resolve(self):
        return {"$limit": self.config.limit}


class LimitConfig(Config):
    def __init__(self, d):
        self.limit = self.parse_number(d, "skip")

        if self.limit < 0 or not isinstance(self.limit, int):
            raise ViewStageError("Invalid limit value %s" % str(self.limit))


class Match(ViewStage):
    def __init__(self, filter):
        super(Match, self).__init__(filter=filter)

    def resolve(self):
        return {"$match": self.config.filter}


class MatchConfig(Config):
    def __init__(self, d):
        self.filter = self.parse_dict(d, "filter")


class MatchTag(ViewStage):
    def __init__(self, tag):
        super(MatchTag, self).__init__(tag=tag)

    def resolve(self):
        return Match({"tags": self.config.tag}).resolve()


class MatchTagConfig(Config):
    def __init__(self, d):
        self.tag = self.parse_string(d, "tag")


class MatchTags(ViewStage):
    def __init__(self, tags):
        super(MatchTags, self).__init__(tags=tags)

    def resolve(self):
        return Match({"tags": {"$in": self.config.tags}}).resolve()


class MatchTagsConfig(Config):
    def __init__(self, d):
        if "tags" in d:
            d = {"tags": list(d["tags"])}

        self.tags = self.parse_dict(d, "tags")


class Select(ViewStage):
    def __init__(self, sample_ids):
        super(Select, self).__init__(sample_ids=sample_ids)

    def resolve(self):
        sample_ids = [ObjectId(id) for id in self.config.sample_ids]
        return Match({"_id": {"$in": sample_ids}}).resolve()


class SelectConfig(Config):
    def __init__(self, d):
        self.sample_ids = self.parse_object_array(d, "samples_ids", str)


class SortBy(ViewStage):
    def __init__(self, field, reverse=False):
        super(SortBy, self).__init__(field=field, reverse=reverse)

    def resolve(self):
        order = DESCENDING if self.config.reverse else ASCENDING
        return {"$sort": {self.config.field: order}}


class SortByConfig(Config):
    def __init__(self, d):
        self.field = self.parse_string(d, "field")
        self.reverse = self.parse_bool(d, "reverse")


class Skip(ViewStage):
    def __init__(self, skip):
        super(Skip, self).__init__(skip=skip)

    def resolve(self):
        return {"$skip": self.config.skip}


class SkipConfig(Config):
    def __init__(self, d):
        self.skip = self.parse_number(d, "skip")

        if self.skip < 0 or not isinstance(self.skip, int):
            raise ViewStageError("Invalid skip value %s" % str(self.skip))


class Take(ViewStage):
    def __init__(self, size):
        super(Take, self).__init__(size=size)

    def resolve(self):
        size = self.config.size

        if size <= 0:
            return Match({"_id": None}).resolve()

        return {"$sample": {"size": size}}


class TakeConfig(Config):
    def __init__(self, d):
        self.size = self.parse_number(d, "size")
