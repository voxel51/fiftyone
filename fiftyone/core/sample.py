"""
Dataset samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict, defaultdict
from copy import deepcopy
import json
import os
import weakref

from bson import json_util
from bson.binary import Binary
import numpy as np
import six

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.odm as foo

import fiftyone as fo
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou

from fiftyone.core.odm.document import SerializableDocument
from fiftyone.core.odm.sample import _generate_rand, default_sample_fields


class _Sample(SerializableDocument):
    """Base class for :class:`Sample` and :class:`SampleView`."""

    # pylint: disable=no-member
    _default_fields = foo.DatasetSampleDocument._fields
    _default_fields_ordered = default_sample_fields(include_private=True)

    def __init__(self, dataset=None):
        self._dataset = dataset
        self._doc = None

    def __dir__(self):
        return super().__dir__() + list(self.field_names)

    def __getattr__(self, name):
        try:
            return super().__getattribute__(name)
        except AttributeError:
            pass

        if isinstance(self._doc, foo.DatasetSampleDocument):
            # self._doc.get_field(name)
            if not self.has_field(name):
                raise AttributeError("Sample has no field '%s'" % name)
            return getattr(self._doc, name)

        try:
            return self._data[name]
        except Exception:
            raise AttributeError("No attribute '%s'" % name)

    def __setattr__(self, name, value):
        if name.startswith("_") or (
            hasattr(self, name) and not self.has_field(name)
        ):
            super().__setattr__(name, value)
            return

        if isinstance(self._doc, foo.DatasetSampleDocument):
            self._doc.__setattr__(name, value)
            return

        if not self.has_field(name):
            raise ValueError(
                "Adding sample fields using the `sample.field = value` syntax "
                "is not allowed; use `sample['field'] = value` instead"
            )

        self._data[name] = value

    def __delattr__(self, name):
        try:
            self.__delitem__(name)
        except KeyError:
            super().__delattr__(name)

    def __getitem__(self, key):
        try:
            return self.get_field(key)
        except AttributeError:
            raise KeyError("Sample has no field '%s'" % key)

    def __setitem__(self, key, value):
        return self.set_field(key, value=value, create=True)

    def __delitem__(self, key):
        try:
            return self.clear_field(key)
        except ValueError as e:
            raise KeyError(e.args[0])

    def __copy__(self):
        return self.copy()

    def __eq__(self, other):
        if not isinstance(other, self.__class__):
            return False

        if not isinstance(other._doc, self._doc.__class__):
            return False

        if self.in_dataset:
            return self._doc == other._doc

        return super().__eq__(other)

    @property
    def filename(self):
        """The basename of the data filepath."""
        return os.path.basename(self.filepath)

    @property
    def id(self):
        """The ID of the document, or ``None`` if it has not been added to the
        database.
        """
        return str(self._doc.id) if self._in_db else None

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        if self.in_dataset:
            return self._doc.ingest_time

        return None

    @property
    def in_dataset(self):
        """Whether the sample has been added to a dataset."""
        return self.dataset is not None

    @property
    def dataset(self):
        """The dataset to which this sample belongs, or ``None`` if it has not
        been added to a dataset.
        """
        return self._dataset

    @property
    def field_names(self):
        """An ordered tuple of the names of the fields of this sample."""
        if self.in_dataset:
            return self._doc.field_names

        return tuple(k for k in self._data.keys() if not k.startswith("_"))

    @property
    def _in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.Document` has
        been inserted into the database.
        """
        if isinstance(self._doc, foo.DatasetSampleDocument):
            return self._doc.in_db
        return False

    def has_field(self, field_name):
        """Determines whether the sample has a field of the given name.

        Args:
            field_name: the field name

        Returns:
            True/False
        """
        if self.in_dataset:
            return field_name in self.dataset._dataset_helper.fields

        try:
            return field_name in self._data
        except AttributeError:
            # If `_data` is not initialized
            return False

    def get_field(self, field_name):
        """Accesses the value of a field of the sample.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
        """
        if self.in_dataset:
            # self._doc.get_field(field_name)
            if not self.has_field(field_name):
                raise AttributeError("Sample has no field '%s'" % field_name)
            return getattr(self._doc, field_name)

        if not self.has_field(field_name):
            raise AttributeError("Sample has no field '%s'" % field_name)

        return getattr(self, field_name)

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

        if self.in_dataset:
            return self._doc.set_field(field_name, value, create=create)

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
        """Clears the value of a field of the sample.

        Args:
            field_name: the name of the field to clear

        Raises:
            ValueError: if the field does not exist
        """
        if self.in_dataset:
            return self._doc.clear_field(field_name=field_name)

        if field_name in self._default_fields:
            default_value = self._get_field_default(
                self._default_fields[field_name]
            )
            self.set_field(field_name, default_value)
        else:
            self._data.pop(field_name, None)

    def iter_fields(self):
        """Returns an iterator over the field (name, value) pairs of the
        sample.
        """
        for field_name in self.field_names:
            yield field_name, self.get_field(field_name)

    def compute_metadata(self):
        """Populates the ``metadata`` field of the sample."""
        mime_type = etau.guess_mime_type(self.filepath)
        if mime_type.startswith("image"):
            self.metadata = fom.ImageMetadata.build_for(self.filepath)
        else:
            self.metadata = fom.Metadata.build_for(self.filepath)

        self.save()

    def copy(self):
        """Returns a deep copy of the sample that has not been added to the
        database.

        Returns:
            a :class:`Sample`
        """
        kwargs = {f: deepcopy(self[f]) for f in self.field_names}
        return self.__class__(**kwargs)

    def to_dict(self):
        """Serializes the sample to a JSON dictionary.

        Sample IDs are always excluded in this representation.

        Returns:
            a JSON dict
        """
        if self.in_dataset:
            d = self._doc.to_dict(extended=True)
        else:
            d = self._to_dict(extended=True)
        return {k: v for k, v in d.items() if not k.startswith("_")}

    def to_json(self, pretty_print=False):
        """Serializes the sample to a JSON string.

        Args:
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations

        Returns:
            a JSON string
        """
        return etas.json_to_str(self.to_dict(), pretty_print=pretty_print)

    def to_mongo_dict(self):
        """Serializes the sample to a BSON dictionary equivalent to the
        representation that would be stored in the database.

        Returns:
            a BSON dict
        """
        if self.in_dataset:
            return self._doc.to_dict(extended=False)

        return self._to_dict(extended=False)

    def save(self):
        """Saves the sample to the database."""
        if self.in_dataset:
            self._doc.save()

    def reload(self):
        """Reloads the sample from the database."""
        if self.in_dataset:
            self._doc.reload()

    def _delete(self):
        """Deletes the document from the database."""
        if self.in_dataset:
            self._doc.delete()

    def _to_dict(self, extended=False):
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

    @staticmethod
    def _get_field_default(field):
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

        raise ValueError("Field '%s' has no default" % field)

    def _get_repr_fields(self):
        return ("id",) + self.field_names


class Sample(_Sample):
    """A sample in a :class:`fiftyone.core.dataset.Dataset`.

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.

    Args:
        filepath: the path to the data on disk. The path is converted to an
            absolute path (if necessary) via
            ``os.path.abspath(os.path.expanduser(filepath))``
        tags (None): a list of tags for the sample
        metadata (None): a :class:`fiftyone.core.metadata.Metadata` instance
        **kwargs: additional fields to dynamically set on the sample
    """

    # Instance references keyed by [collection_name][sample_id]
    _instances = defaultdict(weakref.WeakValueDictionary)

    def __init__(self, filepath, tags=None, metadata=None, **kwargs):
        super().__init__()

        kwargs["filepath"] = filepath
        kwargs["tags"] = tags
        kwargs["metadata"] = metadata

        self._data = OrderedDict()

        for field_name in self._default_fields_ordered:
            value = kwargs.pop(field_name, None)

            if field_name == "_rand":
                value = _generate_rand(filepath=filepath)

            if value is None:
                value = self._get_field_default(
                    self._default_fields[field_name]
                )

            if field_name == "filepath":
                value = os.path.abspath(os.path.expanduser(value))

            self._data[field_name] = value

        self._data.update(kwargs)

    @classmethod
    def from_db_doc(cls, d, dataset):
        """Creates an instance of the :class:`Sample` class backed by the given
        document.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset: the :class:`fiftyone.core.dataset.Dataset` that the sample
                belongs to

        Returns:
            a :class:`Sample`
        """

        try:
            # Get instance if exists
            sample = cls._instances[dataset._sample_collection_name][
                str(d["_id"])
            ]
        except KeyError:
            sample = cls.__new__(cls)
            sample._doc = None  # set to prevent RecursionError
            sample._dataset = None  # set to prevent RecursionError
            sample._set_backing_doc(d, dataset)

        return sample

    @classmethod
    def from_dict(cls, d):
        """Loads the sample from a JSON dictionary.

        The returned sample will not belong to a dataset.

        Returns:
            a :class:`Sample`
        """
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

    @classmethod
    def _save_dataset_samples(cls, collection_name):
        """Saves all changes to samples instances in memory belonging to the
        specified dataset to the database.

        A samples only needs to be saved if it has non-persisted changes and
        still exists in memory.

        Args:
            collection_name: the name of the MongoDB collection
        """
        for sample in cls._instances[collection_name].values():
            sample.save()

    @classmethod
    def _reload_dataset_sample(cls, collection_name, sample_id):
        """Reloads the fields for a sample instance in memory belonging to the
        specified dataset from the database.

        If the sample does not exist in memory nothing is done.

        Args:
            collection_name: the name of the MongoDB collection
            sample_id: the ID of the sample

        Returns:
            True/False whether the sample was reloaded
        """
        # @todo(Tyler) it could optimize the code to instead flag the sample as
        #   "stale", then have it reload once __getattribute__ is called
        dataset_instances = cls._instances[collection_name]
        sample = dataset_instances.get(sample_id, None)
        if sample:
            sample.reload()
            return True

        return False

    @classmethod
    def _reload_dataset_samples(cls, collection_name):
        """Reloads the fields for sample instances in memory belonging to the
        specified dataset from the database.

        If multiple processes or users are accessing the same database this
        will keep the dataset in sync.

        Args:
            collection_name: the name of the MongoDB collection
        """
        for sample in cls._instances[collection_name].values():
            sample.reload()

    @classmethod
    def _purge_field(cls, collection_name, field_name):
        """Remove any field values from samples that exist in memory.

        Args:
            collection_name: the name of the MongoDB collection
            field_name: the name of the field to purge
        """
        for sample in cls._instances[collection_name].values():
            sample._doc._data.pop(field_name, None)

    def _set_backing_doc(self, d, dataset):
        """Updates the backing doc for the sample.

        For use **only** when adding a sample to a dataset.
        """
        if self.in_dataset:
            raise TypeError("Sample already belongs to a dataset")

        # @todo(Tyler) don't even construct this!
        doc = dataset._dataset_helper.from_dict(d, extended=False)

        if not isinstance(doc, foo.DatasetSampleDocument):
            raise TypeError(
                "Backing doc must be an instance of %s; found %s"
                % (foo.DatasetSampleDocument, type(doc))
            )

        # Ensure the doc is saved to the database
        if not doc.id:
            doc.save()

        self._doc = doc

        # Save weak reference
        dataset_instances = self._instances[dataset._sample_collection_name]
        if self.id not in dataset_instances:
            dataset_instances[self.id] = self

        self._dataset = dataset

    @classmethod
    def _reset_backing_docs(cls, collection_name, sample_ids):
        """Resets the samples' backing documents to non-database samples.

        For use **only** when removing samples from a dataset.

        Args:
            collection_name: the name of the MongoDB collection
            sample_ids: a list of sample IDs
        """
        dataset_instances = cls._instances[collection_name]
        for sample_id in sample_ids:
            sample = dataset_instances.pop(sample_id, None)
            if sample is not None:
                sample._reset_backing_doc()

    @classmethod
    def _reset_all_backing_docs(cls, collection_name):
        """Resets the sample's backing document, making the sample a
        non-database sample for all samples in a dataset.

        For use **only** when clearing a dataset.

        Args:
            collection_name: the name of the MongoDB collection
        """
        if collection_name not in cls._instances:
            return

        dataset_instances = cls._instances.pop(collection_name)
        for sample in dataset_instances.values():
            sample._reset_backing_doc()

    def _reset_backing_doc(self):
        self._data = self.copy()._data
        self._doc = None
        self._dataset = None


class SampleView(_Sample):
    """A view of a sample returned by a:class:`fiftyone.core.view.DatasetView`.

    SampleViews should never be created manually, only returned by dataset
    views. Sample views differ from samples similar to how dataset views differ
    from datasets:

    -   A sample view only exposes a subset of all data for a sample
    -   If a user attempts to modify an excluded field an error is raised
    -   If a user attempts to modify a filtered field (the field itself, not
        its elements) behavior is not guaranteed

    Args:
        doc: a `dict`
        dataset: the :class:`fiftyone.core.dataset.Dataset` that the sample
            belongs to
        selected_fields (None): a set of field names that this sample view is
            restricted to
        excluded_fields (None): a set of field names that are excluded from
            this sample view
        filtered_fields (None): a set of field names of list fields that are
            filtered in this view and thus need special handling when saving
    """

    def __init__(
        self,
        d,
        dataset,
        selected_fields=None,
        excluded_fields=None,
        filtered_fields=None,
    ):
        super().__init__(dataset=dataset)

        # @todo(Tyler) don't even construct this!
        doc = dataset._dataset_helper.from_dict(d, extended=False)

        if not isinstance(doc, foo.DatasetSampleDocument):
            raise TypeError(
                "Backing doc must be an instance of %s; found %s"
                % (foo.DatasetSampleDocument, type(doc))
            )

        if not doc.id:
            raise ValueError("`doc` is not saved to the database.")

        if selected_fields is not None and excluded_fields is not None:
            selected_fields = selected_fields.difference(excluded_fields)
            excluded_fields = None

        self._doc = doc
        self._selected_fields = selected_fields
        self._excluded_fields = excluded_fields
        self._filtered_fields = filtered_fields

    def __getattr__(self, name):
        if not name.startswith("_"):
            if (
                self._selected_fields is not None
                and name not in self._selected_fields
            ):
                raise NameError(
                    "Field '%s' is not selected from this %s"
                    % (name, type(self).__name__)
                )

            if (
                self._excluded_fields is not None
                and name in self._excluded_fields
            ):
                raise NameError(
                    "Field '%s' is excluded from this %s"
                    % (name, type(self).__name__)
                )

        return super().__getattr__(name)

    @property
    def field_names(self):
        """An ordered tuple of field names of this sample.

        This may be a subset of all fields of the dataset if fields have been
        selected or excluded.
        """
        field_names = super().field_names

        if self._selected_fields is not None:
            field_names = tuple(
                fn for fn in field_names if fn in self._selected_fields
            )

        if self._excluded_fields is not None:
            field_names = tuple(
                fn for fn in field_names if fn not in self._excluded_fields
            )

        return field_names

    @property
    def selected_field_names(self):
        """The set of field names that were selected on this sample, or
        ``None`` if no fields were explicitly selected.
        """
        return self._selected_fields

    @property
    def excluded_field_names(self):
        """The set of field names that were excluded on this sample, or
        ``None`` if no fields were explicitly excluded.
        """
        return self._excluded_fields

    def copy(self):
        """Returns a deep copy of the sample that has not been added to the
        database.

        Returns:
            a :class:`Sample`
        """
        kwargs = {f: deepcopy(self[f]) for f in self.field_names}
        return Sample(**kwargs)

    def save(self):
        """Saves the sample to the database.

        Any modified fields are updated, and any in-memory :class:`Sample`
        instances of this sample are updated.
        """
        self._doc.save(filtered_fields=self._filtered_fields)

        # Reload the sample singleton if it exists in memory
        Sample._reload_dataset_sample(
            self.dataset._sample_collection_name, self.id
        )
