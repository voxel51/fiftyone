"""
Backing document classes for :class:`fiftyone.core.sample.Sample` instances.

Class hierarchy::

    ODMDocument
    └── ODMSample
        ├── ODMNoDatasetSample
        └── ODMDatasetSample
            ├── my_custom_dataset
            ├── another_dataset
            └── ...

Design invariants:

-   a :class:`fiftyone.core.sample.Sample` always has a backing
    ``sample._doc``, which is an instance of a subclass of :class:`ODMSample`

-   a :class:`fiftyone.core.dataset.Dataset` always has a backing
    ``dataset._sample_doc`` which is a subclass of ``ODMSample``.

Backing documents explained::

    import fiftyone as fo

    #
    # When a sample is instantiated, its `_doc` attribute is an instance
    # of `ODMNoDatasetSample`
    #
    # `sample._doc` is an instance of `ODMNoDatasetSample`
    #
    sample = fo.Sample()

    #
    # When a dataset is created, its `_sample_doc` attribute holds a
    # dynamically created subclass of `ODMDatasetSample` whose name matches the
    # name of the dataset
    #
    # `dataset._sample_doc` is a `my_dataset` class
    #
    dataset = fo.Dataset(name="my_dataset")

    #
    # When a sample is added to a dataset, its `sample._doc` is changed from
    # type `ODMNoDatasetSample` to type `dataset._sample_doc`
    #
    # `sample._doc` is now an instance of `my_dataset`
    #
    dataset.add_sample(sample)

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
import six

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from collections import OrderedDict
from copy import deepcopy
import numbers

from mongoengine import (
    BooleanField,
    DictField,
    EmbeddedDocument,
    EmbeddedDocumentField,
    FloatField,
    IntField,
    ListField,
    StringField,
)
from mongoengine.fields import BaseField

import fiftyone.core.metadata as fom

from .document import ODMDocument


def nodataset(func):
    """Decorator that provides a more informative error when attempting to call
    a class method on an ODMNoDatasetSample instance that should only be
    called on individual instances.

    This is necessary because fields are shared across all samples in a dataset
    but samples outside of a dataset have their own schema.

    Examples::

            ODMNoDatasetSample.get_field_schema     NoDatasetError
            ODMNoDatasetSample().get_field_schema   OKAY
            ODMDatasetSample.get_field_schema       OKAY
            ODMDatasetSample().get_field_schema     OKAY
    """

    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except TypeError:
            raise NoDatasetError(
                "You are trying to call a dataset method on a sample that has"
                " not been added to a dataset."
            )

    return wrapper


class ODMSample(ODMDocument):
    """Abstract base class for sample backing documents."""

    meta = {"abstract": True}

    # The path to the data on disk
    filepath = StringField(unique=True)

    # The set of tags associated with the sample
    tags = ListField(StringField())

    # Metadata about the sample media
    metadata = EmbeddedDocumentField(fom.Metadata, null=True)

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs, or ``None`` if
        it has not been added to a dataset.
        """
        raise NotImplementedError("Subclass must implement dataset_name")

    @property
    def field_names(self):
        """An ordered list of the names of the fields of this sample."""
        return self._fields_ordered

    def get_field_schema(self, ftype=None):
        """Returns a schema dictionary describing the fields of this sample.

        If the sample belongs to a dataset, the schema will apply to all
        samples in the dataset.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                ``mongoengine.fields.BaseField``

        Returns:
             a dictionary mapping field names to field types
        """
        raise NotImplementedError("Subclass must implement get_field_schema()")

    def add_field(
        self, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        """Adds a new field to the dataset.

        Args:
            field_name: the field name
            ftype: the field type to create. Must be a subclass of
                ``mongoengine.fields.BaseField``
            embedded_doc_type (None): the
                ``mongoengine.fields.EmbeddedDocument`` type of the field. Used
                only when ``ftype == EmbeddedDocumentField``
            subfield (None): the type of the contained field. Used only when
                `ftype` is a list or dict type
        """
        raise NotImplementedError("Subclass must implement add_field()")

    def add_implied_field(self, field_name, value):
        """Adds the field to the sample, inferring the field type from the
        provided value.

        Args:
            field_name: the field name
            value: the field value
        """
        raise NotImplementedError(
            "Subclass must implement add_implied_field()"
        )

    def get_field(self, field_name):
        """Gets the field of the sample.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
        """
        return self.__getattribute__(field_name)

    def set_field(self, field_name, value, create=False):
        """Sets the value of a field of the sample.

        Args:
            field_name: the field name
            value: the field value
            create (False): whether to create the field if it does not exist

        Raises:
            ValueError: if ``field_name`` is not an allowed field name or does
                not exist and ``create == False``
        """
        if field_name.startswith("_"):
            raise ValueError(
                "Invalid field name: '%s'. Field names cannot start with '_'"
                % field_name
            )

        if hasattr(self, field_name) and field_name not in self._fields:
            raise ValueError("Cannot use reserved keyword '%s'" % field_name)

        if field_name not in self._fields:
            if create:
                self.add_implied_field(field_name, value)
            else:
                raise ValueError(
                    "Sample does not have field '%s'. Use `create=True` to "
                    "create a new field"
                )

        self.__setattr__(field_name, value)

    def clear_field(self, field_name):
        """Clears the value of a field of the sample.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        raise NotImplementedError("Subclass must implement clear_field()")

    def delete_field(self, field_name):
        """Deletes the field from the dataset.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        raise NotImplementedError("Subclass must implement delete_field()")

    @staticmethod
    def _get_field_schema(cls_or_self, ftype=None):
        if ftype is None:
            ftype = BaseField

        if not issubclass(ftype, (BaseField, EmbeddedDocument)):
            raise ValueError(
                "Field type %s must be subclass of %s or %s"
                % (ftype, BaseField, EmbeddedDocument)
            )

        d = OrderedDict()
        for field_name in cls_or_self._fields_ordered:
            field = cls_or_self._fields[field_name]
            if issubclass(ftype, BaseField):
                if isinstance(field, ftype):
                    d[field_name] = field
            elif isinstance(field, EmbeddedDocumentField):
                if issubclass(field.document_type, ftype):
                    d[field_name] = field

        return d

    @staticmethod
    def _add_field(
        cls_or_self, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        if field_name in cls_or_self._fields:
            raise ValueError("Field '%s' already exists" % field_name)

        if not issubclass(ftype, BaseField):
            raise ValueError(
                "Invalid field type '%s'; must be a subclass of '%s'"
                % (ftype, BaseField)
            )

        kwargs = {"db_field": field_name, "null": True}

        if issubclass(ftype, EmbeddedDocumentField):
            kwargs.update({"document_type": embedded_doc_type})
        elif any(issubclass(ftype, ft) for ft in [ListField, DictField]):
            if subfield is not None:
                kwargs["field"] = subfield

        #
        # Mimicking setting a DynamicField from this code:
        #   https://github.com/MongoEngine/mongoengine/blob/3db9d58dac138dd0e838c524f616ebe3d23db2ff/mongoengine/base/document.py#L170
        #
        field = ftype(**kwargs)
        field.name = field_name
        cls_or_self._fields[field_name] = field
        cls_or_self._fields_ordered += (field_name,)
        try:
            if issubclass(cls_or_self, ODMSample):
                # Only set the attribute if it is a class
                setattr(cls_or_self, field_name, field)
        except TypeError:
            # Instance, not class, so do not `setattr`
            pass

    @staticmethod
    def _add_implied_field(cls_or_self, field_name, value):
        """Adds the field to the sample, inferring the field type from the
        provided value.
        """
        if field_name in cls_or_self._fields:
            raise ValueError("Field '%s' already exists" % field_name)

        if isinstance(value, EmbeddedDocument):
            cls_or_self.add_field(
                field_name,
                EmbeddedDocumentField,
                embedded_doc_type=type(value),
            )
        elif isinstance(value, bool):
            cls_or_self.add_field(field_name, BooleanField)
        elif isinstance(value, six.integer_types):
            cls_or_self.add_field(field_name, IntField)
        elif isinstance(value, numbers.Number):
            cls_or_self.add_field(field_name, FloatField)
        elif isinstance(value, six.string_types):
            cls_or_self.add_field(field_name, StringField)
        elif isinstance(value, list) or isinstance(value, tuple):
            cls_or_self.add_field(field_name, ListField)
        elif isinstance(value, dict):
            cls_or_self.add_field(field_name, DictField)
        else:
            raise TypeError("Unsupported field value '%s'" % type(value))


class ODMNoDatasetSample(ODMSample):
    """Backing document for samples that have not been added to a dataset."""

    meta = {"abstract": True}

    def __init__(self, *args, **kwargs):
        # Initialize default fields
        default_fields = {
            k: v for k, v in iteritems(kwargs) if k in self._fields
        }
        super(ODMNoDatasetSample, self).__init__(*args, **default_fields)

        # Make a local copy of the fields, independent of the class fields
        self._nods_fields = deepcopy(self._fields)
        self._nods_fields_ordered = deepcopy(self._fields_ordered)

        # Add dynamic fields to the instance
        for field_name, value in iteritems(kwargs):
            if field_name not in self._fields:
                self.set_field(field_name, value, create=True)

    def __getattribute__(self, name):
        # Override class attributes `_fields` and `_fields_ordered`
        # with their instance counterparts
        if name == "_fields" and hasattr(self, "_nods_fields"):
            return self._nods_fields

        if name == "_fields_ordered" and hasattr(self, "_nods_fields_ordered"):
            return self._nods_fields_ordered

        return super(ODMNoDatasetSample, self).__getattribute__(name)

    def __setattr__(self, name, value):
        # Override class attributes `_fields` and `_fields_ordered`
        # with their instance counterparts
        if name == "_fields_ordered" and hasattr(self, "_nods_fields_ordered"):
            self.__setattr__("_nods_fields_ordered", value)
            return

        if name.startswith("_") or (
            hasattr(self, name) and name not in self.field_names
        ):
            super(ODMNoDatasetSample, self).__setattr__(name, value)
            return

        if name not in self.field_names:
            raise ValueError(
                "Adding sample fields using the `sample.%s = value` syntax is "
                'not allowed; use `sample["%s"] = value` syntax instead'
                % (name, name)
            )

        if value is not None:
            self._fields[name].validate(value)

        super(ODMNoDatasetSample, self).__setattr__(name, value)

        if name in self._fields:
            # __set__() has not yet been called because the field is not a
            # class attribute; so we must explicitly call it
            field = self._fields[name]
            field.__set__(self, value)

    @property
    def dataset_name(self):
        return None

    @property
    def id(self):
        return None

    @nodataset
    def get_field_schema(self, ftype=None):
        return self._get_field_schema(cls_or_self=self, ftype=ftype)

    @nodataset
    def add_field(
        self, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        self._add_field(
            self,
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
        )

    @nodataset
    def add_implied_field(self, field_name, value):
        self._add_implied_field(
            cls_or_self=self, field_name=field_name, value=value,
        )

    @nodataset
    def delete_field(self, field_name):
        # @todo(Tyler) ODMNoDatasetSample.delete_field
        raise NotImplementedError("Not yet implemented")


class NoDatasetError(Exception):
    """Exception raised by ODMNoDatasetSample when trying to do something that
    only works for samples already added to a dataset.
    """

    pass


class ODMDatasetSample(ODMSample):
    """Abstract ODMSample class that all
    :class:`fiftyone.core.dataset.Dataset._sample_doc` classes inherit from.
    Instances of the subclasses are samples, i.e.::

        sample = dataset._sample_doc(...)

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.
    """

    meta = {"abstract": True}

    def __setattr__(self, name, value):
        if name.startswith("_") or (
            hasattr(self, name) and name not in self.field_names
        ):
            super(ODMDatasetSample, self).__setattr__(name, value)
            return

        if name not in self.field_names:
            raise ValueError(
                "Adding sample fields using the `sample.%s = value` syntax is "
                'not allowed; use `sample["%s"] = value` syntax instead'
                % (name, name)
            )

        if value is not None:
            self._fields[name].validate(value)

        super(ODMDatasetSample, self).__setattr__(name, value)

    @property
    def dataset_name(self):
        return self.__class__.__name__

    @classmethod
    def get_field_schema(cls, ftype=None):
        return cls._get_field_schema(cls_or_self=cls, ftype=ftype)

    @classmethod
    def add_field(
        cls, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        cls._add_field(
            cls,
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
        )

    @classmethod
    def add_implied_field(cls, field_name, value):
        cls._add_implied_field(
            cls_or_self=cls, field_name=field_name, value=value,
        )

    @classmethod
    def delete_field(cls, field_name):
        # Delete from all samples
        # pylint: disable=no-member
        cls.objects.update(**{"unset__%s" % field_name: None})

        # Remove from dataset
        del cls._fields[field_name]
        cls._fields_ordered = tuple(
            fn for fn in cls._fields_ordered if fn != field_name
        )
        delattr(cls, field_name)
