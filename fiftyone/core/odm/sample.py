"""
Backing Document classes for samples.

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
import six
import warnings

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

import fiftyone.core.metadata as fom

from .document import ODMDocument


def nodataset(func):
    """Decorator that provides a more informative error when attempting to call
    a class method on an ODMNoDatasetSample instance that should only be
    called on individual instances.

    This is necessary because fields are shared across all samples in a dataset
    but samples outside of a dataset have their own schema.

    e.g.
            ODMNoDatasetSample.get_field_schema         -> NoDatasetError
            ODMNoDatasetSample().get_field_schema       -> OKAY
            ODMDatasetSample.get_field_schema           -> OKAY
            ODMDatasetSample().get_field_schema         -> OKAY

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
    meta = {"abstract": True}

    # the path to the data on disk
    filepath = StringField(unique=True)
    # the set of tags associated with the sample
    tags = ListField(StringField())
    # metadata about the sample media
    metadata = EmbeddedDocumentField(fom.Metadata, null=True)

    def get_field_schema(self, ftype=None):
        """Gets a dictionary of all document fields on elements of this
        collection.

        Args:
            ftype (None): the subclass of ``BaseField`` for primitives
                or ``EmbeddedDocument`` for ``EmbeddedDocumentField``s to
                filter by


        Returns:
             a dictionary of (field name: field type) per field that is a
             subclass of ``ftype``
        """
        raise NotImplementedError("Subclass must implement")

    def add_field(
        self, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        """Add a new field to the dataset

        Args:
            field_name: the string name of the field to add
            ftype: the type (subclass of BaseField) of the field to create
            embedded_doc_type (None): the EmbeddedDocument type, used if
                    ftype=EmbeddedDocumentField
                ignored otherwise
            subfield (None): the optional contained field for lists and dicts,
                if provided

        """
        raise NotImplementedError("Subclass must implement")

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs, or ``None`` if
        it has not been added to a dataset.
        """
        raise NotImplementedError("Subclass must implement")

    def get_field(self, field_name):
        raise NotImplementedError("Subclass must implement")

    def set_field(self, field_name, value, create=False):
        raise NotImplementedError("Subclass must implement")

    def _get_fields(self):
        raise NotImplementedError("Subclass must implement")

    def _get_fields_ordered(self):
        raise NotImplementedError("Subclass must implement")

    def _set_fields_ordered(self, value):
        raise NotImplementedError("Subclass must implement")

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

        fields = cls_or_self._get_fields()
        fields_ordered = cls_or_self._get_fields_ordered()

        d = OrderedDict()

        for field_name in fields_ordered:
            field = fields[field_name]
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
        """Add a new field to the dataset

        Args:
            field_name: the string name of the field to add
            ftype: the type (subclass of BaseField) of the field to create
            embedded_doc_type (None): the EmbeddedDocument type, used if
                    ftype=EmbeddedDocumentField
                ignored otherwise
            subfield (None): the optional contained field for lists and dicts,
                if provided

        """
        fields = cls_or_self._get_fields()

        if field_name in fields:
            raise ValueError("Field '%s' already exists" % field_name)

        if not issubclass(ftype, BaseField):
            raise ValueError(
                "Invalid field type '%s' is not a subclass of '%s'"
                % (ftype, BaseField)
            )

        kwargs = {"db_field": field_name}

        if issubclass(ftype, EmbeddedDocumentField):
            kwargs.update(
                {"document_type": embedded_doc_type, "null": True,}
            )
        elif any(issubclass(ftype, ft) for ft in [ListField, DictField]):
            if subfield is not None:
                kwargs["field"] = subfield

        # Mimicking setting a DynamicField from this code:
        #   https://github.com/MongoEngine/mongoengine/blob/3db9d58dac138dd0e838c524f616ebe3d23db2ff/mongoengine/base/document.py#L170
        field = ftype(**kwargs)
        field.name = field_name
        fields[field_name] = field
        cls_or_self._set_fields_ordered(
            cls_or_self._get_fields_ordered() + (field_name,)
        )
        setattr(cls_or_self, field_name, field)


class ODMNoDatasetSample(ODMSample):
    # def __init__(self, **kwargs):
    #     self._fields_ordered = list(kwargs)
    #     self._data = kwargs

    meta = {"abstract": True}

    def __init__(self, *args, **kwargs):
        super(ODMNoDatasetSample, self).__init__(*args, **kwargs)
        self._nods_fields = deepcopy(self._fields)
        self._nods_fields_ordered = deepcopy(self._fields_ordered)

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

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs, or ``None`` if
        it has not been added to a dataset.
        """
        return None

    @property
    def id(self):
        """Samples not in a dataset never have an ID."""
        return None

    def get_field(self, field_name):
        # @todo(Tyler)
        raise NotImplementedError("TODO")

    def set_field(self, field_name, value, create=False):
        # @todo(Tyler)
        raise NotImplementedError("TODO")

    def _get_fields(self):
        return self._nods_fields

    def _get_fields_ordered(self):
        return self._nods_fields_ordered

    def _set_fields_ordered(self, value):
        self._nods_fields_ordered = value


class NoDatasetError(Exception):
    """Exception raised by ODMNoDatasetSample when trying to do something that
    only works for samples already added to a dataset.
    """

    pass


class ODMDatasetSample(ODMSample):
    """Abstract ODMSample class that all
    :class:`fiftyone.core.dataset.Dataset._Doc` classes inherit from.
    Instances of the subclasses are samples. I.e.:

        sample = dataset._Doc(...)

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.
    """

    meta = {"abstract": True}

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

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs"""
        return self.__class__.__name__

    def __setattr__(self, name, value):
        # all attrs starting with "_" or that exist and are not fields are
        # deferred to super
        if name.startswith("_") or (
            hasattr(self, name) and name not in self._fields
        ):
            return super(ODMDatasetSample, self).__setattr__(name, value)

        cls = self.__class__

        if hasattr(cls, name):
            if value is not None:
                getattr(cls, name).validate(value)

            result = super(ODMDatasetSample, self).__setattr__(name, value)
            if (
                name not in ["_cls", "id"]
                and isinstance(getattr(cls, name), BaseField)
                and self.in_db
            ):
                # autosave the change to existing attrs
                self.save()
            return result

        warnings.warn(
            "Fiftyone doesn't allow fields to be "
            "created via a new attribute name",
            stacklevel=2,
        )
        return super(ODMDatasetSample, self).__setattr__(name, value)

    def get_field(self, field_name):
        if (
            isinstance(field_name, six.string_types)
            and field_name in self._fields
        ):
            if hasattr(self, field_name):
                return self.__getattribute__(field_name)
            # @todo(Tyler)
            raise NotImplementedError(
                "TODO: This could return None, but it should be found in the"
                " document as `null` instead"
            )
        raise KeyError("Invalid field '%s'" % field_name)

    def set_field(self, field_name, value, create=False):
        """Set the value of a field for a sample

        Args:
            field_name: the string name of the field to add
            value: the value to set the field to
            create (False): If True and field_name is not set on the dataset,
                create a field on the dataset of a type implied by value

        Raises:
            ValueError: if:
                the field_name is invalid
                the field_name does not exist and create=False
        """
        if field_name.startswith("_"):
            raise ValueError(
                "Invalid field name: '%s'. Field name cannot start with '_'"
                % field_name
            )

        if hasattr(self, field_name) and field_name not in self._fields:
            raise ValueError("Cannot set reserve word '%s'" % field_name)

        if field_name not in self._fields:
            if create:
                self._add_implied_field(field_name, value)
            else:
                raise ValueError(
                    "Sample does not have field '%s'. Use `create=True` to"
                    " create a new field."
                )

        return self.__setattr__(field_name, value)

    @classmethod
    def _add_implied_field(cls, field_name, value):
        """Determine the field type from the value type"""
        assert (
            field_name not in cls._fields
        ), "Attempting to add field that already exists"

        if isinstance(value, EmbeddedDocument):
            cls.add_field(
                field_name,
                EmbeddedDocumentField,
                embedded_doc_type=type(value),
            )
        elif isinstance(value, bool):
            cls.add_field(field_name, BooleanField)
        elif isinstance(value, six.integer_types):
            cls.add_field(field_name, IntField)
        elif isinstance(value, six.string_types):
            cls.add_field(field_name, StringField)
        elif isinstance(value, list) or isinstance(value, tuple):
            # @todo(Tyler) set the subfield of ListField and
            #   ensure all elements are of this type
            cls.add_field(field_name, ListField)
        elif isinstance(value, dict):
            cls.add_field(field_name, DictField)
        else:
            raise TypeError(
                "Invalid type: '%s' could not be cast to Field" % type(value)
            )

    @classmethod
    def _get_fields(cls):
        return cls._fields

    @classmethod
    def _get_fields_ordered(cls):
        return cls._fields_ordered

    @classmethod
    def _set_fields_ordered(cls, value):
        cls._fields_ordered = value
