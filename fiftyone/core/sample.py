"""
Dataset samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import json
import os
import weakref

from bson import json_util
from bson.binary import Binary
import numpy as np
from pymongo import ReturnDocument
import six

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.metadata as fom
import fiftyone.core.schema as fos
import fiftyone.core.utils as fou
from fiftyone.core.odm.document import SerializableDocument
from fiftyone.core.odm.sample import _generate_rand


class _Sample(SerializableDocument):
    """Base class for :class:`Sample` and :class:`SampleView`."""

    def __init__(self, dataset=None):
        self._dataset = dataset

    def __dir__(self):
        return super().__dir__() + list(self.field_names)

    def __getattr__(self, name):
        try:
            return super().__getattribute__(name)
        except AttributeError:
            return self.get_field(name)

    def __setattr__(self, name, value):
        if name.startswith("_") or (
            hasattr(self, name) and name not in self.field_names
        ):
            return super().__setattr__(name, value)

        return self.set_field(name, value, create=False)

    def __delattr__(self, name):
        try:
            self.__delitem__(name)
        except KeyError:
            super().__delattr__(name)

    def __getitem__(self, field_name):
        try:
            return self.get_field(field_name)
        except AttributeError:
            raise KeyError("Sample has no field '%s'" % field_name)

    def __setitem__(self, field_name, value):
        self.set_field(field_name, value=value)

    def __delitem__(self, field_name):
        try:
            self.clear_field(field_name)
        except ValueError as e:
            raise KeyError(e.args[0])

    def __copy__(self):
        return self.copy()

    def __eq__(self, other):
        if not isinstance(other, self.__class__):
            return False

        if self.id != other.id:
            return False

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
        return str(self._object_id) if self._object_id else None

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        return self._object_id.generation_time if self._object_id else None

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
            return self._dataset._schema.field_names

        return tuple(k for k in self._data.keys() if not k.startswith("_"))

    def get_field(self, field_name):
        """Accesses the value of a field of the sample.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
            ValueError: if the field is not set and there is no default either
        """
        try:
            return self._data[field_name]
        except KeyError:
            pass

        if self.in_dataset:
            return self.dataset._schema.get_field_default(field_name)

        if field_name in fos.DatasetSchema.default_fields:
            field = fos.DatasetSchema.default_fields[field_name]
            return field.get_default()

        raise AttributeError(
            "%s has no field '%s'" % (type(self).__name__, field_name)
        )

    def set_field(self, field_name, value, create=True):
        """Sets the value of a field of the sample.

        Args:
            field_name: the field name
            value: the field value
            create (True): whether to create the field if it does not exist

        Raises:
            ValueError: if ``field_name`` is not an allowed field name or does
                not exist and ``create == False``
        """
        if field_name.startswith("_"):
            raise ValueError(
                "Invalid field name: '%s'. Field names cannot start with '_'"
                % field_name
            )

        if hasattr(self, field_name) and field_name not in self.field_names:
            raise ValueError("Cannot use reserved keyword '%s'" % field_name)

        field_exists = field_name in self.field_names

        if not field_exists and not create:
            class_name = type(self).__name__
            msg = "%s does not have field '%s'." % (class_name, field_name)
            if value is not None:
                # don't report this when clearing a field.
                msg += (
                    " %s.set_field(..., create=True) to create"
                    " a new field." % class_name
                )
            raise ValueError(msg)

        if self.in_dataset and not field_exists:
            self.dataset._schema.add_implied_field(field_name, value)

        if value is None:
            # If setting to None and there is a default value provided for this
            # field, then set the value to the default value.
            if self.in_dataset:
                value = self.dataset._schema.get_field_default(field_name)
            elif field_name in fos.DatasetSchema.default_fields:
                field = fos.DatasetSchema.default_fields[field_name]
                value = field.get_default()

        if value is None:
            self._data.pop(field_name, None)
        else:
            self._data[field_name] = value

    def clear_field(self, field_name):
        """Clears the value of a field of the sample.

        Args:
            field_name: the name of the field to clear

        Raises:
            ValueError: if the field does not exist
        """
        return self.set_field(field_name, None, create=False)

    def iter_fields(self):
        """Returns an iterator over the ``(name, value)`` pairs of the fields
        of the sample.

        Returns:
            an iterator that emits ``(name, value)`` tuples
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

        Sample IDs and private fields are excluded in this representation.

        Returns:
            a JSON dict
        """
        d = serialize_dict(self._data, extended=True)
        return {k: v for k, v in d.items() if not k.startswith("_")}

    def to_json(self, pretty_print=False):
        """Serializes the sample to a JSON string.

        Sample IDs and private fields are excluded in this representation.

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
        return serialize_dict(self._data, extended=False)

    def validate(self):
        """Validates the contents of the sample against a dataset schema.

        Raises:
            ``mongoengine.FieldDoesNotExist``
            ``mongoengine.ValidationError``
        """
        if self.in_dataset:
            self._dataset._schema.validate(self)

    def save(self):
        """Saves the sample to the database."""
        self.validate()

        if self.in_dataset:
            # @todo(Tyler) could use an update rather than a full replace
            self._data = self._collection.find_one_and_replace(
                {"_id": self._object_id},
                self.to_mongo_dict(),
                return_document=ReturnDocument.AFTER,
            )

    def reload(self):
        """Reloads the sample from the database."""
        if self.in_dataset:
            self._data = self._collection.find_one({"_id": self._object_id})
            self.validate()

    @property
    def _object_id(self):
        """The a :class:``bson.objectid.ObjectId``, or ``None`` if it has not
        been added to the database.
        """
        if self.in_dataset:
            return self._data["_id"]
        return None

    @property
    def _data(self):
        return self.__data

    @_data.setter
    def _data(self, d):
        self.__data = deserialize_dict(d)

    @property
    def _collection(self):
        if self.in_dataset:
            return self.dataset._sample_collection
        return None

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

        default_fields = fos.DatasetSchema.default_sample_fields(
            include_private=True
        )

        for field_name in default_fields:
            value = kwargs.pop(field_name, None)

            if field_name == "_rand":
                value = _generate_rand(filepath=filepath)

            if value is None:
                field = fos.DatasetSchema.default_fields[field_name]
                value = field.get_default()

            if field_name == "filepath":
                value = os.path.abspath(os.path.expanduser(value))

            kwargs[field_name] = value

        self._data = kwargs

    @classmethod
    def from_support(cls, data, dataset):
        """Creates an instance of the :class:`Sample` class backed by the given
        support.

        Args:
            data: the dict backing this document
            dataset: the :class:`fiftyone.core.dataset.Dataset` that the sample
                belongs to

        Returns:
            a :class:`Sample`
        """

        try:
            # Get instance if exists
            sample = cls._instances[dataset._sample_collection_name][
                str(data["_id"])
            ]
        except KeyError:
            sample = cls.__new__(cls)
            sample._dataset = None  # set to prevent RecursionError
            sample._set_support(data, dataset)

        return sample

    @classmethod
    def from_sample_view(cls, sample_view):
        """Creates an instance of the :class:`Sample` class backed by the given
        support.

        Args:
            data: the dict backing this document
            dataset: the :class:`fiftyone.core.dataset.Dataset` that the sample
                belongs to

        Returns:
            a :class:`Sample`
        """
        if (
            sample_view.selected_field_names
            or sample_view.excluded_field_names
            or sample_view.filtered_field_names
        ):
            raise ValueError(
                "%s can only be constructed from a SampleView that does not"
                " exclude or restrict fields." % cls.__name__
            )

        try:
            # Get instance if exists
            collection_name = sample_view.dataset._sample_collection_name
            sample = cls._instances[collection_name][sample_view.id]
        except KeyError:
            sample = cls.__new__(cls)
            sample._dataset = None  # set to prevent RecursionError
            sample._set_support(sample_view._data, sample_view.dataset)

        return sample

    @classmethod
    def from_dict(cls, d):
        """Loads the sample from a JSON dictionary.

        The returned sample will not belong to a dataset.

        Returns:
            a :class:`Sample`
        """
        return cls(**deserialize_dict(d))

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
        # @todo it could optimize the code to instead flag the sample as
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
            sample._data.pop(field_name, None)

    def _set_support(self, data, dataset):
        """Updates the backing support for the sample.

        For use **only** when adding a sample to a dataset.
        """
        if self.in_dataset:
            raise TypeError("Sample already belongs to a dataset")

        self._data = data
        self._dataset = dataset

        # Save weak reference
        dataset_instances = self._instances[dataset._sample_collection_name]
        if self.id not in dataset_instances:
            dataset_instances[self.id] = self

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
        data: a `dict`
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
        data,
        dataset,
        selected_fields=None,
        excluded_fields=None,
        filtered_fields=None,
    ):
        super().__init__(dataset=dataset)

        self._data = data

        if selected_fields is not None and excluded_fields is not None:
            selected_fields = selected_fields.difference(excluded_fields)
            excluded_fields = None
        self._selected_fields = selected_fields
        self._excluded_fields = excluded_fields
        self._filtered_fields = filtered_fields

        super().__init__(dataset=dataset)

    def __str__(self):
        return repr(self)

    def __getattr__(self, name):
        if not name.startswith("_"):
            if (
                self._selected_fields is not None
                and name not in self._selected_fields
            ):
                raise AttributeError(
                    "Field '%s' is not selected from this %s"
                    % (name, type(self).__name__)
                )

            if (
                self._excluded_fields is not None
                and name in self._excluded_fields
            ):
                raise AttributeError(
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

    @property
    def filtered_field_names(self):
        """The set of field names that were filtered on this sample, or
        ``None`` if no fields were filtered.
        """
        return self._filtered_fields

    def get_field(self, field_name):
        if (
            self._selected_fields is not None
            and field_name not in self._selected_fields
        ):
            raise NameError(
                "Field '%s' is not selected from this %s"
                % (field_name, type(self).__name__)
            )

        if (
            self._excluded_fields is not None
            and field_name in self._excluded_fields
        ):
            raise NameError(
                "Field '%s' is excluded from this %s"
                % (field_name, type(self).__name__)
            )

        return super().get_field(field_name)

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
        self.validate()

        select_dict = {"_id": self._object_id}
        set_dict = self.to_mongo_dict()
        unset_dict = {k: True for k in self.field_names if k not in set_dict}

        # @todo(Tyler) this isn't the best solution...it always updates each
        #   detection in a separate update, and doesn't track added/removed
        #   detections or other similar cases
        for filtered_field in self._filtered_fields:
            # example: "my_detections", "detections"
            base_field_name, embed_list_field_name = filtered_field.split(".")

            set_dict.pop(base_field_name, None)
            value = self[base_field_name]
            if value is None:
                continue

            for item in getattr(value, embed_list_field_name):
                self._collection.update_one(
                    select_dict,
                    {
                        "$set": {
                            "%s.$[element]" % filtered_field: item.to_dict()
                        }
                    },
                    array_filters=[{"element._id": item._id}],
                    upsert=True,
                )

        update_dict = {}
        if set_dict:
            update_dict["$set"] = set_dict
        if unset_dict:
            update_dict["$unset"] = unset_dict

        self._data = self._collection.find_one_and_update(
            select_dict, update_dict, return_document=ReturnDocument.AFTER
        )

        # Reload the sample singleton if it exists in memory
        Sample._reload_dataset_sample(
            self.dataset._sample_collection_name, self.id
        )


def serialize_dict(d, extended=False):
    """Serializes the serializable elements of the given dict.

    Args:
        d: a dictionary
        extended (False): whether the input dictionary may contain
            serialized extended JSON constructs

    Returns:
        a dictionary
    """
    sd = {}
    for k, v in d.items():
        if hasattr(v, "to_dict"):
            # Embedded document
            sd[k] = v.to_dict(extended=extended)
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
                sd[k] = json.loads(json_util.dumps(Binary(v_binary)))
            else:
                sd[k] = v_binary
        else:
            # JSON primitive
            sd[k] = v

    return sd


def deserialize_dict(d):
    """De-serializes the serializable elements of the given dict.

    Args:
        d: a dictionary

    Returns:
        a dictionary
    """
    dd = {}
    for k, v in d.items():
        if isinstance(v, dict):
            if "_cls" in v:
                # Serialized embedded document
                _cls = getattr(fo, v["_cls"])
                dd[k] = _cls.from_dict(v)
            elif "$binary" in v:
                # Serialized array in extended format
                binary = json_util.loads(json.dumps(v))
                dd[k] = fou.deserialize_numpy_array(binary)
            else:
                dd[k] = v
        elif isinstance(v, six.binary_type):
            # Serialized array in non-extended format
            dd[k] = fou.deserialize_numpy_array(v)
        else:
            dd[k] = v

    return dd
