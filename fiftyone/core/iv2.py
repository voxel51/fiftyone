"""

"""
import warnings
import six

from mongoengine import *

from mongoengine.fields import BaseField


class Dataset(Document):
    filepath = StringField()
    tags = ListField(StringField())

    @classmethod
    def get_sample_fields(cls, field_type=None):
        exclude_fields = ["_cls"]
        # exclude_fields = ["_cls", "dataset", "id"]

        try:
            if not issubclass(field_type, BaseField):
                field_type = BaseField
        except Exception:
            field_type = BaseField

        field_names = [
            fn
            for fn in dir(cls)
            if isinstance(getattr(cls, fn), field_type)
            and fn not in exclude_fields
        ]

        fields = {fn: type(getattr(cls, fn)) for fn in field_names}

        return fields

    def __setattr__(self, name, value):
        if name.startswith("_"):
            return super(Dataset, self).__setattr__(name, value)

        cls = type(self)
        if hasattr(cls, name):
            if value is not None:
                getattr(cls, name).validate(value)
            result = super(Dataset, self).__setattr__(name, value)
            if name not in ["_cls", "id"] and isinstance(
                getattr(cls, name), BaseField
            ):
                self.save()
            return result

        warnings.warn(
            "Pandas doesn't allow columns to be "
            "created via a new attribute name - see "
            "https://pandas.pydata.org/pandas-docs/"
            "stable/indexing.html#attribute-access",
            stacklevel=2,
        )
        result = super(Dataset, self).__setattr__(name, value)
        if name not in ["_cls", "id"] and isinstance(
            getattr(cls, name), BaseField
        ):
            self.save()
        return result

    def __getitem__(self, key):
        if hasattr(self, key):
            return self.__getattribute__(key)
        return super(Dataset, self).__getitem__(key)

    def __setitem__(self, key, value):
        if key.startswith("_"):
            raise KeyError("Invalid key: '%s'. Key canot start with '_'" % key)

        if not hasattr(self, key):
            if isinstance(value, BaseField):
                field = type(value)()
            elif isinstance(value, bool):
                field = BooleanField()
            elif isinstance(value, six.integer_types):
                field = IntField()
            elif isinstance(value, six.string_types):
                field = StringField()
            elif isinstance(value, list) or isinstance(value, tuple):
                field = ListField()
            elif isinstance(value, dict):
                field = DictField()
            else:
                raise TypeError(
                    "Invalid type: '%s' could not be cast to Field"
                    % type(value)
                )

            setattr(type(self), key, field)

        return self.__setattr__(key, value)
