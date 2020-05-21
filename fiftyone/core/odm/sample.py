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
    ``dataset._sample_doc_cls`` which is a subclass of ``ODMDatasetSample``.

Implementation details

When a new :class:`fiftyone.core.sample.Sample` is created, its `_doc`
attribute is an instance of `ODMNoDatasetSample`::

    import fiftyone as fo

    sample = fo.Sample()
    sample._doc  # ODMNoDatasetSample

When a new :class:`fiftyone.core.dataset.Dataset` is created, its
`_sample_doc_cls` attribute holds a dynamically created subclass of
:class:`ODMDatasetSample` whose name is the name of the dataset::

    dataset = fo.Dataset(name="my_dataset")
    dataset._sample_doc_cls  # my_dataset(ODMDatasetSample)

When a sample is added to a dataset, its `sample._doc` instance is changed from
type :class:`ODMNoDatasetSample` to type ``dataset._sample_doc_cls``::

    dataset.add_sample(sample)
    sample._doc  # my_dataset(ODMDatasetSample)

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
from mongoengine.errors import InvalidQueryError

import fiftyone.core.metadata as fom

from .dataset import SampleField
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

    def __setattr__(self, name, value):
        has_field = self.has_field(name)

        if name.startswith("_") or (hasattr(self, name) and not has_field):
            super(ODMSample, self).__setattr__(name, value)
            return

        if not has_field:
            raise ValueError(
                "Adding sample fields using the `sample.field = value` syntax "
                "is not allowed; use `sample['field'] = value` instead"
            )

        if value is not None:
            self._fields[name].validate(value)

        super(ODMSample, self).__setattr__(name, value)

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

    def has_field(self, field_name):
        """Determines whether the sample has a field of the given name.

        Args:
            field_name: the field name

        Returns:
            True/False
        """
        return field_name in self._fields

    def get_field(self, field_name):
        """Gets the field of the sample.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
        """
        if not self.has_field(field_name):
            raise AttributeError("Sample has no field '%s'" % field_name)

        return self.__getattribute__(field_name)

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

        if hasattr(self, field_name) and not self.has_field(field_name):
            raise ValueError("Cannot use reserved keyword '%s'" % field_name)

        if not self.has_field(field_name):
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
        for field_name in cls_or_self._fields:
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
        elif issubclass(ftype, (ListField, DictField)):
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
        elif isinstance(value, (list, tuple)):
            cls_or_self.add_field(field_name, ListField)
        elif isinstance(value, dict):
            cls_or_self.add_field(field_name, DictField)
        else:
            raise TypeError("Unsupported field value '%s'" % type(value))


class ODMNoDatasetSample(ODMSample):
    """Backing document for samples that have not been added to a dataset."""

    meta = {"abstract": True}

    def __init__(self, *args, **kwargs):
        fields = set(self.field_names)

        # Pull the new fields before calling init of super
        new_fields = {}
        for k in list(kwargs.keys()):
            if k not in fields and not k.startswith("_"):
                new_fields[k] = kwargs.pop(k)

        super(ODMNoDatasetSample, self).__init__(*args, **kwargs)

        # Convert fields to instance attributes
        # This allows each sample to have bespoke attributes
        self._fields = deepcopy(self._fields)
        self._fields_ordered = deepcopy(self._fields_ordered)

        # Add new fields
        for field_name, value in iteritems(new_fields):
            if field_name not in fields:
                self.set_field(field_name, value, create=True)

    def __setattr__(self, name, value):
        super(ODMNoDatasetSample, self).__setattr__(name, value)

        try:
            field = self._fields[name]
            field.__set__(self, value)
        except KeyError:
            pass

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
    """Abstract base class for dataset sample classes.

    All :class:`fiftyone.core.dataset.Dataset._sample_doc_cls` classes inherit
    from this class.
    """

    meta = {"abstract": True}

    @property
    def dataset_name(self):
        return self.__class__.__name__

    @classmethod
    def get_field_schema(cls, ftype=None):
        return cls._get_field_schema(cls_or_self=cls, ftype=ftype)

    @classmethod
    def add_field(
        cls,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        save=True,
    ):
        cls._add_field(
            cls,
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
        )

        # @todo(Tyler) refactor to avoid local import here
        if save:
            from fiftyone.core.dataset import Dataset

            dataset = Dataset(name=cls.__name__)

            # Update dataset meta class
            field = cls._fields[field_name]
            sample_field = SampleField.from_field(field)
            dataset._meta.sample_fields.append(sample_field)
            dataset._meta.save()

    @classmethod
    def add_implied_field(cls, field_name, value):
        cls._add_implied_field(
            cls_or_self=cls, field_name=field_name, value=value,
        )

    @classmethod
    def delete_field(cls, field_name, save=True):
        try:
            # Delete from all samples
            # pylint: disable=no-member
            cls.objects.update(**{"unset__%s" % field_name: None})
        except InvalidQueryError:
            raise AttributeError("Sample has no field '%s'" % field_name)

        # Remove from dataset
        del cls._fields[field_name]
        cls._fields_ordered = tuple(
            fn for fn in cls._fields_ordered if fn != field_name
        )
        delattr(cls, field_name)

        if save:
            from fiftyone.core.dataset import Dataset

            dataset = Dataset(name=cls.__name__)

            # Update dataset meta class
            dataset._meta.sample_fields = [
                sf
                for sf in dataset._meta.sample_fields
                if sf.name != field_name
            ]
            dataset._meta.save()
