"""
Backing document classes for :class:`fiftyone.core.sample.Sample` instances.

Class hierarchy::

    ODMSample
    ├── ODMNoDatasetSample
    └── ODMDatasetSample
        ├── my_custom_dataset
        ├── another_dataset
        └── ...

Design invariants:

-   a :class:`fiftyone.core.sample.Sample` always has a backing
    ``sample._doc``, which is an instance of a subclass of :class:`ODMSample`

-   a :class:`fiftyone.core.dataset.Dataset` always has a backing
    ``dataset._sample_doc_cls`` which is a subclass of
    :class:`ODMDatasetSample``.

**Implementation details**

When a new :class:`fiftyone.core.sample.Sample` is created, its ``_doc``
attribute is an instance of :class:`ODMNoDatasetSample`::

    import fiftyone as fo

    sample = fo.Sample()
    sample._doc  # ODMNoDatasetSample

When a new :class:`fiftyone.core.dataset.Dataset` is created, its
``_sample_doc_cls`` attribute holds a dynamically created subclass of
:class:`ODMDatasetSample` whose name is the name of the dataset::

    dataset = fo.Dataset(name="my_dataset")
    dataset._sample_doc_cls  # my_dataset(ODMDatasetSample)

When a sample is added to a dataset, its ``_doc`` attribute is changed from
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
import six

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from collections import OrderedDict
from functools import wraps
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


def no_delete_default_field(func):
    """Wrapper for :func:`ODMSample.delete_field` that prevents deleting
    default fields of :class:`ODMSample`.

    This is a decorator because the subclasses implement this as either an
    instance or class method.
    """

    @wraps(func)
    def wrapper(cls_or_self, field_name, *args, **kwargs):
        # pylint: disable=no-member
        if field_name in ODMDatasetSample._fields_ordered:
            raise ValueError("Cannot delete default field '%s'" % field_name)

        return func(cls_or_self, field_name, *args, **kwargs)

    return wrapper


class ODMSample(SerializableDocument):
    """Interface for all sample backing documents."""

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs, or ``None`` if
        it has not been added to a dataset.
        """
        return None

    @property
    def in_db(self):
        """Whether the sample has been added to the database."""
        return False

    @property
    def ingest_time(self):
        """The time the sample was added to the database, or ``None`` if it
        has not been added to the database.
        """
        return None

    def has_field(self, field_name):
        """Determines whether the sample has a field of the given name.

        Args:
            field_name: the field name

        Returns:
            True/False
        """
        raise NotImplementedError("Subclass must implement `has_field()`")

    def get_field(self, field_name):
        """Gets the field of the sample.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
        """
        raise NotImplementedError("Subclass must implement `get_field()`")

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
        raise NotImplementedError("Subclass must implement `set_field()`")

    def clear_field(self, field_name):
        """Clears the value of a field of the sample.

        Args:
            field_name: the field name

        Raises:
            ValueError: if the field does not exist
        """
        raise NotImplementedError("Subclass must implement `clear_field()`")

    def _to_str_dict(self, for_repr=False):
        d = {"dataset_name": self.dataset_name}
        d.update(super(ODMSample, self)._to_str_dict(for_repr=for_repr))
        return d

    @classmethod
    def _get_class_repr(cls):
        return "Sample"


class ODMDatasetSample(ODMDocument, ODMSample):
    """Base class for sample documents backing samples in datasets.

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
            super(ODMDatasetSample, self).__setattr__(name, value)
            return

        if not has_field:
            raise ValueError(
                "Adding sample fields using the `sample.field = value` syntax "
                "is not allowed; use `sample['field'] = value` instead"
            )

        if value is not None:
            self._fields[name].validate(value)

        super(ODMDatasetSample, self).__setattr__(name, value)

    @property
    def dataset_name(self):
        return self.__class__.__name__

    @property
    def field_names(self):
        # pylint: disable=no-member
        return tuple(f for f in self._fields_ordered if f != "id")

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
            # pylint: disable=no-member
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
        # pylint: disable=no-member
        return field_name in self._fields

    def get_field(self, field_name):
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
        """Adds a new field to the sample.

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
            if issubclass(cls, ODMDatasetSample):
                # Only set the attribute if it is a class
                setattr(cls, field_name, field)
        except TypeError:
            # Instance, not class, so do not `setattr`
            pass

        if save:
            # Update dataset meta class
            # @todo(Tyler) refactor to avoid local import here
            import fiftyone.core.dataset as fod

            dataset = fod.load_dataset(cls.__name__)
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
        self.set_field(field_name, None, create=False)

    @classmethod
    @no_delete_default_field
    def delete_field(cls, field_name):
        """Deletes the field from the sample.

        If the sample is in a dataset, the field will be removed from all
        samples in the dataset.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        try:
            # Delete from all samples
            # pylint: disable=no-member
            cls.objects.update(**{"unset__%s" % field_name: None})
        except InvalidQueryError:
            raise AttributeError("Sample has no field '%s'" % field_name)

        # Remove from dataset
        # pylint: disable=no-member
        del cls._fields[field_name]
        cls._fields_ordered = tuple(
            fn for fn in cls._fields_ordered if fn != field_name
        )
        delattr(cls, field_name)

        # Update dataset meta class
        # @todo(Tyler) refactor to avoid local import here
        import fiftyone.core.dataset as fod

        dataset = fod.load_dataset(cls.__name__)
        dataset._meta.sample_fields = [
            sf for sf in dataset._meta.sample_fields if sf.name != field_name
        ]
        dataset._meta.save()


class ODMNoDatasetSample(ODMSample):
    """Backing document for samples that have not been added to a dataset."""

    # pylint: disable=no-member
    default_fields = ODMDatasetSample._fields
    default_fields_ordered = ODMDatasetSample._fields_ordered

    def __init__(self, **kwargs):
        self._data = OrderedDict()

        for field_name in self.default_fields_ordered:

            value = kwargs.pop(field_name, None)

            if value is None:
                value = self._get_default(self.default_fields[field_name])

            self._data[field_name] = value

        self._data.update(kwargs)

    def __getattr__(self, name):
        try:
            return self._data[name]
        except Exception:
            pass

        return super(ODMNoDatasetSample, self).__getattribute__(name)

    def __setattr__(self, name, value):
        if name.startswith("_"):
            super(ODMNoDatasetSample, self).__setattr__(name, value)
            return

        has_field = self.has_field(name)

        if hasattr(self, name) and not has_field:
            super(ODMNoDatasetSample, self).__setattr__(name, value)
            return

        if not has_field:
            raise ValueError(
                "Adding sample fields using the `sample.field = value` syntax "
                "is not allowed; use `sample['field'] = value` instead"
            )

        self._data[name] = value

    @property
    def id(self):
        return None

    @property
    def _to_str_fields(self):
        return ("id",) + self.field_names

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
        if field_name in self.default_fields:
            default_value = self._get_default(self.default_fields[field_name])
            self.set_field(field_name, default_value)
        else:
            self._data.pop(field_name, None)

    def to_dict(self, extended=False):
        d = {}
        for k, v in self._data.items():
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
    def from_dict(cls, d, extended=False):
        kwargs = {}
        for k, v in d.items():
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

    def save(self):
        """Saves the sample to the database.

        Because the sample does not belong to a dataset, this method does
        nothing.
        """
        pass

    def reload(self):
        """Reloads the sample from the database.

        Because the sample does not belong to a dataset, this method does
        nothing.
        """
        pass

    def delete(self):
        """Deletes the sample from the database.

        Because the sample does not belong to a dataset, this method does
        nothing.
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
