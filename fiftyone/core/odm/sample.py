"""
Backing Document classes for samples.

Class Hierarchy:

ODMDocument
└── ODMSample
    ├── ODMNoDatasetSample
    └── ODMDatasetSample
        ├── my_custom_dataset
        ├── another_dataset
        └── ...

A sample always has a backing `sample._doc` which is an instance of a subclass
of `ODMSample` and a dataset always has a backing `dataset._Doc` which is a
subclass of `ODMSample`

```python
import fiftyone as fo

# when a `Sample` is instantiated, the backing doc is of type
# `ODMNoDatasetSample`
sample = fo.Sample()  # -> sample._doc is a `ODMNoDatasetSample` instance

# when a `Dataset` is created, a new subclass of `ODMDatasetSample` is created
dataset = fo.Dataset(name="my_dataset")  # -> dataset._Doc is an
#                                            `ODMDatasetSample` subclass called
#                                            `my_dataset`

# when a Sample is added to a Dataset, the `sample._doc` is changed from type
# `ODMNoDatasetSample` to type `dataset._Doc`
dataset.add_sample(sample)  # -> sample._doc is now a `my_dataset` instance
```

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
from mongoengine.errors import ValidationError

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

    @property
    def field_names(self):
        """Ordered list of the names of the fields of this sample."""
        return self._fields_ordered

    def get_field(self, field_name):
        if not isinstance(field_name, six.string_types):
            raise TypeError("Field name must be of type string")

        if field_name in self._fields:
            if hasattr(self, field_name):
                return self.__getattribute__(field_name)
            # you should never get here!
            raise KeyError(
                "Field set but object does not have attribute: '%s'"
                % field_name
            )
        raise KeyError("Invalid field '%s'" % field_name)

    def set_field(self, field_name, value, create=False):
        """Sets the value of a field for the sample.

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
        if field_name in cls_or_self._fields:
            raise ValueError("Field '%s' already exists" % field_name)

        if not issubclass(ftype, BaseField):
            raise ValueError(
                "Invalid field type '%s' is not a subclass of '%s'"
                % (ftype, BaseField)
            )

        kwargs = {"db_field": field_name, "null": True}

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
        """Determine the field type from the value type"""
        assert (
            field_name not in self._fields
        ), "Attempting to add field that already exists"

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
                "Invalid type: '%s' could not be cast to Field" % type(value)
            )


class ODMNoDatasetSample(ODMSample):
    meta = {"abstract": True}

    def __init__(self, *args, **kwargs):
        # split kwargs into default and custom
        default_kwargs = {
            k: v for k, v in iteritems(kwargs) if k in self._fields
        }
        custom_kwargs = {
            k: v for k, v in iteritems(kwargs) if k not in self._fields
        }

        # initialize with default kwargs
        super(ODMNoDatasetSample, self).__init__(*args, **default_kwargs)

        # make a local copy of the fields, independent of the class fields
        self._nods_fields = deepcopy(self._fields)
        self._nods_fields_ordered = deepcopy(self._fields_ordered)

        # add the custom fields to the instance
        for field_name, value in iteritems(custom_kwargs):
            self.set_field(field_name, value, create=True)

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

    def __getattribute__(self, name):
        # override class attributes '_fields' and '_fields_ordered'
        # with their instance counterparts
        if name == "_fields" and hasattr(self, "_nods_fields"):
            return self._nods_fields
        if name == "_fields_ordered" and hasattr(self, "_nods_fields_ordered"):
            return self._nods_fields_ordered
        return super(ODMNoDatasetSample, self).__getattribute__(name)

    def __setattr__(self, name, value):
        # override class attributes '_fields' and '_fields_ordered'
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
            warnings.warn(
                "Fiftyone doesn't allow fields to be "
                "created via a new attribute name",
                stacklevel=2,
            )
            return super().__setattr__(name, value)
        # @todo(Tyler) END NOT-DRY ############################################

        # @todo(Tyler) this should replace the field rather than validate
        if value is not None:
            try:
                self._fields[name].validate(value)
            except ValidationError:
                raise ValidationError(
                    "@todo(Tyler) changing a field type is"
                    " not yet supported"
                )

        result = super(ODMNoDatasetSample, self).__setattr__(name, value)
        if name in self._fields:
            # __set__() is not called because the field is not a class
            # attribute so we must explicitly call it
            field = self._fields[name]
            field.__set__(self, value)
        return result


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
        # @todo(Tyler) this code is not DRY...occurs in 3 spots :( ############
        # all attrs starting with "_" or that exist and are not fields are
        # deferred to super
        if name.startswith("_") or (
            hasattr(self, name) and name not in self.field_names
        ):
            return super().__setattr__(name, value)

        if name not in self.field_names:
            warnings.warn(
                "Fiftyone doesn't allow fields to be "
                "created via a new attribute name",
                stacklevel=2,
            )
            return super().__setattr__(name, value)
        # @todo(Tyler) END NOT-DRY ############################################

        # @todo(Tyler) does validate work when value is None?
        if value is not None:
            self._fields[name].validate(value)

        result = super(ODMDatasetSample, self).__setattr__(name, value)
        if (
            # don't save '_cls' or 'id'
            name not in ["_cls", "id"]
            # @todo(Tyler) could this be removed?
            and isinstance(getattr(self.__class__, name), BaseField)
            # don't save before it has been added to the database
            and self.in_db
        ):
            # autosave the change to existing attrs
            self.save()
        return result
