"""
Backing document classes for :class:`fiftyone.core.sample.Sample` instances.

Class hierarchy::

    ODMDocument
    └── ODMSample
        ├── my_custom_dataset
        ├── another_dataset
        └── ...

     NoDatasetSample is not a subclass but mirrors the behavior of ODMSample.

Design invariants:

-   a :class:`fiftyone.core.sample.Sample` always has a backing
    ``sample._doc``, which is an instance of a subclass of :class:`ODMSample`

-   a :class:`fiftyone.core.dataset.Dataset` always has a backing
    ``dataset._sample_doc_cls`` which is a subclass of ``ODMSample``.

Implementation details

When a new :class:`fiftyone.core.sample.Sample` is created, its `_doc`
attribute is an instance of `ODMNoDatasetSample`::

    import fiftyone as fo

    sample = fo.Sample()
    sample._doc  # ODMNoDatasetSample

When a new :class:`fiftyone.core.dataset.Dataset` is created, its
`_sample_doc_cls` attribute holds a dynamically created subclass of
:class:`ODMSample` whose name is the name of the dataset::

    dataset = fo.Dataset(name="my_dataset")
    dataset._sample_doc_cls  # my_dataset(ODMSample)

When a sample is added to a dataset, its `sample._doc` instance is changed from
type :class:`ODMNoDatasetSample` to type ``dataset._sample_doc_cls``::

    dataset.add_sample(sample)
    sample._doc  # my_dataset(ODMSample)

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
import json
import numbers

from bson import json_util
from bson.binary import Binary
from mongoengine.errors import InvalidQueryError
import numpy as np

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou

from .dataset import SampleField
from .document import ODMDocument, ODMEmbeddedDocument, SerializableDocument


def nodataset(func):
    """Decorator that provides a more informative error when attempting to call
    a class method on an :class:`ODMNoDatasetSample` instance that should only
    be called on individual instances.

    This is necessary because fields are shared across all samples in a dataset
    but samples outside of a dataset have their own schema.

    Examples::

            NoDatasetSample.get_field_schema     NoDatasetError
            NoDatasetSample().get_field_schema   OKAY
            ODMSample.get_field_schema       OKAY
            ODMSample().get_field_schema     OKAY
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


def no_delete_default_field(func):
    """Wrapper for :func:`ODMSample.delete_field` that prevents deleting
    default fields of :class:`ODMSample`.

    This is a decorator because the subclasses implement this as either an
    instance or class method.
    """

    def wrapper(cls_or_self, field_name, *args, **kwargs):
        # pylint: disable=no-member
        if field_name in ODMSample._fields_ordered:
            raise ValueError("Cannot delete default field '%s'" % field_name)
        return func(cls_or_self, field_name, *args, **kwargs)

    return wrapper


class ODMSample(ODMDocument):
    """Abstract base class for dataset sample classes.

    All ``fiftyone.core.dataset.Dataset._sample_doc_cls`` classes inherit from
    this class.
    """

    meta = {"abstract": True}

    # The path to the data on disk
    filepath = fof.StringField(unique=True)

    # The set of tags associated with the sample
    tags = fof.ListField(fof.StringField())

    # Metadata about the sample media
    metadata = fof.EmbeddedDocumentField(fom.Metadata, null=True)

    def __setattr__(self, name, value):
        # pylint: disable=no-member
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
        return self.__class__.__name__

    @property
    def field_names(self):
        """An ordered list of the names of the fields of this sample."""
        # pylint: disable=no-member
        return self._fields_ordered

    @classmethod
    def get_field_schema(cls, ftype=None, embedded_doc_type=None):
        """Returns a schema dictionary describing the fields of this sample.

        If the sample belongs to a dataset, the schema will apply to all
        samples in the dataset.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:`fiftyone.core.odm.ODMEmbeddedDocument`

        Returns:
             a dictionary mapping field names to field types
        """
        # pylint: disable=no-member
        if ftype is None:
            ftype = fof.Field

        if not issubclass(ftype, fof.Field):
            raise ValueError(
                "Field type %s must be subclass of %s" % (ftype, fof.Field)
            )

        if embedded_doc_type and not issubclass(
            ftype, fof.EmbeddedDocumentField
        ):
            raise ValueError(
                "embedded_doc_type should only be specified if ftype is a"
                " subclass of %s" % fof.EmbeddedDocumentField
            )

        d = OrderedDict()
        for field_name in cls._fields_ordered:
            field = cls._fields[field_name]
            if not isinstance(cls._fields[field_name], ftype):
                continue

            if embedded_doc_type and not issubclass(
                field.document_type, embedded_doc_type
            ):
                continue

            d[field_name] = field

        return d

    def has_field(self, field_name):
        """Determines whether the sample has a field of the given name.

        Args:
            field_name: the field name

        Returns:
            True/False
        """
        # pylint: disable=no-member
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

        return getattr(self, field_name)

    @classmethod
    def add_field(
        cls,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        save=True,
    ):
        """Adds a new field to the dataset.

        Args:
            field_name: the field name
            ftype: the field type to create. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.ODMEmbeddedDocument` type of the
                field. Used only when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the type of the contained field. Used only when
                ``ftype`` is a list or dict type
        """
        # Additional arg `save` is to prevent saving the fields when reloading
        # a dataset from the database.

        # pylint: disable=no-member
        if field_name in cls._fields:
            raise ValueError("Field '%s' already exists" % field_name)

        field = _create_field(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
        )

        cls._fields[field_name] = field
        cls._fields_ordered += (field_name,)
        try:
            if issubclass(cls, ODMSample):
                # Only set the attribute if it is a class
                setattr(cls, field_name, field)
        except TypeError:
            # Instance, not class, so do not `setattr`
            pass

        # @todo(Tyler) refactor to avoid local import here
        if save:
            import fiftyone.core.dataset as fod

            dataset = fod.Dataset(name=cls.__name__)

            # Update dataset meta class
            field = cls._fields[field_name]
            sample_field = SampleField.from_field(field)
            dataset._meta.sample_fields.append(sample_field)
            dataset._meta.save()

    @classmethod
    def add_implied_field(cls, field_name, value):
        """Adds the field to the sample, inferring the field type from the
        provided value.

        Args:
            field_name: the field name
            value: the field value
        """
        # pylint: disable=no-member
        if field_name in cls._fields:
            raise ValueError("Field '%s' already exists" % field_name)

        cls.add_field(field_name, **_get_implied_field_kwargs(value))

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
                msg = "Sample does not have field '%s'." % field_name
                if value is not None:
                    # don't report this when clearing a field.
                    msg += " Use `create=True` to create a new field."
                raise ValueError(msg)

        self.__setattr__(field_name, value)

    def clear_field(self, field_name):
        """Clears the value of a field of the sample.

        Args:
            field_name: the field name

        Raises:
            ValueError: if the field does not exist
        """
        self.set_field(field_name, None, create=False)

    @classmethod
    @no_delete_default_field
    def delete_field(cls, field_name):
        """Deletes the field from the dataset.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        # pylint: disable=no-member
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

        # save Dataset meta
        # @todo(Tyler) refactor to avoid local import here
        from fiftyone.core.dataset import Dataset

        dataset = Dataset(name=cls.__name__)

        # Update dataset meta class
        dataset._meta.sample_fields = [
            sf for sf in dataset._meta.sample_fields if sf.name != field_name
        ]
        dataset._meta.save()


class NoDatasetSample(SerializableDocument):
    """Backing document for samples that have not been added to a dataset."""

    # pylint: disable=no-member
    default_fields = ODMSample._fields
    default_fields_ordered = ODMSample._fields_ordered

    def __init__(self, **kwargs):
        self._data = OrderedDict()

        for field_name in self.default_fields_ordered:
            field = self.default_fields[field_name]

            value = kwargs.pop(field_name, None)

            if value is None:
                value = self._get_default(field)

            else:
                field.validate(value)

            self._data[field_name] = value

        self._data.update(kwargs)

    def to_dict(self, extended=False):
        d = {}
        for k, v in iteritems(self._data):
            if hasattr(v, "to_dict"):
                # Embedded document
                d[k] = v.to_dict(extended=extended)
            elif isinstance(v, np.ndarray):
                # Must handle arrays separately, since they are non-primitives

                # @todo cannot support serializing 1D arrays as lists because
                # there is no way for `from_dict` to know that the data should
                # be converted back to a numpy array
                #
                # if v.ndim == 1:
                #     d[k] = v.tolist()
                #

                v_binary = fou.serialize_numpy_array(v)
                if extended:
                    # @todo improve this
                    d[k] = json.loads(json_util.dumps(Binary(v_binary)))
                else:
                    d[k] = v_binary
            else:
                # JSON primitive
                d[k] = v

        return d

    @classmethod
    def from_dict(cls, d, created=False, extended=False):
        kwargs = {}
        for k, v in iteritems(d):
            if isinstance(v, dict):
                if "_cls" in v:
                    # Serialized embedded document
                    _cls = getattr(fo, v["_cls"])
                    kwargs[k] = _cls.from_dict(v)
                elif "$binary" in v:
                    # Serialized array in extended format
                    binary = json_util.loads(json.dumps(v))
                    kwargs[k] = fou.deserialize_numpy_array(binary)
                else:
                    kwargs[k] = v
            elif isinstance(v, six.binary_type):
                # Serialized array in non-extended format
                kwargs[k] = fou.deserialize_numpy_array(v)
            else:
                kwargs[k] = v

        return cls(**kwargs)

    def __getattr__(self, name):
        try:
            return self._data[name]
        except Exception:
            pass

        return super(NoDatasetSample, self).__getattribute__(name)

    def __setattr__(self, name, value):
        if name.startswith("_"):
            super(NoDatasetSample, self).__setattr__(name, value)
            return

        has_field = self.has_field(name)

        if hasattr(self, name) and not has_field:
            super(NoDatasetSample, self).__setattr__(name, value)
            return

        if not has_field:
            raise ValueError(
                "Adding sample fields using the `sample.field = value` syntax "
                "is not allowed; use `sample['field'] = value` instead"
            )

        if name in self.default_fields:
            field = self.default_fields[name]

            if value is None:
                value = self._get_default(field)
            else:
                field.validate(value)

            self._data[name] = value
        else:
            if value is None:
                self._data.pop(name, None)
            else:
                self._data[name] = value

    @property
    def dataset_name(self):
        return None

    @property
    def id(self):
        return None

    @property
    def ingest_time(self):
        return None

    @property
    def in_db(self):
        return None

    @property
    def field_names(self):
        return tuple(self._data.keys())

    @staticmethod
    def _get_default(field):
        if field.null:
            return None

        if field.default is not None:
            value = field.default

            if callable(value):
                value = value()

            if isinstance(value, list) and value.__class__ != list:
                value = list(value)
            elif isinstance(value, tuple) and value.__class__ != tuple:
                value = tuple(value)
            elif isinstance(value, dict) and value.__class__ != dict:
                value = dict(value)

            return value

        raise ValueError("Field has no default")

    @nodataset
    def get_field_schema(self, ftype=None, embedded_doc_type=None):
        if ftype is None:
            ftype = fof.Field

        if not issubclass(ftype, fof.Field):
            raise ValueError(
                "Field type %s must be subclass of %s" % (ftype, fof.Field)
            )

        if embedded_doc_type and not issubclass(
            ftype, fof.EmbeddedDocumentField
        ):
            raise ValueError(
                "embedded_doc_type should only be specified if ftype is a"
                " subclass of %s" % fof.EmbeddedDocumentField
            )

        d = OrderedDict(
            [
                (field_name, self.default_fields[field_name])
                for field_name in self.default_fields_ordered
            ]
        )

        for field_name, value in iteritems(self._data):
            if field_name in d:
                continue

            d[field_name] = _create_field(
                field_name, **_get_implied_field_kwargs(value)
            )

        for field_name, field in iteritems(d):
            if not isinstance(field, ftype):
                d.pop(field_name)

            if embedded_doc_type and not issubclass(
                field.document_type, embedded_doc_type
            ):
                d.pop(field_name)

        return d

    def has_field(self, field_name):
        try:
            return field_name in self._data
        except AttributeError:
            # if `_data` is not initialized
            return False

    def get_field(self, field_name):
        if not self.has_field(field_name):
            raise AttributeError("Sample has no field '%s'" % field_name)

        return getattr(self, field_name)

    def set_field(self, field_name, value, create=False):
        if field_name.startswith("_"):
            raise ValueError(
                "Invalid field name: '%s'. Field names cannot start with '_'"
                % field_name
            )

        if hasattr(self, field_name) and not self.has_field(field_name):
            raise ValueError("Cannot use reserved keyword '%s'" % field_name)

        if not self.has_field(field_name):
            if create:
                # dummy value so that it is identified by __setattr__
                self._data[field_name] = None
            else:
                msg = "Sample does not have field '%s'." % field_name
                if value is not None:
                    # don't report this when clearing a field.
                    msg += " Use `create=True` to create a new field."
                raise ValueError(msg)

        self.__setattr__(field_name, value)

    def clear_field(self, field_name):
        self.set_field(field_name, None)

    @nodataset
    def add_field(self, *args, **kwargs):
        raise ValueError(
            "You cannot use `add_field()` to add a field without a value to a "
            "sample that does not belong to a dataset. Use `set_field()` "
            "instead"
        )

    @nodataset
    def add_implied_field(self, field_name, value):
        self.set_field(field_name, value, create=True)

    @nodataset
    @no_delete_default_field
    def delete_field(self, field_name):
        self.clear_field(field_name)


class NoDatasetError(Exception):
    """Exception raised by ODMNoDatasetSample when trying to do something that
    only works for samples already added to a dataset.
    """

    pass


def _get_implied_field_kwargs(value):
    if isinstance(value, ODMEmbeddedDocument):
        return {
            "ftype": fof.EmbeddedDocumentField,
            "embedded_doc_type": type(value),
        }
    if isinstance(value, bool):
        return {"ftype": fof.BooleanField}
    if isinstance(value, six.integer_types):
        return {"ftype": fof.IntField}
    if isinstance(value, numbers.Number):
        return {"ftype": fof.FloatField}
    if isinstance(value, six.string_types):
        return {"ftype": fof.StringField}
    if isinstance(value, (list, tuple)):
        return {"ftype": fof.ListField}
    if isinstance(value, np.ndarray):
        if value.ndim == 1:
            return {"ftype": fof.VectorField}

        return {"ftype": fof.ArrayField}
    if isinstance(value, dict):
        return {"ftype": fof.DictField}
    raise TypeError("Unsupported field value '%s'" % type(value))


def _create_field(field_name, ftype, embedded_doc_type=None, subfield=None):
    if not issubclass(ftype, fof.Field):
        raise ValueError(
            "Invalid field type '%s'; must be a subclass of '%s'"
            % (ftype, fof.Field)
        )

    kwargs = {"db_field": field_name}

    if issubclass(ftype, fof.EmbeddedDocumentField):
        kwargs.update({"document_type": embedded_doc_type})
        kwargs["null"] = True
    elif issubclass(ftype, (fof.ListField, fof.DictField)):
        if subfield is not None:
            kwargs["field"] = subfield
    else:
        kwargs["null"] = True

    field = ftype(**kwargs)
    field.name = field_name

    return field
