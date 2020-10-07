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
import fiftyone.core.frame as fofr
import fiftyone.core.frame_utils as fofu
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.odm as foo
from fiftyone.core._sample import _Sample


class _DatasetSample(_Sample):
    def __getattr__(self, name):
        if name == "frames" and self.media_type == fomm.VIDEO:
            return self._frames._serve(self)

        return super().__getattr__(name)

    def __getitem__(self, field_name):
        if fofu.is_frame_number(field_name) and self.media_type == fomm.VIDEO:
            return self.frames[field_name]

        if field_name == "frames" and self.media_type == fomm.VIDEO:
            return self._frames._serve(self)

        try:
            return self.get_field(field_name)
        except AttributeError:
            raise KeyError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

    def __setitem__(self, field_name, value):
        if fofu.is_frame_number(field_name) and self.media_type == fomm.VIDEO:
            self.frames[field_name] = value
            return

        self._secure_media(field_name, value)
        self.set_field(field_name, value=value)

    @property
    def filename(self):
        """The basename of the data filepath."""
        return os.path.basename(self.filepath)

    def compute_metadata(self):
        """Populates the ``metadata`` field of the sample."""
        if self.media_type == fomm.IMAGE:
            self.metadata = fom.ImageMetadata.build_for(self.filepath)
        elif self.media_type == fomm.VIDEO:
            self.metadata = fom.VideoMetadata.build_for(self.filepath)
        else:
            self.metadata = fom.Metadata.build_for(self.filepath)

        self.save()

    def _secure_media(self, field_name, value):
        if field_name == "media_type" and value != self.media_type:
            raise fomm.MediaTypeError(
                "Cannot modify 'media_type' field; it is automatically "
                "derived from the 'filepath' of the sample"
            )

        if field_name == "filepath":
            value = os.path.abspath(os.path.expanduser(value))
            # pylint: disable=no-member
            new_media_type = fomm.get_media_type(value)
            if self.media_type != new_media_type:
                raise fomm.MediaTypeError(
                    "A sample's 'filepath' can be changed, but its media type "
                    "cannot; current '%s', new '%s'"
                    % (self.media_type, new_media_type)
                )

        if value is not None:
            # pylint: disable=no-member
            try:
                frame_doc_cls = self._dataset._frame_doc_cls
            except:
                frame_doc_cls = None

            fomm.validate_field_against_media_type(
                self.media_type,
                **foo.get_implied_field_kwargs(
                    value, frame_doc_cls=frame_doc_cls
                ),
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
        if self.media_type == fomm.VIDEO:
            self._frames = fofr.Frames()

        super().__init__()

    def __str__(self):
        return repr(self)

    def __repr__(self):
        kwargs = {}
        if self.media_type == fomm.VIDEO:
            kwargs["frames"] = self._frames._serve(self).__repr__()

        return self._doc.fancy_repr(
            class_name=self.__class__.__name__, **kwargs
        )

    def __iter__(self):
        if self.media_type == fomm.VIDEO:
            return self._frames._serve(self).__iter__()

        raise StopIteration

    def copy(self):
        """Returns a deep copy of the sample that has not been added to the
        database.

        Returns:
            a :class:`Sample`
        """
        video = self.media_type == fomm.VIDEO
        kwargs = {
            f: deepcopy(self[f])
            for f in self.field_names
            if f != "frames" or not video
        }
        if video:
            kwargs["frames"] = {
                str(k): v.copy()._doc for k, v in self.frames.items()
            }

        return self.__class__(**kwargs)

    @classmethod
    def from_doc(cls, doc, dataset=None):
        """Creates an instance of the :class:`Sample` class backed by the given
        document.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset (None): the :class:`fiftyone.core.dataset.Dataset` that
                the sample belongs to

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
                    "`dataset` arg must be provided for samples in datasets"
                )

            sample._set_backing_doc(doc, dataset=dataset)

        if sample.media_type == fomm.VIDEO:
            sample._frames = fofr.Frames()

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

    def save(self):
        """Saves the sample to the database."""
        if self.media_type == fomm.VIDEO:
            for frame in self.frames.values():
                frame.save()  # @todo batch
        super().save()


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

        if self.media_type == fomm.VIDEO:
            self._frames = fofr.Frames()

        super().__init__(dataset=dataset)

    def __str__(self):
        return repr(self)

    def __repr__(self):
        kwargs = {}
        if self.media_type == fomm.VIDEO:
            kwargs["frames"] = self._frames._serve(self).__repr__()

        return self._doc.fancy_repr(
            class_name=self.__class__.__name__,
            select_fields=self._selected_fields,
            exclude_fields=self._excluded_fields,
            **kwargs,
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
        skip_frames = self.media_type == fomm.VIDEO
        kwargs = {f: deepcopy(self[f]) for f in self.field_names}
        return Sample(**kwargs)

    def save(self):
        """Saves the sample to the database.

        Any modified fields are updated, and any in-memory :class:`Sample`
        instances of this sample are updated.
        """
        if self.media_type == fomm.VIDEO:
            for frame in self.frames.values():
                frame.save()  # @todo batch

        self._doc.save(filtered_fields=self._filtered_fields)

        # Reload the sample singleton if it exists in memory
        Sample._reload_dataset_sample(
            self.dataset._sample_collection_name, self.id
        )
