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


class IntField(mongoengine.IntField, Field):
    """A 32 bit integer field."""

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


class FrameNumberField(IntField):
    """A video frame number field."""

    def validate(self, value):
        try:
            fofu.validate_frame_number(value)
        except fofu.FrameError as e:
            self.error(str(e))


class IntDictField(DictField):
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


class ObjectIdField(mongoengine.ObjectIdField, Field):
    """An Object ID field."""

    pass


class StringField(mongoengine.StringField, Field):
    """A unicode string field."""

    pass


class TargetsField(IntDictField):
    def __init__(self, **kwargs):
        super().__init__(field=StringField(null=True, required=True), **kwargs)
