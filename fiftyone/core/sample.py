"""
Dataset samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import os
import six
import weakref

import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.fields as fof
import fiftyone.core.frame_utils as fofu
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.odm as foo


class _Sample(object):
    """Base class for :class:`Sample` and :class:`SampleView`."""

    def __init__(self, dataset=None):
        self._dataset = dataset

    def __dir__(self):
        return super().__dir__() + list(self.field_names)

    def __getattr__(self, name):
        try:
            return super().__getattribute__(name)
        except AttributeError:
            return self._doc.get_field(name)

    def __setattr__(self, name, value):
        if name.startswith("_") or (
            hasattr(self, name) and not self._doc.has_field(name)
        ):
            super().__setattr__(name, value)
        else:
            self._secure_media(name, value)
            self._doc.__setattr__(name, value)

    def __delattr__(self, name):
        try:
            self.__delitem__(name)
        except KeyError:
            super().__delattr__(name)

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

        return self._doc == other._doc

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
        return self._doc.ingest_time

    @property
    def field_names(self):
        """An ordered tuple of the names of the fields of this sample."""
        return self._doc.field_names

    @property
    def _in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.Document` has
        been inserted into the database.
        """
        return self._doc.in_db

    def get_field(self, field_name):
        """Accesses the value of a field of the sample.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
        """
        return self._doc.get_field(field_name)

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

        self._doc.set_field(field_name, value, create=create)

    def update_fields(self, fields_dict, create=True):
        """Sets the dictionary of fields on the sample.

        Args:
            fields_dict: a dict mapping field names to values
            create (True): whether to create fields if they do not exist
        """
        for field_name, value in fields_dict.items():
            self.set_field(field_name, value, create=create)

    def clear_field(self, field_name):
        """Clears the value of a field of the sample.

        Args:
            field_name: the name of the field to clear

        Raises:
            ValueError: if the field does not exist
        """
        self._doc.clear_field(field_name=field_name)

    def iter_fields(self):
        """Returns an iterator over the ``(name, value)`` pairs of the fields
        of the sample.

        Returns:
            an iterator that emits ``(name, value)`` tuples
        """
        for field_name in self.field_names:
            yield field_name, self.get_field(field_name)

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
        d = self._doc.to_dict(extended=True)
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
        return self._doc.to_dict(extended=False)

    def save(self):
        """Saves the sample to the database."""
        self._doc.save()

    def reload(self):
        """Reloads the sample from the database."""
        self._doc.reload()

    def _delete(self):
        """Deletes the document from the database."""
        self._doc.delete()

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


class FrameSample(_Sample):
    # Instance references keyed by [collection_name][sample_id]
    _instances = defaultdict(weakref.WeakValueDictionary)

    def __init__(self, **kwargs):
        self._doc = foo.NoDatasetFrameSampleDocument(**kwargs)
        super().__init__()

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return self._doc.fancy_repr(class_name=self.__class__.__name__)

    def __getitem__(self, field_name):
        try:
            return self.get_field(field_name)
        except AttributeError:
            raise KeyError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

    def __setitem__(self, field_name, value):
        self.set_field(field_name, value=value)

    @classmethod
    def from_doc(cls, doc, dataset=None):
        """Creates an instance of the :class:`Sample` class backed by the given
        document.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset: the :class:`fiftyone.core.dataset.Dataset` that the sample
                belongs to

        Returns:
            a :class:`Sample`
        """
        if isinstance(doc, foo.NoDatasetFrameSampleDocument):
            sample = cls.__new__(cls)
            sample._dataset = None
            sample._doc = doc
            return sample

        if not doc.id:
            raise ValueError("`doc` is not saved to the database.")

        try:
            # Get instance if exists
            sample = cls._instances[doc.collection_name][str(doc.id)]
        except KeyError:
            sample = cls.__new__(cls)
            sample._doc = None  # set to prevent RecursionError
            if dataset is None:
                raise ValueError(
                    "`dataset` arg must be provided if sample is in a dataset"
                )
            sample._set_backing_doc(doc, dataset=dataset)

        return sample


class _DatasetSample(_Sample):
    def __getitem__(self, field_name):
        if fofu.is_frame_number(field_name):
            if self.media_type == "video":
                return self.frames[field_name]
            raise KeyError("only str's allowed")
        try:
            return self.get_field(field_name)
        except AttributeError:
            raise KeyError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

    def __setitem__(self, field_name, value):
        if fofu.is_frame_number(field_name):
            if self.media_type == "video":
                self.frames[field_name] = value
                return
            raise KeyError("only str's allowed")
        self._secure_media(field_name, value)
        self.set_field(field_name, value=value)

    @property
    def filename(self):
        """The basename of the data filepath."""
        return os.path.basename(self.filepath)

    def compute_metadata(self):
        """Populates the ``metadata`` field of the sample."""
        mime_type = etau.guess_mime_type(self.filepath)
        if mime_type.startswith("image"):
            self.metadata = fom.ImageMetadata.build_for(self.filepath)
        else:
            self.metadata = fom.Metadata.build_for(self.filepath)

        self.save()

    def _secure_media(self, field_name, value):
        if field_name == "media_type" and self.media_type != value:
            raise fomm.MediaTypeError(
                "media_type cannot be modified. It is derived from the file type"
            )

        if field_name == "filepath":
            value = os.path.abspath(os.path.expanduser(value))
            # pylint: disable=no-member
            if self.media_type != fomm.get_media_type(value):
                raise fomm.MediaTypeError(
                    "A sample's filepath can be changed, but its media_type cannot"
                )

        if value is not None:
            # pylint: disable=no-member
            try:
                frame_doc_cls = self._dataset._frame_doc_cls
            except:
                frame_doc_cls = None
            fomm.validate_field_against_media_type(
                self.media_type,
                **foo.get_implied_field_kwargs(frame_doc_cls, value)
            )


class Sample(_DatasetSample):
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
        self._doc = foo.NoDatasetSampleDocument(
            filepath=filepath, tags=tags, metadata=metadata, **kwargs
        )
        super().__init__()

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return self._doc.fancy_repr(class_name=self.__class__.__name__)

    @classmethod
    def from_doc(cls, doc, dataset=None):
        """Creates an instance of the :class:`Sample` class backed by the given
        document.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset: the :class:`fiftyone.core.dataset.Dataset` that the sample
                belongs to

        Returns:
            a :class:`Sample`
        """
        if isinstance(doc, foo.NoDatasetSampleDocument):
            sample = cls.__new__(cls)
            sample._dataset = None
            sample._doc = doc
            return sample

        if not doc.id:
            raise ValueError("`doc` is not saved to the database.")

        try:
            # Get instance if exists
            sample = cls._instances[doc.collection_name][str(doc.id)]
        except KeyError:
            sample = cls.__new__(cls)
            sample._doc = None  # set to prevent RecursionError
            if dataset is None:
                raise ValueError(
                    "`dataset` arg must be provided if sample is in a dataset"
                )
            sample._set_backing_doc(doc, dataset=dataset)

        return sample

    @classmethod
    def from_dict(cls, d):
        """Loads the sample from a JSON dictionary.

        The returned sample will not belong to a dataset.

        Returns:
            a :class:`Sample`
        """
        doc = foo.NoDatasetSampleDocument.from_dict(d, extended=True)
        return cls.from_doc(doc)

    @classmethod
    def from_json(cls, s):
        """Loads the sample from a JSON string.

        Args:
            s: the JSON string

        Returns:
            a :class:`Sample`
        """
        doc = foo.NoDatasetSampleDocument.from_json(s)
        return cls.from_doc(doc)

    @classmethod
    def _save_dataset_samples(cls, collection_name):
        """Saves all changes to in-memory sample instances that belong to the
        specified collection.

        Args:
            collection_name: the name of the MongoDB collection
        """
        for sample in cls._instances[collection_name].values():
            sample.save()

    @classmethod
    def _reload_dataset_sample(cls, collection_name, sample_id):
        """Reloads the fields for the in-memory sample instance that belong to
        the specified collection.

        If the sample does not exist in-memory, nothing is done.

        Args:
            collection_name: the name of the MongoDB collection
            sample_id: the sample ID

        Returns:
            True/False whether the sample was reloaded
        """
        dataset_instances = cls._instances[collection_name]
        sample = dataset_instances.get(sample_id, None)
        if sample:
            sample.reload()
            return True

        return False

    @classmethod
    def _reload_dataset_samples(cls, collection_name):
        """Reloads the fields for in-memory sample instances that belong to the
        specified collection.

        Args:
            collection_name: the name of the MongoDB collection
        """
        for sample in cls._instances[collection_name].values():
            sample.reload()

    @classmethod
    def _rename_field(cls, collection_name, field_name, new_field_name):
        """Renames any field values for in-memory sample instances that belong
        to the specified collection.

        Args:
            collection_name: the name of the MongoDB collection
            field_name: the name of the field to rename
            new_field_name: the new field name
        """
        for sample in cls._instances[collection_name].values():
            data = sample._doc._data
            data[new_field_name] = data.pop(field_name, None)

    @classmethod
    def _purge_field(cls, collection_name, field_name):
        """Removes values for the given field from all in-memory sample
        instances that belong to the specified collection.

        Args:
            collection_name: the name of the MongoDB collection
            field_name: the name of the field to purge
        """
        for sample in cls._instances[collection_name].values():
            sample._doc._data.pop(field_name, None)

    def _set_backing_doc(self, doc, dataset=None):
        """Sets the backing doc for the sample.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset (None): the :class:`fiftyone.core.dataset.Dataset` to which
                the sample belongs, if any
        """
        if isinstance(self._doc, foo.DatasetSampleDocument):
            raise TypeError("Sample already belongs to a dataset")

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
        dataset_instances = self._instances[doc.collection_name]
        if self.id not in dataset_instances:
            dataset_instances[self.id] = self

        self._dataset = dataset

    @classmethod
    def _reset_backing_docs(cls, collection_name, sample_ids):
        """Resets the samples' backing documents to
        :class:`fiftyone.core.odm.NoDatasetSampleDocument` instances.

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
        """Resets the sample's backing document to a
        :class:`fiftyone.core.odm.NoDatasetSampleDocument` instance for all
        samples in the specified collection.

        Args:
            collection_name: the name of the MongoDB collection
        """
        if collection_name not in cls._instances:
            return

        dataset_instances = cls._instances.pop(collection_name)
        for sample in dataset_instances.values():
            sample._reset_backing_doc()

    def _reset_backing_doc(self):
        self._doc = self.copy()._doc
        self._dataset = None


class SampleView(_DatasetSample):
    """A view of a sample returned by a:class:`fiftyone.core.view.DatasetView`.

    SampleViews should never be created manually, only returned by dataset
    views. Sample views differ from samples similar to how dataset views differ
    from datasets:

    -   A sample view only exposes a subset of all data for a sample
    -   If a user attempts to modify an excluded field an error is raised
    -   If a user attempts to modify a filtered field (the field itself, not
        its elements) behavior is not guaranteed

    Args:
        doc: a :class:`fiftyone.core.odm.DatasetSampleDocument`
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
        doc,
        dataset,
        selected_fields=None,
        excluded_fields=None,
        filtered_fields=None,
    ):
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

        super().__init__(dataset=dataset)

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return self._doc.fancy_repr(
            class_name=self.__class__.__name__,
            select_fields=self._selected_fields,
            exclude_fields=self._excluded_fields,
        )

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
        field_names = self._doc.field_names

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
