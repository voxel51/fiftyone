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
    ``dataset._Doc`` which is a subclass of ``ODMSample``.

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
    # When a dataset is created, its `_Doc` attribute holds a dynamically
    # created subclass of `ODMDatasetSample` whose name matches the name of
    # the dataset
    #
    # `dataset._Doc` is a `my_dataset` class
    #
    dataset = fo.Dataset(name="my_dataset")

    #
    # When a sample is added to a dataset, its `sample._doc` is changed from
    # type `ODMNoDatasetSample` to type `dataset._Doc`
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

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from collections import OrderedDict
from copy import deepcopy
import logging
import six

from mongoengine import (
    EmbeddedDocument,
    BooleanField,
    IntField,
    StringField,
    ListField,
    DictField,
    EmbeddedDocumentField,
)
from mongoengine.fields import BaseField
from mongoengine.errors import ValidationError

import fiftyone.core.metadata as fom

from .document import ODMDocument


logger = logging.getLogger(__name__)


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
        """Gets a dictionary of all fields on this sample (and all samples in
        the same dataset if applicable).

        Args:
            ftype (None): the subclass of ``BaseField`` for primitives or
                ``EmbeddedDocument`` for ``EmbeddedDocumentField`` types

        Returns:
             a dictionary mapping field names to field types
        """
        raise NotImplementedError("Subclass must implement get_field_schema()")

    def add_field(
        self, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        """Adds a new field to the dataset.

        Args:
            field_name: the name of the field to add
            ftype: the type (subclass of ``BaseField``) of the field to create
            embedded_doc_type (None): the ``EmbeddedDocument`` type. Used only
                when ``ftype == EmbeddedDocumentField``
            subfield (None): the optional contained field for lists and dicts,
                if provided
        """
        raise NotImplementedError("Subclass must implement add_field()")

    def delete_field(self, field_name):
        """Deletes the field from the dataset.

        Args:
            field_name: the name of the field to delete
        """
        raise NotImplementedError("Subclass must implement delete_field()")

    def get_field(self, field_name):
        """Gets the field for the sample.

        Args:
            field_name: the name of the field to add

        Returns:
            the field value
        """
        if not isinstance(field_name, six.string_types):
            raise TypeError("Field name must be a string")

        if field_name in self._fields:
            return self.__getattribute__(field_name)

        raise KeyError("Invalid field '%s'" % field_name)

    def set_field(self, field_name, value, create=False):
        """Sets the value of a field of the sample.

        Args:
            field_name: the name of the field to set
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
                self._add_implied_field(field_name, value)
            else:
                raise ValueError(
                    "Sample does not have field '%s'. Use `create=True` to "
                    "create a new field"
                )

        return self.__setattr__(field_name, value)

    def clear_field(self, field_name):
        """Clears the value of a field of the sample.

        Args:
            field_name: the name of the field to clear

        Raises:
            KeyError: if the field name is not valid
        """
        raise NotImplementedError("Subclass must implement clear_field()")

    @staticmethod
    def _get_field_schema(cls_or_self, ftype=None):
        if ftype is None:
            ftype = BaseField

        if not issubclass(ftype, BaseField) and not issubclass(
            ftype, EmbeddedDocument
        ):
            raise ValueError(
                "ftype must be subclass of %s or %s" % BaseField,
                EmbeddedDocument,
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
        """Adds a new field to the dataset.

        Args:
            field_name: the name of the field to add
            ftype: the type (subclass of BaseField) of the field to create
            embedded_doc_type (None): the EmbeddedDocument type. Used only when
                ``ftype == EmbeddedDocumentField``
            subfield (None): the optional contained field for lists and dicts,
                if provided
        """
        if field_name in cls_or_self._fields:
            raise ValueError("Field '%s' already exists" % field_name)

        if not issubclass(ftype, BaseField):
            raise ValueError(
                "Invalid field type '%s' is not a subclass of '%s'"
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
                # only set the attribute if it is a class
                setattr(cls_or_self, field_name, field)
        except TypeError:
            # instance, not class, so do not setattr
            pass

    def _add_implied_field(self, field_name, value):
        """Adds the field to the sample, inferring the field type from the
        provided value.
        """
        if field_name not in self._fields:
            raise ValueError(
                "Attempting to add field '%s' that already exists" % field_name
            )

        if isinstance(value, EmbeddedDocument):
            self.add_field(
                field_name,
                EmbeddedDocumentField,
                embedded_doc_type=type(value),
            )
        elif isinstance(value, bool):
            self.add_field(field_name, BooleanField)
        elif isinstance(value, six.integer_types):
            self.add_field(field_name, IntField)
        elif isinstance(value, six.string_types):
            self.add_field(field_name, StringField)
        elif isinstance(value, list) or isinstance(value, tuple):
            # @todo(Tyler) set the subfield of ListField and
            #   ensure all elements are of this type
            self.add_field(field_name, ListField)
        elif isinstance(value, dict):
            self.add_field(field_name, DictField)
        else:
            raise TypeError(
                "Invalid type '%s'; could not be cast to Field" % type(value)
            )


class ODMNoDatasetSample(ODMSample):
    """Backing document for samples that have not been added to a dataset."""

    meta = {"abstract": True}

    def __init__(self, *args, **kwargs):
        # Split kwargs into default and custom
        default_kwargs = {
            k: v for k, v in iteritems(kwargs) if k in self._fields
        }
        custom_kwargs = {
            k: v for k, v in iteritems(kwargs) if k not in self._fields
        }

        # Initialize with default kwargs
        super(ODMNoDatasetSample, self).__init__(*args, **default_kwargs)

        # Make a local copy of the fields, independent of the class fields
        self._nods_fields = deepcopy(self._fields)
        self._nods_fields_ordered = deepcopy(self._fields_ordered)

        # Add the custom fields to the instance
        for field_name, value in iteritems(custom_kwargs):
            self.set_field(field_name, value, create=True)

    def __getattribute__(self, name):
        # Override class attributes '_fields' and '_fields_ordered'
        # with their instance counterparts
        if name == "_fields" and hasattr(self, "_nods_fields"):
            return self._nods_fields

        if name == "_fields_ordered" and hasattr(self, "_nods_fields_ordered"):
            return self._nods_fields_ordered

        return super(ODMNoDatasetSample, self).__getattribute__(name)

    def __setattr__(self, name, value):
        # Override class attributes '_fields' and '_fields_ordered'
        # with their instance counterparts
        if name == "_fields_ordered" and hasattr(self, "_nods_fields_ordered"):
            return self.__setattr__("_nods_fields_ordered", value)

        # @todo(Tyler) this code is not DRY...occurs in 3 spots :( ############
        # all attrs starting with "_" or that exist and are not fields are
        # deferred to super
        if name.startswith("_") or (
            hasattr(self, name) and name not in self.field_names
        ):
            return super().__setattr__(name, value)

        if name not in self.field_names:
            logger.warning(
                "FiftyOne does not allow new fields to be dynamically created "
                "by setting them"
            )
            return super().__setattr__(name, value)
        # @todo(Tyler) END NOT-DRY ############################################

        # @todo(Tyler) this should replace the field rather than validate
        if value is not None:
            try:
                self._fields[name].validate(value)
            except ValidationError:
                # @todo(Tyler)
                raise ValidationError(
                    "Changing a field type is not yet supported"
                )

        result = super(ODMNoDatasetSample, self).__setattr__(name, value)
        if name in self._fields:
            # __set__() is not called because the field is not a class
            # attribute so we must explicitly call it
            field = self._fields[name]
            field.__set__(self, value)

        return result

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
            cls_or_self=self,
            field_name=field_name,
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
        )

    @nodataset
    def delete_field(self, field_name):
        # @todo(Tyler) ODMNoDatasetSample.delete_field
        raise NotImplementedError("TODO TYLER")


class NoDatasetError(Exception):
    """Exception raised by ODMNoDatasetSample when trying to do something that
    only works for samples already added to a dataset.
    """

    pass


class ODMDatasetSample(ODMSample):
    """Abstract ODMSample class that all
    :class:`fiftyone.core.dataset.Dataset._Doc` classes inherit from.
    Instances of the subclasses are samples, i.e.::

        sample = dataset._Doc(...)

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.
    """

    meta = {"abstract": True}

    def __setattr__(self, name, value):
        # @todo(Tyler) this code is not DRY...occurs in 3 spots :( ############
        # all attrs starting with "_" or that exist and are not fields are
        # deferred to super
        if name.startswith("_") or (
            hasattr(self, name) and name not in self.field_names
        ):
            return super().__setattr__(name, value)

        if name not in self.field_names:
            logger.warning(
                "FiftyOne does not allow new fields to be dynamically created "
                "by setting them"
            )
            return super().__setattr__(name, value)
        # @todo(Tyler) END NOT-DRY ############################################

        # @todo(Tyler) does validate work when value is None?
        if value is not None:
            self._fields[name].validate(value)

        return super(ODMDatasetSample, self).__setattr__(name, value)

    @classmethod
    def get_field_schema(cls, ftype=None):
        return cls._get_field_schema(cls_or_self=cls, ftype=ftype)

    @classmethod
    def add_field(
        cls, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        cls._add_field(
            cls_or_self=cls,
            field_name=field_name,
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
        )

    @classmethod
    def delete_field(cls, field_name):
        # delete from all samples
        cls.objects().update(**{"unset__%s" % field_name: None})

        # remove from dataset
        del cls._fields[field_name]
        cls._fields_ordered = tuple(
            fn for fn in cls._fields_ordered if fn != field_name
        )
        delattr(cls, field_name)

    @property
    def dataset_name(self):
        return self.__class__.__name__
