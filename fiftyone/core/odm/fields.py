"""
Core ODM fields.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import mongoengine
import mongoengine.fields
import six

import fiftyone.core.frame_utils as fofu

import eta.core.utils as etau


class Field(mongoengine.fields.BaseField):
    """Base class for :class:`fiftyone.core.sample.Sample` fields."""

    def __str__(self):
        return etau.get_class_name(self)


class StringField(mongoengine.StringField, Field):
    """A unicode string field."""

    pass


class DictField(mongoengine.DictField, Field):
    """A dictionary field that wraps a standard Python dictionary.

    If this field is not set, its default value is ``{}``.

    Args:
        field (None): an optional :class:`Field` instance describing the type
            of the values in the dict
    """

    def __init__(self, field=None, **kwargs):
        if field is not None:
            if not isinstance(field, Field):
                raise ValueError(
                    "Invalid field type '%s'; must be a subclass of %s"
                    % (type(field), Field)
                )

        super().__init__(field=field, **kwargs)

    def __str__(self):
        if self.field is not None:
            return "%s(%s)" % (
                etau.get_class_name(self),
                etau.get_class_name(self.field),
            )

        return etau.get_class_name(self)


class IntDictField(DictField):
    """A :class:`DictField` whose keys must be integers.

    If this field is not set, its default value is ``{}``.

    Args:
        field (None): an optional :class:`Field` instance describing the type
            of the values in the dict
    """

    def to_mongo(self, value):
        if value is None:
            return None

        value = {str(k): v for k, v in value.items()}
        return super().to_mongo(value)

    def to_python(self, value):
        if value is None:
            return None

        return {int(k): v for k, v in value.items()}

    def validate(self, value):
        if not len(value):
            return

        if not all(map(lambda k: isinstance(k, six.integer_types), value)):
            self.error("Not all keys are integers")


class TargetsField(IntDictField):
    """A :class:`IntDictField` for storing label targets (`str`s).

    If this field is not set, its default value is ``{}``.
    """

    def __init__(self, **kwargs):
        super().__init__(field=StringField(null=True, required=True), **kwargs)


class LabelTargetsField(DictField):
    """A :class:`DictField` whose values are :class:`TargetsField`s, i.e. a 
    dictionary mapping label field names to dictionaries whose keys are
    integers (targets) and values are strings (target values).

    If this field is not set, its default value is ``{}``.
    """

    def __init__(self, **kwargs):
        super().__init__(field=TargetsField(), **kwargs)

    def to_mongo(self, value):
        if value is None:
            return None

        value = {
            field: {str(k): v for k, v in targets.items()}
            for field, targets in value.items()
        }
        return super().to_mongo(value)

    def to_python(self, value):
        if value is None:
            return None

        return {
            field: {int(k): v for k, v in targets.items()}
            for field, targets in value.items()
        }

    def validate(self, value):
        if not len(value):
            return

        for targets in value.values():
            if not all(
                map(lambda k: isinstance(k, six.integer_types), targets)
            ):
                self.error("Not all keys are integers")
