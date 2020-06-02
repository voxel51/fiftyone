"""
Fields of dataset sample schemas.

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

import mongoengine.fields


class Field(mongoengine.fields.BaseField):
    pass


class BooleanField(mongoengine.BooleanField, Field):
    pass


class IntField(mongoengine.IntField, Field):
    pass


class FloatField(mongoengine.FloatField, Field):
    def validate(self, value):
        try:
            value = float(value)
        except OverflowError:
            self.error("The value is too large to be converted to float")
        except (TypeError, ValueError):
            self.error("%s could not be converted to float" % value)

        if self.min_value is not None and value < self.min_value:
            self.error("Float value is too small")

        if self.max_value is not None and value > self.max_value:
            self.error("Float value is too large")


class StringField(mongoengine.StringField, Field):
    pass


class ListField(mongoengine.ListField, Field):
    pass


class DictField(mongoengine.DictField, Field):
    pass


class EmbeddedDocumentField(mongoengine.EmbeddedDocumentField, Field):
    pass
