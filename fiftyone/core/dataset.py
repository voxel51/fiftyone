"""
FiftyOne datasets.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
from datetime import datetime
import fnmatch
import logging
import numbers
import os
import random
import string

from bson import ObjectId
from deprecated import deprecated
import mongoengine.errors as moe
import numpy as np
from pymongo import InsertOne, ReplaceOne, UpdateMany, UpdateOne
from pymongo.errors import CursorNotFound, BulkWriteError

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.core.annotation as foan
import fiftyone.core.brain as fob
import fiftyone.constants as focn
import fiftyone.core.collections as foc
import fiftyone.core.evaluation as foe
import fiftyone.core.fields as fof
import fiftyone.core.frame as fofr
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.migrations as fomi
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
from fiftyone.core.singletons import DatasetSingleton
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

fost = fou.lazy_import("fiftyone.core.stages")
foud = fou.lazy_import("fiftyone.utils.data")


logger = logging.getLogger(__name__)


def list_datasets(info=False):
    """Lists the available FiftyOne datasets.

    Args:
        info (False): whether to return info dicts describing each dataset
            rather than just their names

    Returns:
        a list of dataset names or info dicts
    """
    if info:
        return _list_dataset_info()

    return _list_datasets()


def dataset_exists(name):
    """Checks if the dataset exists.

    Args:
        name: the name of the dataset

    Returns:
        True/False
    """
    conn = foo.get_db_conn()
    return bool(list(conn.datasets.find({"name": name}, {"_id": 1}).limit(1)))


def load_dataset(name):
    """Loads the FiftyOne dataset with the given name.

    To create a new dataset, use the :class:`Dataset` constructor.

    .. note::

        :class:`Dataset` instances are singletons keyed by their name, so all
        calls to this method with a given dataset ``name`` in a program will
        return the same object.

    Args:
        name: the name of the dataset

    Returns:
        a :class:`Dataset`
    """
    return Dataset(name, _create=False)


def get_default_dataset_name():
    """Returns a default dataset name based on the current time.

    Returns:
        a dataset name
    """
    now = datetime.now()
    name = now.strftime("%Y.%m.%d.%H.%M.%S")
    if name in _list_datasets(include_private=True):
        name = now.strftime("%Y.%m.%d.%H.%M.%S.%f")

    return name


def make_unique_dataset_name(root):
    """Makes a unique dataset name with the given root name.

    Args:
        root: the root name for the dataset

    Returns:
        the dataset name
    """
    name = root
    dataset_names = _list_datasets(include_private=True)

    if name in dataset_names:
        name += "_" + _get_random_characters(6)

    while name in dataset_names:
        name += _get_random_characters(1)

    return name


def get_default_dataset_dir(name):
    """Returns the default dataset directory for the dataset with the given
    name.

    Args:
        name: the dataset name

    Returns:
        the default directory for the dataset
    """
    return os.path.join(fo.config.default_dataset_dir, name)


def delete_dataset(name, verbose=False):
    """Deletes the FiftyOne dataset with the given name.

    Args:
        name: the name of the dataset
        verbose (False): whether to log the name of the deleted dataset
    """
    dataset = load_dataset(name)
    dataset.delete()
    if verbose:
        logger.info("Dataset '%s' deleted", name)


def delete_datasets(glob_patt, verbose=False):
    """Deletes all FiftyOne datasets whose names match the given glob pattern.

    Args:
        glob_patt: a glob pattern of datasets to delete
        verbose (False): whether to log the names of deleted datasets
    """
    all_datasets = _list_datasets()
    for name in fnmatch.filter(all_datasets, glob_patt):
        delete_dataset(name, verbose=verbose)


def delete_non_persistent_datasets(verbose=False):
    """Deletes all non-persistent datasets.

    Args:
        verbose (False): whether to log the names of deleted datasets
    """
    for name in _list_datasets(include_private=True):
        try:
            dataset = Dataset(name, _create=False, _virtual=True)
        except:
            # If the dataset can't be loaded, it likely requires migration,
            # which means it is persistent, so we don't worry about it here
            continue

        if not dataset.persistent and not dataset.deleted:
            dataset.delete()
            if verbose:
                logger.info("Dataset '%s' deleted", name)


class Dataset(foc.SampleCollection, metaclass=DatasetSingleton):
    """A FiftyOne dataset.

    Datasets represent an ordered collection of
    :class:`fiftyone.core.sample.Sample` instances that describe a particular
    type of raw media (e.g., images or videos) together with a user-defined set
    of fields.

    FiftyOne datasets ingest and store the labels for all samples internally;
    raw media is stored on disk and the dataset provides paths to the data.

    See :ref:`this page <using-datasets>` for an overview of working with
    FiftyOne datasets.

    Args:
        name (None): the name of the dataset. By default,
            :func:`get_default_dataset_name` is used
        persistent (False): whether the dataset should persist in the database
            after the session terminates
        overwrite (False): whether to overwrite an existing dataset of the same
            name
    """

    def __init__(
        self,
        name=None,
        persistent=False,
        overwrite=False,
        _create=True,
        _virtual=False,
        **kwargs,
    ):
        if name is None and _create:
            name = get_default_dataset_name()

        if overwrite and dataset_exists(name):
            delete_dataset(name)

        if _create:
            doc, sample_doc_cls, frame_doc_cls = _create_dataset(
                name, persistent=persistent, **kwargs
            )
        else:
            doc, sample_doc_cls, frame_doc_cls = _load_dataset(
                name, virtual=_virtual
            )

        self._doc = doc
        self._sample_doc_cls = sample_doc_cls
        self._frame_doc_cls = frame_doc_cls

        self._annotation_cache = {}
        self._brain_cache = {}
        self._evaluation_cache = {}

        self._deleted = False

    def __len__(self):
        return self.count()

    def __getitem__(self, id_filepath_slice):
        if isinstance(id_filepath_slice, numbers.Integral):
            raise ValueError(
                "Accessing dataset samples by numeric index is not supported. "
                "Use sample IDs, filepaths, or slices instead"
            )

        if isinstance(id_filepath_slice, slice):
            return self.view()[id_filepath_slice]

        try:
            oid = ObjectId(id_filepath_slice)
            query = {"_id": oid}
        except:
            oid = None
            query = {"filepath": id_filepath_slice}

        d = self._sample_collection.find_one(query)

        if d is None:
            field = "ID" if oid is not None else "filepath"
            raise KeyError(
                "No sample found with %s '%s'" % (field, id_filepath_slice)
            )

        doc = self._sample_dict_to_doc(d)
        return fos.Sample.from_doc(doc, dataset=self)

    def __delitem__(self, samples_or_ids):
        self.delete_samples(samples_or_ids)

    def __getattribute__(self, name):
        #
        # The attributes necessary to determine a dataset's name and whether
        # it is deleted are always available. If a dataset is deleted, no other
        # methods are available
        #
        if name.startswith("__") or name in (
            "name",
            "deleted",
            "_deleted",
            "_doc",
        ):
            return super().__getattribute__(name)

        if getattr(self, "_deleted", False):
            raise ValueError("Dataset '%s' is deleted" % self.name)

        return super().__getattribute__(name)

    @property
    def _dataset(self):
        return self

    @property
    def _root_dataset(self):
        return self

    @property
    def _is_patches(self):
        return self._sample_collection_name.startswith("patches.")

    @property
    def _is_frames(self):
        return self._sample_collection_name.startswith("frames.")

    @property
    def _is_clips(self):
        return self._sample_collection_name.startswith("clips.")

    @property
    def media_type(self):
        """The media type of the dataset."""
        return self._doc.media_type

    @media_type.setter
    def media_type(self, media_type):
        if self:
            raise ValueError("Cannot set media type of a non-empty dataset")

        if media_type not in fom.MEDIA_TYPES:
            raise ValueError(
                "Invalid media_type '%s'. Supported values are %s"
                % (media_type, fom.MEDIA_TYPES)
            )

        self._doc.media_type = media_type

        if media_type == fom.VIDEO:
            # pylint: disable=no-member
            self._doc.frame_fields = [
                foo.SampleFieldDocument.from_field(field)
                for field in self._frame_doc_cls._fields.values()
            ]

        self._doc.save()

    @property
    def version(self):
        """The version of the ``fiftyone`` package for which the dataset is
        formatted.
        """
        return self._doc.version

    @property
    def name(self):
        """The name of the dataset."""
        return self._doc.name

    @name.setter
    def name(self, name):
        _name = self._doc.name

        if name == _name:
            return

        if name in list_datasets():
            raise ValueError("A dataset with name '%s' already exists" % name)

        try:
            self._doc.name = name
            self._doc.save()
        except:
            self._doc.name = _name
            raise

    @property
    def created_at(self):
        """The datetime that the dataset was created."""
        return self._doc.created_at

    @property
    def last_loaded_at(self):
        """The datetime that the dataset was last loaded."""
        return self._doc.last_loaded_at

    @property
    def persistent(self):
        """Whether the dataset persists in the database after a session is
        terminated.
        """
        return self._doc.persistent

    @persistent.setter
    def persistent(self, value):
        _value = self._doc.persistent
        try:
            self._doc.persistent = value
            self._doc.save()
        except:
            self._doc.persistent = _value
            raise

    @property
    def info(self):
        """A user-facing dictionary of information about the dataset.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Store a class list in the dataset's info
            dataset.info = {"classes": ["cat", "dog"]}

            # Edit the info
            dataset.info["other_classes"] = ["bird", "plane"]
            dataset.save()  # must save after edits
        """
        return self._doc.info

    @info.setter
    def info(self, info):
        self._doc.info = info
        self._doc.save()

    @property
    def classes(self):
        """A dict mapping field names to list of class label strings for the
        corresponding fields of the dataset.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Set classes for the `ground_truth` and `predictions` fields
            dataset.classes = {
                "ground_truth": ["cat", "dog"],
                "predictions": ["cat", "dog", "other"],
            }

            # Edit an existing classes list
            dataset.classes["ground_truth"].append("other")
            dataset.save()  # must save after edits
        """
        return self._doc.classes

    @classes.setter
    def classes(self, classes):
        self._doc.classes = classes
        self.save()

    @property
    def default_classes(self):
        """A list of class label strings for all
        :class:`fiftyone.core.labels.Label` fields of this dataset that do not
        have customized classes defined in :meth:`classes`.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Set default classes
            dataset.default_classes = ["cat", "dog"]

            # Edit the default classes
            dataset.default_classes.append("rabbit")
            dataset.save()  # must save after edits
        """
        return self._doc.default_classes

    @default_classes.setter
    def default_classes(self, classes):
        self._doc.default_classes = classes
        self.save()

    @property
    def mask_targets(self):
        """A dict mapping field names to mask target dicts, each of which
        defines a mapping between pixel values and label strings for the
        segmentation masks in the corresponding field of the dataset.

        .. note::

            The pixel value `0` is a reserved "background" class that is
            rendered as invisible in the App.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Set mask targets for the `ground_truth` and `predictions` fields
            dataset.mask_targets = {
                "ground_truth": {1: "cat", 2: "dog"},
                "predictions": {1: "cat", 2: "dog", 255: "other"},
            }

            # Edit an existing mask target
            dataset.mask_targets["ground_truth"][255] = "other"
            dataset.save()  # must save after edits
        """
        return self._doc.mask_targets

    @mask_targets.setter
    def mask_targets(self, targets):
        self._doc.mask_targets = targets
        self.save()

    @property
    def default_mask_targets(self):
        """A dict defining a default mapping between pixel values and label
        strings for the segmentation masks of all
        :class:`fiftyone.core.labels.Segmentation` fields of this dataset that
        do not have customized mask targets defined in :meth:`mask_targets`.

        .. note::

            The pixel value `0` is a reserved "background" class that is
            rendered as invisible in the App.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Set default mask targets
            dataset.default_mask_targets = {1: "cat", 2: "dog"}

            # Edit the default mask targets
            dataset.default_mask_targets[255] = "other"
            dataset.save()  # must save after edits
        """
        return self._doc.default_mask_targets

    @default_mask_targets.setter
    def default_mask_targets(self, targets):
        self._doc.default_mask_targets = targets
        self.save()

    @property
    def deleted(self):
        """Whether the dataset is deleted."""
        return self._deleted

    def summary(self):
        """Returns a string summary of the dataset.

        Returns:
            a string summary
        """
        aggs = self.aggregate([foa.Count(), foa.Distinct("tags")])
        elements = [
            ("Name:", self.name),
            ("Media type:", self.media_type),
            ("Num samples:", aggs[0]),
            ("Persistent:", self.persistent),
            ("Tags:", aggs[1]),
        ]

        elements = fou.justify_headings(elements)
        lines = ["%s %s" % tuple(e) for e in elements]

        lines.extend(
            ["Sample fields:", self._to_fields_str(self.get_field_schema())]
        )

        if self.media_type == fom.VIDEO:
            lines.extend(
                [
                    "Frame fields:",
                    self._to_fields_str(self.get_frame_field_schema()),
                ]
            )

        return "\n".join(lines)

    def stats(self, include_media=False, compressed=False):
        """Returns stats about the dataset on disk.

        The ``samples`` keys refer to the sample-level labels for the dataset
        as they are stored in the database.

        The ``media`` keys refer to the raw media associated with each sample
        in the dataset on disk (only included if ``include_media`` is True).

        The ``frames`` keys refer to the frame labels for the dataset as they
        are stored in the database (video datasets only).

        Args:
            include_media (False): whether to include stats about the size of
                the raw media in the dataset
            compressed (False): whether to return the sizes of collections in
                their compressed form on disk (True) or the logical
                uncompressed size of  the collections (False)

        Returns:
            a stats dict
        """
        stats = {}

        conn = foo.get_db_conn()

        cs = conn.command("collstats", self._sample_collection_name)
        samples_bytes = cs["storageSize"] if compressed else cs["size"]
        stats["samples_count"] = cs["count"]
        stats["samples_bytes"] = samples_bytes
        stats["samples_size"] = etau.to_human_bytes_str(samples_bytes)
        total_bytes = samples_bytes

        if self.media_type == fom.VIDEO:
            cs = conn.command("collstats", self._frame_collection_name)
            frames_bytes = cs["storageSize"] if compressed else cs["size"]
            stats["frames_count"] = cs["count"]
            stats["frames_bytes"] = frames_bytes
            stats["frames_size"] = etau.to_human_bytes_str(frames_bytes)
            total_bytes += frames_bytes

        if include_media:
            self.compute_metadata()
            media_bytes = self.sum("metadata.size_bytes")
            stats["media_bytes"] = media_bytes
            stats["media_size"] = etau.to_human_bytes_str(media_bytes)
            total_bytes += media_bytes

        stats["total_bytes"] = total_bytes
        stats["total_size"] = etau.to_human_bytes_str(total_bytes)

        return stats

    def first(self):
        """Returns the first sample in the dataset.

        Returns:
            a :class:`fiftyone.core.sample.Sample`
        """
        return super().first()

    def last(self):
        """Returns the last sample in the dataset.

        Returns:
            a :class:`fiftyone.core.sample.Sample`
        """
        try:
            sample_view = self[-1:].first()
        except ValueError:
            raise ValueError("%s is empty" % self.__class__.__name__)

        return fos.Sample.from_doc(sample_view._doc, dataset=self)

    def head(self, num_samples=3):
        """Returns a list of the first few samples in the dataset.

        If fewer than ``num_samples`` samples are in the dataset, only the
        available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [
            fos.Sample.from_doc(sv._doc, dataset=self)
            for sv in self[:num_samples]
        ]

    def tail(self, num_samples=3):
        """Returns a list of the last few samples in the dataset.

        If fewer than ``num_samples`` samples are in the dataset, only the
        available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [
            fos.Sample.from_doc(sv._doc, dataset=self)
            for sv in self[-num_samples:]
        ]

    def view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        entire dataset.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return fov.DatasetView(self)

    def get_field_schema(
        self, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of the samples in
        the dataset.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema

        Returns:
             an ``OrderedDict`` mapping field names to field types
        """
        return self._sample_doc_cls.get_field_schema(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            include_private=include_private,
        )

    def get_frame_field_schema(
        self, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of the frames of
        the samples in the dataset.

        Only applicable for video datasets.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema

        Returns:
            a dictionary mapping field names to field types, or ``None`` if
            the dataset is not a video dataset
        """
        if self.media_type != fom.VIDEO:
            return None

        return self._frame_doc_cls.get_field_schema(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            include_private=include_private,
        )

    def add_sample_field(
        self,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        **kwargs,
    ):
        """Adds a new sample field to the dataset.

        Args:
            field_name: the field name
            ftype: the field type to create. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
                field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the :class:`fiftyone.core.fields.Field` type of
                the contained field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`
        """
        self._sample_doc_cls.add_field(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            **kwargs,
        )
        self._reload()

    def _add_sample_field_if_necessary(
        self,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        **kwargs,
    ):
        field_kwargs = dict(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            **kwargs,
        )

        schema = self.get_field_schema()
        if field_name in schema:
            foo.validate_fields_match(
                field_name, field_kwargs, schema[field_name]
            )
        else:
            self.add_sample_field(field_name, **field_kwargs)

    def _add_implied_sample_field(self, field_name, value):
        self._sample_doc_cls.add_implied_field(field_name, value)
        self._reload()

    def _add_implied_sample_field_if_necessary(self, field_name, value):
        self._add_sample_field_if_necessary(
            field_name, **foo.get_implied_field_kwargs(value)
        )

    def add_frame_field(
        self,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        **kwargs,
    ):
        """Adds a new frame-level field to the dataset.

        Only applicable to video datasets.

        Args:
            field_name: the field name
            ftype: the field type to create. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
                field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the :class:`fiftyone.core.fields.Field` type of
                the contained field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`
        """
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        self._frame_doc_cls.add_field(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            **kwargs,
        )
        self._reload()

    def _add_frame_field_if_necessary(
        self,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        **kwargs,
    ):
        field_kwargs = dict(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            **kwargs,
        )

        schema = self.get_frame_field_schema()
        if field_name in schema:
            foo.validate_fields_match(
                field_name, field_kwargs, schema[field_name]
            )
        else:
            self.add_frame_field(field_name, **field_kwargs)

    def _add_implied_frame_field(self, field_name, value):
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        self._frame_doc_cls.add_implied_field(field_name, value)
        self._reload()

    def _add_implied_frame_field_if_necessary(self, field_name, value):
        self._add_frame_field_if_necessary(
            field_name, **foo.get_implied_field_kwargs(value)
        )

    def rename_sample_field(self, field_name, new_field_name):
        """Renames the sample field to the given new name.

        You can use dot notation (``embedded.field.name``) to rename embedded
        fields.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._rename_sample_fields({field_name: new_field_name})

    def rename_sample_fields(self, field_mapping):
        """Renames the sample fields to the given new names.

        You can use dot notation (``embedded.field.name``) to rename embedded
        fields.

        Args:
            field_mapping: a dict mapping field names to new field names
        """
        self._rename_sample_fields(field_mapping)

    def rename_frame_field(self, field_name, new_field_name):
        """Renames the frame-level field to the given new name.

        You can use dot notation (``embedded.field.name``) to rename embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._rename_frame_fields({field_name: new_field_name})

    def rename_frame_fields(self, field_mapping):
        """Renames the frame-level fields to the given new names.

        You can use dot notation (``embedded.field.name``) to rename embedded
        frame fields.

        Args:
            field_mapping: a dict mapping field names to new field names
        """
        self._rename_frame_fields(field_mapping)

    def _rename_sample_fields(self, field_mapping, view=None):
        (
            fields,
            new_fields,
            embedded_fields,
            embedded_new_fields,
        ) = _parse_field_mapping(field_mapping)

        if fields:
            self._sample_doc_cls._rename_fields(fields, new_fields)
            fos.Sample._rename_fields(
                self._sample_collection_name, fields, new_fields
            )

        if embedded_fields:
            sample_collection = self if view is None else view
            self._sample_doc_cls._rename_embedded_fields(
                embedded_fields, embedded_new_fields, sample_collection
            )
            fos.Sample._reload_docs(self._sample_collection_name)

        self._reload()

    def _rename_frame_fields(self, field_mapping, view=None):
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        (
            fields,
            new_fields,
            embedded_fields,
            embedded_new_fields,
        ) = _parse_field_mapping(field_mapping)

        if fields:
            self._frame_doc_cls._rename_fields(fields, new_fields)
            fofr.Frame._rename_fields(
                self._frame_collection_name, fields, new_fields
            )

        if embedded_fields:
            sample_collection = self if view is None else view
            self._frame_doc_cls._rename_embedded_fields(
                embedded_fields, embedded_new_fields, sample_collection
            )
            fofr.Frame._reload_docs(self._frame_collection_name)

        self._reload()

    def clone_sample_field(self, field_name, new_field_name):
        """Clones the given sample field into a new field of the dataset.

        You can use dot notation (``embedded.field.name``) to clone embedded
        fields.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._clone_sample_fields({field_name: new_field_name})

    def clone_sample_fields(self, field_mapping):
        """Clones the given sample fields into new fields of the dataset.

        You can use dot notation (``embedded.field.name``) to clone embedded
        fields.

        Args:
            field_mapping: a dict mapping field names to new field names into
                which to clone each field
        """
        self._clone_sample_fields(field_mapping)

    def clone_frame_field(self, field_name, new_field_name):
        """Clones the frame-level field into a new field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._clone_frame_fields({field_name: new_field_name})

    def clone_frame_fields(self, field_mapping):
        """Clones the frame-level fields into new fields.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_mapping: a dict mapping field names to new field names into
                which to clone each field
        """
        self._clone_frame_fields(field_mapping)

    def _clone_sample_fields(self, field_mapping, view=None):
        (
            fields,
            new_fields,
            embedded_fields,
            embedded_new_fields,
        ) = _parse_field_mapping(field_mapping)

        if fields:
            self._sample_doc_cls._clone_fields(fields, new_fields, view)

        if embedded_fields:
            sample_collection = self if view is None else view
            self._sample_doc_cls._clone_embedded_fields(
                embedded_fields, embedded_new_fields, sample_collection
            )

        fos.Sample._reload_docs(self._sample_collection_name)
        self._reload()

    def _clone_frame_fields(self, field_mapping, view=None):
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        (
            fields,
            new_fields,
            embedded_fields,
            embedded_new_fields,
        ) = _parse_field_mapping(field_mapping)

        if fields:
            self._frame_doc_cls._clone_fields(fields, new_fields, view)

        if embedded_fields:
            sample_collection = self if view is None else view
            self._frame_doc_cls._clone_embedded_fields(
                embedded_fields, embedded_new_fields, sample_collection
            )

        fofr.Frame._reload_docs(self._frame_collection_name)
        self._reload()

    def clear_sample_field(self, field_name):
        """Clears the values of the field from all samples in the dataset.

        The field will remain in the dataset's schema, and all samples will
        have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Args:
            field_name: the field name or ``embedded.field.name``
        """
        self._clear_sample_fields(field_name)

    def clear_sample_fields(self, field_names):
        """Clears the values of the fields from all samples in the dataset.

        The field will remain in the dataset's schema, and all samples will
        have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Args:
            field_names: the field name or iterable of field names
        """
        self._clear_sample_fields(field_names)

    def clear_frame_field(self, field_name):
        """Clears the values of the frame-level field from all samples in the
        dataset.

        The field will remain in the dataset's frame schema, and all frames
        will have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_name: the field name or ``embedded.field.name``
        """
        self._clear_frame_fields(field_name)

    def clear_frame_fields(self, field_names):
        """Clears the values of the frame-level fields from all samples in the
        dataset.

        The fields will remain in the dataset's frame schema, and all frames
        will have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_names: the field name or iterable of field names
        """
        self._clear_frame_fields(field_names)

    def _clear_sample_fields(self, field_names, view=None):
        fields, embedded_fields = _parse_fields(field_names)

        if fields:
            self._sample_doc_cls._clear_fields(fields, view)

        if embedded_fields:
            sample_collection = self if view is None else view
            self._sample_doc_cls._clear_embedded_fields(
                embedded_fields, sample_collection
            )

        fos.Sample._reload_docs(self._sample_collection_name)

    def _clear_frame_fields(self, field_names, view=None):
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        fields, embedded_fields = _parse_fields(field_names)

        if fields:
            self._frame_doc_cls._clear_fields(fields, view)

        if embedded_fields:
            sample_collection = self if view is None else view
            self._frame_doc_cls._clear_embedded_fields(
                embedded_fields, sample_collection
            )

        fofr.Frame._reload_docs(self._frame_collection_name)

    def delete_sample_field(self, field_name, error_level=0):
        """Deletes the field from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        fields.

        Args:
            field_name: the field name or ``embedded.field.name``
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be deleted
            -   1: log warning if a top-level field cannot be deleted
            -   2: ignore top-level fields that cannot be deleted
        """
        self._delete_sample_fields(field_name, error_level)

    def delete_sample_fields(self, field_names, error_level=0):
        """Deletes the fields from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        fields.

        Args:
            field_names: the field name or iterable of field names
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be deleted
            -   1: log warning if a top-level field cannot be deleted
            -   2: ignore top-level fields that cannot be deleted
        """
        self._delete_sample_fields(field_names, error_level)

    def delete_frame_field(self, field_name, error_level=0):
        """Deletes the frame-level field from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_name: the field name or ``embedded.field.name``
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be deleted
            -   1: log warning if a top-level field cannot be deleted
            -   2: ignore top-level fields that cannot be deleted
        """
        self._delete_frame_fields(field_name, error_level)

    def delete_frame_fields(self, field_names, error_level=0):
        """Deletes the frame-level fields from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_names: a field name or iterable of field names
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be deleted
            -   1: log warning if a top-level field cannot be deleted
            -   2: ignore top-level fields that cannot be deleted
        """
        self._delete_frame_fields(field_names, error_level)

    def _delete_sample_fields(self, field_names, error_level):
        fields, embedded_fields = _parse_fields(field_names)

        if fields:
            self._sample_doc_cls._delete_fields(
                fields, error_level=error_level
            )
            fos.Sample._purge_fields(self._sample_collection_name, fields)

        if embedded_fields:
            self._sample_doc_cls._delete_embedded_fields(embedded_fields)
            fos.Sample._reload_docs(self._sample_collection_name)

        self._reload()

    def _delete_frame_fields(self, field_names, error_level):
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        fields, embedded_fields = _parse_fields(field_names)

        if fields:
            self._frame_doc_cls._delete_fields(fields, error_level=error_level)
            fofr.Frame._purge_fields(self._frame_collection_name, fields)

        if embedded_fields:
            self._frame_doc_cls._delete_embedded_fields(embedded_fields)
            fofr.Frame._reload_docs(self._frame_collection_name)

        self._reload()

    def iter_samples(self, progress=False):
        """Returns an iterator over the samples in the dataset.

        Args:
            progress (False): whether to render a progress bar tracking the
                iterator's progress

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        pipeline = self._pipeline(detach_frames=True)

        if progress:
            with fou.ProgressBar(total=len(self)) as pb:
                for sample in pb(self._iter_samples(pipeline)):
                    yield sample
        else:
            for sample in self._iter_samples(pipeline):
                yield sample

    def _iter_samples(self, pipeline):
        index = 0

        try:
            for d in foo.aggregate(self._sample_collection, pipeline):
                doc = self._sample_dict_to_doc(d)
                sample = fos.Sample.from_doc(doc, dataset=self)
                index += 1
                yield sample

        except CursorNotFound:
            # The cursor has timed out so we yield from a new one after
            # skipping to the last offset

            pipeline.append({"$skip": index})
            for sample in self._iter_samples(pipeline):
                yield sample

    def add_sample(self, sample, expand_schema=True, validate=True):
        """Adds the given sample to the dataset.

        If the sample instance does not belong to a dataset, it is updated
        in-place to reflect its membership in this dataset. If the sample
        instance belongs to another dataset, it is not modified.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if the sample's schema is not a subset of the dataset schema
            validate (True): whether to validate that the fields of the sample
                are compliant with the dataset schema before adding it

        Returns:
            the ID of the sample in the dataset
        """
        return self._add_samples_batch([sample], expand_schema, validate)[0]

    def add_samples(
        self, samples, expand_schema=True, validate=True, num_samples=None
    ):
        """Adds the given samples to the dataset.

        Any sample instances that do not belong to a dataset are updated
        in-place to reflect membership in this dataset. Any sample instances
        that belong to other datasets are not modified.

        Args:
            samples: an iterable of :class:`fiftyone.core.sample.Sample`
                instances or a
                :class:`fiftyone.core.collections.SampleCollection`
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            validate (True): whether to validate that the fields of each sample
                are compliant with the dataset schema before adding it
            num_samples (None): the number of samples in ``samples``. If not
                provided, this is computed via ``len(samples)``, if possible.
                This value is optional and is used only for progress tracking

        Returns:
            a list of IDs of the samples in the dataset
        """
        if num_samples is None:
            try:
                num_samples = len(samples)
            except:
                pass

        # Dynamically size batches so that they are as large as possible while
        # still achieving a nice frame rate on the progress bar
        target_latency = 0.2  # in seconds
        batcher = fou.DynamicBatcher(
            samples, target_latency, init_batch_size=1, max_batch_beta=2.0
        )

        sample_ids = []
        with fou.ProgressBar(total=num_samples) as pb:
            for batch in batcher:
                sample_ids.extend(
                    self._add_samples_batch(batch, expand_schema, validate)
                )
                pb.update(count=len(batch))

        return sample_ids

    def add_collection(
        self, sample_collection, include_info=True, overwrite_info=False
    ):
        """Adds the contents of the given collection to the dataset.

        This method is a special case of :meth:`Dataset.merge_samples` that
        adds samples with new IDs to this dataset and omits any samples with
        existing IDs (the latter would only happen in rare cases).

        Use :meth:`Dataset.merge_samples` if you have multiple datasets whose
        samples refer to the same source media.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            include_info (True): whether to merge dataset-level information
                such as ``info`` and ``classes``
            overwrite_info (False): whether to overwrite existing dataset-level
                information. Only applicable when ``include_info`` is True

        Returns:
            a list of IDs of the samples that were added to this dataset
        """
        num_samples = len(self)
        self.merge_samples(
            sample_collection,
            key_field="id",
            skip_existing=True,
            insert_new=True,
            include_info=include_info,
            overwrite_info=overwrite_info,
        )
        return self.skip(num_samples).values("id")

    def _add_samples_batch(self, samples, expand_schema, validate):
        samples = [s.copy() if s._in_db else s for s in samples]

        if self.media_type is None and samples:
            self.media_type = samples[0].media_type

        if expand_schema:
            self._expand_schema(samples)

        if validate:
            self._validate_samples(samples)

        dicts = [self._make_dict(sample) for sample in samples]

        try:
            # adds `_id` to each dict
            self._sample_collection.insert_many(dicts)
        except BulkWriteError as bwe:
            msg = bwe.details["writeErrors"][0]["errmsg"]
            raise ValueError(msg) from bwe

        for sample, d in zip(samples, dicts):
            doc = self._sample_dict_to_doc(d)
            sample._set_backing_doc(doc, dataset=self)

            if self.media_type == fom.VIDEO:
                sample.frames.save()

        return [str(d["_id"]) for d in dicts]

    def _upsert_samples_batch(self, samples, expand_schema, validate):
        if self.media_type is None and samples:
            self.media_type = samples[0].media_type

        if expand_schema:
            self._expand_schema(samples)

        if validate:
            self._validate_samples(samples)

        dicts = []
        ops = []
        for sample in samples:
            d = self._make_dict(sample, include_id=True)
            dicts.append(d)

            if sample.id:
                ops.append(ReplaceOne({"_id": sample._id}, d, upsert=True))
            else:
                d.pop("_id", None)
                ops.append(InsertOne(d))  # adds `_id` to dict

        foo.bulk_write(ops, self._sample_collection, ordered=False)

        for sample, d in zip(samples, dicts):
            doc = self._sample_dict_to_doc(d)
            sample._set_backing_doc(doc, dataset=self)

            if self.media_type == fom.VIDEO:
                sample.frames.save()

    def _make_dict(self, sample, include_id=False):
        d = sample.to_mongo_dict(include_id=include_id)

        # We omit None here to allow samples with None-valued new fields to
        # be added without raising nonexistent field errors. This is safe
        # because None and missing are equivalent in our data model
        return {k: v for k, v in d.items() if v is not None}

    def _bulk_write(self, ops, frames=False, ordered=False):
        if frames:
            coll = self._frame_collection
        else:
            coll = self._sample_collection

        foo.bulk_write(ops, coll, ordered=ordered)

        if frames:
            fofr.Frame._reload_docs(self._frame_collection_name)
        else:
            fos.Sample._reload_docs(self._sample_collection_name)

    def _merge_doc(
        self,
        doc,
        fields=None,
        omit_fields=None,
        expand_schema=True,
        merge_info=True,
        overwrite_info=False,
    ):
        if fields is not None:
            if etau.is_str(fields):
                fields = [fields]
            elif not isinstance(fields, dict):
                fields = list(fields)

        if omit_fields is not None:
            if etau.is_str(omit_fields):
                omit_fields = [omit_fields]
            else:
                omit_fields = list(omit_fields)

        _merge_dataset_doc(
            self,
            doc,
            fields=fields,
            omit_fields=omit_fields,
            expand_schema=expand_schema,
            merge_info=merge_info,
            overwrite_info=overwrite_info,
        )

    def merge_samples(
        self,
        samples,
        key_field="filepath",
        key_fcn=None,
        skip_existing=False,
        insert_new=True,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
        include_info=True,
        overwrite_info=False,
        num_samples=None,
    ):
        """Merges the given samples into this dataset.

        By default, samples with the same absolute ``filepath`` are merged, but
        you can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the provided samples are merged in, overwriting
        any existing values for those fields, with the exception of list fields
        (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both collections are updated
        rather than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether existing samples should be modified or skipped
        -   Whether new samples should be added or omitted
        -   Whether new fields can be added to the dataset schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input fields to different field names of this dataset

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection` or
                iterable of :class:`fiftyone.core.sample.Sample` instances
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            key_fcn (None): a function that accepts a
                :class:`fiftyone.core.sample.Sample` instance and computes a
                key to decide if two samples should be merged. If a ``key_fcn``
                is provided, ``key_field`` is ignored
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            fields (None): an optional field or iterable of fields to which to
                restrict the merge. If provided, fields other than these are
                omitted from ``samples`` when merging or adding samples. One
                exception is that ``filepath`` is always included when adding
                new samples, since the field is required. This can also be a
                dict mapping field names of the input collection to field names
                of this dataset
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge. If provided, these fields are omitted
                from ``samples``, if present, when merging or adding samples.
                One exception is that ``filepath`` is always included when
                adding new samples, since the field is required
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types.
                For label lists fields, existing
                :class:`fiftyone.core.label.Label` elements are either replaced
                (when ``overwrite`` is True) or kept (when ``overwrite`` is
                False) when their ``id`` matches a label from the provided
                samples
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            include_info (True): whether to merge dataset-level information
                such as ``info`` and ``classes``. Only applicable when
                ``samples`` is a
                :class:`fiftyone.core.collections.SampleCollection`
            overwrite_info (False): whether to overwrite existing dataset-level
                information. Only applicable when ``samples`` is a
                :class:`fiftyone.core.collections.SampleCollection` and
                ``include_info`` is True
            num_samples (None): the number of samples in ``samples``. If not
                provided, this is computed via ``len(samples)``, if possible.
                This value is optional and is used only for progress tracking
        """
        if fields is not None:
            if etau.is_str(fields):
                fields = [fields]
            elif not isinstance(fields, dict):
                fields = list(fields)

        if omit_fields is not None:
            if etau.is_str(omit_fields):
                omit_fields = [omit_fields]
            else:
                omit_fields = list(omit_fields)

        if isinstance(samples, foc.SampleCollection):
            _merge_dataset_doc(
                self,
                samples,
                fields=fields,
                omit_fields=omit_fields,
                expand_schema=expand_schema,
                merge_info=include_info,
                overwrite_info=overwrite_info,
            )

            expand_schema = False

        # If we're merging a collection, use aggregation pipelines
        if isinstance(samples, foc.SampleCollection) and key_fcn is None:
            _merge_samples_pipeline(
                samples,
                self,
                key_field,
                skip_existing=skip_existing,
                insert_new=insert_new,
                fields=fields,
                omit_fields=omit_fields,
                merge_lists=merge_lists,
                overwrite=overwrite,
            )
            return

        #
        # If we're not merging a collection but the merge key is a field, it's
        # faster to import into a temporary dataset and then do a merge that
        # leverages aggregation pipelines, because this avoids the need to
        # load samples from `self` into memory
        #

        if key_fcn is None:
            tmp = Dataset()
            tmp.add_samples(samples, num_samples=num_samples)

            self.merge_samples(
                tmp,
                key_field=key_field,
                skip_existing=skip_existing,
                insert_new=insert_new,
                fields=fields,
                omit_fields=omit_fields,
                merge_lists=merge_lists,
                overwrite=overwrite,
                expand_schema=expand_schema,
                include_info=False,
            )
            tmp.delete()

            return

        _merge_samples_python(
            self,
            samples,
            key_field=key_field,
            key_fcn=key_fcn,
            skip_existing=skip_existing,
            insert_new=insert_new,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
            num_samples=num_samples,
        )

    def delete_samples(self, samples_or_ids):
        """Deletes the given sample(s) from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.

        Args:
            samples_or_ids: the sample(s) to delete. Can be any of the
                following:

                -   a sample ID
                -   an iterable of sample IDs
                -   a :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView`
                -   an iterable of sample IDs
                -   a :class:`fiftyone.core.collections.SampleCollection`
                -   an iterable of :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` instances
        """
        sample_ids = _get_sample_ids(samples_or_ids)
        self._clear(sample_ids=sample_ids)

    def delete_labels(
        self, labels=None, ids=None, tags=None, view=None, fields=None
    ):
        """Deletes the specified labels from the dataset.

        You can specify the labels to delete via any of the following methods:

        -   Provide the ``labels`` argument, which should contain a list of
            dicts in the format returned by
            :meth:`fiftyone.core.session.Session.selected_labels`

        -   Provide the ``ids`` or ``tags`` arguments to specify the labels to
            delete via their IDs and/or tags

        -   Provide the ``view`` argument to delete all of the labels in a view
            into this dataset. This syntax is useful if you have constructed a
            :class:`fiftyone.core.view.DatasetView` defining the labels to
            delete

        Additionally, you can specify the ``fields`` argument to restrict
        deletion to specific field(s), either for efficiency or to ensure that
        labels from other fields are not deleted if their contents are included
        in the other arguments.

        Args:
            labels (None): a list of dicts specifying the labels to delete in
                the format returned by
                :meth:`fiftyone.core.session.Session.selected_labels`
            ids (None): an ID or iterable of IDs of the labels to delete
            tags (None): a tag or iterable of tags of the labels to delete
            view (None): a :class:`fiftyone.core.view.DatasetView` into this
                dataset containing the labels to delete
            fields (None): a field or iterable of fields from which to delete
                labels
        """
        if labels is not None:
            self._delete_labels(labels, fields=fields)

        if ids is None and tags is None and view is None:
            return

        if view is not None and view._dataset is not self:
            raise ValueError("`view` must be a view into the same dataset")

        if etau.is_str(ids):
            ids = [ids]

        if ids is not None:
            ids = [ObjectId(_id) for _id in ids]

        if etau.is_str(tags):
            tags = [tags]

        if fields is None:
            fields = self._get_label_fields()
        elif etau.is_str(fields):
            fields = [fields]

        sample_ops = []
        frame_ops = []
        for field in fields:
            if view is not None:
                _, id_path = view._get_label_field_path(field, "_id")
                view_ids = view.values(id_path, unwind=True)
            else:
                view_ids = None

            label_type = self._get_label_field_type(field)
            field, is_frame_field = self._handle_frame_field(field)

            ops = []
            if issubclass(label_type, fol._LABEL_LIST_FIELDS):
                array_field = field + "." + label_type._LABEL_LIST_FIELD

                if view_ids is not None:
                    ops.append(
                        UpdateMany(
                            {},
                            {
                                "$pull": {
                                    array_field: {"_id": {"$in": view_ids}}
                                }
                            },
                        )
                    )

                if ids is not None:
                    ops.append(
                        UpdateMany(
                            {}, {"$pull": {array_field: {"_id": {"$in": ids}}}}
                        )
                    )

                if tags is not None:
                    ops.append(
                        UpdateMany(
                            {},
                            {
                                "$pull": {
                                    array_field: {
                                        "tags": {"$elemMatch": {"$in": tags}}
                                    }
                                }
                            },
                        )
                    )
            else:
                if view_ids is not None:
                    ops.append(
                        UpdateMany(
                            {field + "._id": {"$in": view_ids}},
                            {"$set": {field: None}},
                        )
                    )

                if ids is not None:
                    ops.append(
                        UpdateMany(
                            {field + "._id": {"$in": ids}},
                            {"$set": {field: None}},
                        )
                    )

                if tags is not None:
                    ops.append(
                        UpdateMany(
                            {field + ".tags": {"$elemMatch": {"$in": tags}}},
                            {"$set": {field: None}},
                        )
                    )

            if is_frame_field:
                frame_ops.extend(ops)
            else:
                sample_ops.extend(ops)

        if sample_ops:
            foo.bulk_write(sample_ops, self._sample_collection)
            fos.Sample._reload_docs(self._sample_collection_name)

        if frame_ops:
            foo.bulk_write(frame_ops, self._frame_collection)
            fofr.Frame._reload_docs(self._frame_collection_name)

    def _delete_labels(self, labels, fields=None):
        if etau.is_str(fields):
            fields = [fields]

        # Partition labels by field
        sample_ids = set()
        labels_map = defaultdict(list)
        for l in labels:
            sample_ids.add(l["sample_id"])
            labels_map[l["field"]].append(l)

        sample_ops = []
        frame_ops = []
        for field, field_labels in labels_map.items():
            if fields is not None and field not in fields:
                continue

            label_type = self._get_label_field_type(field)
            field, is_frame_field = self._handle_frame_field(field)

            if is_frame_field:
                # Partition by (sample ID, frame number)
                _labels_map = defaultdict(list)
                for l in field_labels:
                    _labels_map[(l["sample_id"], l["frame_number"])].append(
                        ObjectId(l["label_id"])
                    )

                if issubclass(label_type, fol._LABEL_LIST_FIELDS):
                    array_field = field + "." + label_type._LABEL_LIST_FIELD

                    for (
                        (sample_id, frame_number),
                        label_ids,
                    ) in _labels_map.items():
                        frame_ops.append(
                            UpdateOne(
                                {
                                    "_sample_id": ObjectId(sample_id),
                                    "frame_number": frame_number,
                                },
                                {
                                    "$pull": {
                                        array_field: {
                                            "_id": {"$in": label_ids}
                                        }
                                    }
                                },
                            )
                        )
                else:
                    for (
                        (sample_id, frame_number),
                        label_ids,
                    ) in _labels_map.items():
                        # If the data is well-formed, `label_ids` should have
                        # exactly one element, and this is redundant anyhow
                        # since `sample_id` should uniquely define the label to
                        # delete, but we still include `label_id` in the query
                        # just to be safe
                        for label_id in label_ids:
                            frame_ops.append(
                                UpdateOne(
                                    {
                                        "_sample_id": ObjectId(sample_id),
                                        "frame_number": frame_number,
                                        field + "._id": label_id,
                                    },
                                    {"$set": {field: None}},
                                )
                            )
            else:
                # Partition by sample ID
                _labels_map = defaultdict(list)
                for l in field_labels:
                    _labels_map[l["sample_id"]].append(ObjectId(l["label_id"]))

                if issubclass(label_type, fol._LABEL_LIST_FIELDS):
                    array_field = field + "." + label_type._LABEL_LIST_FIELD

                    for sample_id, label_ids in _labels_map.items():
                        sample_ops.append(
                            UpdateOne(
                                {"_id": ObjectId(sample_id)},
                                {
                                    "$pull": {
                                        array_field: {
                                            "_id": {"$in": label_ids}
                                        }
                                    }
                                },
                            )
                        )
                else:
                    for sample_id, label_ids in _labels_map.items():
                        # If the data is well-formed, `label_ids` should have
                        # exactly one element, and this is redundant anyhow
                        # since `sample_id` and `frame_number` should uniquely
                        # define the label to delete, but we still include
                        # `label_id` in the query just to be safe
                        for label_id in label_ids:
                            sample_ops.append(
                                UpdateOne(
                                    {
                                        "_id": ObjectId(sample_id),
                                        field + "._id": label_id,
                                    },
                                    {"$set": {field: None}},
                                )
                            )

        if sample_ops:
            foo.bulk_write(sample_ops, self._sample_collection)

            fos.Sample._reload_docs(
                self._sample_collection_name, sample_ids=sample_ids
            )

        if frame_ops:
            foo.bulk_write(frame_ops, self._frame_collection)

            # pylint: disable=unexpected-keyword-arg
            fofr.Frame._reload_docs(
                self._frame_collection_name, sample_ids=sample_ids
            )

    @deprecated(reason="Use delete_samples() instead")
    def remove_sample(self, sample_or_id):
        """Removes the given sample from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.

        .. warning::

            This method is deprecated and will be removed in a future release.
            Use the drop-in replacement :meth:`delete_samples` instead.

        Args:
            sample_or_id: the sample to remove. Can be any of the following:

                -   a sample ID
                -   a :class:`fiftyone.core.sample.Sample`
                -   a :class:`fiftyone.core.sample.SampleView`
        """
        self.delete_samples(sample_or_id)

    @deprecated(reason="Use delete_samples() instead")
    def remove_samples(self, samples_or_ids):
        """Removes the given samples from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.

        .. warning::

            This method is deprecated and will be removed in a future release.
            Use the drop-in replacement :meth:`delete_samples` instead.

        Args:
            samples_or_ids: the samples to remove. Can be any of the following:

                -   a sample ID
                -   an iterable of sample IDs
                -   a :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView`
                -   an iterable of sample IDs
                -   a :class:`fiftyone.core.collections.SampleCollection`
                -   an iterable of :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` instances
        """
        self.delete_samples(samples_or_ids)

    def save(self):
        """Saves the dataset to the database.

        This only needs to be called when dataset-level information such as its
        :meth:`Dataset.info` is modified.
        """
        self._save()

    def _save(self, view=None, fields=None):
        if view is not None:
            _save_view(view, fields)

        self._doc.save()

    def clone(self, name=None):
        """Creates a clone of the dataset containing deep copies of all samples
        and dataset-level information in this dataset.

        Args:
            name (None): a name for the cloned dataset. By default,
                :func:`get_default_dataset_name` is used

        Returns:
            the new :class:`Dataset`
        """
        return self._clone(name=name)

    def _clone(self, name=None, view=None):
        if name is None:
            name = get_default_dataset_name()

        if view is not None:
            sample_collection = view
        else:
            sample_collection = self

        return _clone_dataset_or_view(sample_collection, name)

    def clear(self):
        """Removes all samples from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.
        """
        self._clear()

    def _clear(self, view=None, sample_ids=None):
        if view is not None:
            sample_ids = view.values("id")

        if sample_ids is not None:
            d = {"_id": {"$in": [ObjectId(_id) for _id in sample_ids]}}
        else:
            sample_ids = None
            d = {}

        self._sample_collection.delete_many(d)
        fos.Sample._reset_docs(
            self._sample_collection_name, sample_ids=sample_ids
        )

        self._clear_frames(sample_ids=sample_ids)

    def clear_frames(self):
        """Removes all frame labels from the video dataset.

        If reference to a frame exists in memory, the frame will be updated
        such that ``frame.in_dataset`` is False.
        """
        self._clear_frames()

    def _clear_frames(self, view=None, sample_ids=None):
        if self.media_type != fom.VIDEO:
            return

        # Clips datasets directly use their source dataset's frame collection,
        # so don't delete frames
        if self._is_clips:
            return

        if view is not None:
            sample_ids = view.values("id")

        if sample_ids is not None:
            d = {"_sample_id": {"$in": [ObjectId(_id) for _id in sample_ids]}}
        else:
            d = {}

        self._frame_collection.delete_many(d)
        fofr.Frame._reset_docs(
            self._frame_collection_name, sample_ids=sample_ids
        )

    def ensure_frames(self):
        """Ensures that the video dataset contains frame instances for every
        frame of each sample's source video.

        Empty frames will be inserted for missing frames, and already existing
        frames are left unchanged.
        """
        self._ensure_frames()

    def _ensure_frames(self, view=None):
        if self.media_type != fom.VIDEO:
            return

        if view is not None:
            sample_collection = view
        else:
            sample_collection = self

        sample_collection.compute_metadata()

        pipeline = sample_collection._pipeline()
        pipeline.extend(
            [
                {
                    "$project": {
                        "_id": False,
                        "_sample_id": "$_id",
                        "frame_number": {
                            "$range": [
                                1,
                                {"$add": ["$metadata.total_frame_count", 1]},
                            ]
                        },
                    }
                },
                {"$unwind": "$frame_number"},
                {
                    "$merge": {
                        "into": self._frame_collection_name,
                        "on": ["_sample_id", "frame_number"],
                        "whenMatched": "keepExisting",
                        "whenNotMatched": "insert",
                    }
                },
            ]
        )

        self._aggregate(pipeline=pipeline)

    def delete(self):
        """Deletes the dataset.

        Once deleted, only the ``name`` and ``deleted`` attributes of a dataset
        may be accessed.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.
        """
        self.clear()
        _delete_dataset_doc(self._doc)
        self._deleted = True

    def add_dir(
        self,
        dataset_dir=None,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        label_field=None,
        tags=None,
        expand_schema=True,
        add_info=True,
        **kwargs,
    ):
        """Adds the contents of the given directory to the dataset.

        You can perform imports with this method via the following basic
        patterns:

        (a) Provide ``dataset_dir`` and ``dataset_type`` to import the contents
            of a directory that is organized in the default layout for the
            dataset type as documented in
            :ref:`this guide <loading-datasets-from-disk>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            or other type-specific parameters to perform a customized import.
            This syntax provides the flexibility to, for example, perform
            labels-only imports or imports where the source media lies in a
            different location than the labels

        In either workflow, the remaining parameters of this method can be
        provided to further configure the import.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        Args:
            dataset_dir (None): the dataset directory. This can be omitted for
                certain dataset formats if you provide arguments such as
                ``data_path`` and ``labels_path``
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type of the
                dataset
            data_path (None): an optional parameter that enables explicit
                control over the location of the exported media for certain
                dataset types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``export_dir`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``dataset_dir`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``dataset_dir`` has no effect on the location of the data

                By default, it is assumed that the data can be located in the
                default location within ``dataset_dir`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in ``dataset_dir``
                    of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``dataset_dir`` has no effect on the
                    location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``dataset_dir`` of the labels for the default layout of the
                dataset type being imported
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument specifies a
                string prefix to prepend to each label key; the default in this
                case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            add_info (True): whether to add dataset info from the importer (if
                any) to the dataset's ``info``
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        dataset_importer, _ = foud.build_dataset_importer(
            dataset_type,
            dataset_dir=dataset_dir,
            data_path=data_path,
            labels_path=labels_path,
            name=self.name,
            **kwargs,
        )

        return self.add_importer(
            dataset_importer,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            add_info=add_info,
        )

    def merge_dir(
        self,
        dataset_dir=None,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        label_field=None,
        tags=None,
        key_field="filepath",
        key_fcn=None,
        skip_existing=False,
        insert_new=True,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
        add_info=True,
        **kwargs,
    ):
        """Merges the contents of the given directory into the dataset.

        You can perform imports with this method via the following basic
        patterns:

        (a) Provide ``dataset_dir`` and ``dataset_type`` to import the contents
            of a directory that is organized in the default layout for the
            dataset type as documented in
            :ref:`this guide <loading-datasets-from-disk>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            or other type-specific parameters to perform a customized import.
            This syntax provides the flexibility to, for example, perform
            labels-only imports or imports where the source media lies in a
            different location than the labels

        In either workflow, the remaining parameters of this method can be
        provided to further configure the import.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        By default, samples with the same absolute ``filepath`` are merged, but
        you can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the imported samples are merged in, overwriting
        any existing values for those fields, with the exception of list fields
        (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both collections are updated
        rather than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether existing samples should be modified or skipped
        -   Whether new samples should be added or omitted
        -   Whether new fields can be added to the dataset schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input fields to different field names of this dataset

        Args:
            dataset_dir (None): the dataset directory. This can be omitted for
                certain dataset formats if you provide arguments such as
                ``data_path`` and ``labels_path``
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type of the
                dataset
            data_path (None): an optional parameter that enables explicit
                control over the location of the exported media for certain
                dataset types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``export_dir`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``dataset_dir`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``dataset_dir`` has no effect on the location of the data

                By default, it is assumed that the data can be located in the
                default location within ``dataset_dir`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in ``dataset_dir``
                    of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``dataset_dir`` has no effect on the
                    location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``dataset_dir`` of the labels for the default layout of the
                dataset type being imported
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument specifies a
                string prefix to prepend to each label key; the default in this
                case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            key_fcn (None): a function that accepts a
                :class:`fiftyone.core.sample.Sample` instance and computes a
                key to decide if two samples should be merged. If a ``key_fcn``
                is provided, ``key_field`` is ignored
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            fields (None): an optional field or iterable of fields to which to
                restrict the merge. If provided, fields other than these are
                omitted from ``samples`` when merging or adding samples. One
                exception is that ``filepath`` is always included when adding
                new samples, since the field is required. This can also be a
                dict mapping field names of the input collection to field names
                of this dataset
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge. If provided, these fields are omitted
                from imported samples, if present. One exception is that
                ``filepath`` is always included when adding new samples, since
                the field is required
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types. For
                label lists fields, existing :class:`fiftyone.core.label.Label`
                elements are either replaced (when ``overwrite`` is True) or
                kept (when ``overwrite`` is False) when their ``id`` matches a
                label from the provided samples
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            add_info (True): whether to add dataset info from the importer
                (if any) to the dataset
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``
        """
        dataset_importer, _ = foud.build_dataset_importer(
            dataset_type,
            dataset_dir=dataset_dir,
            data_path=data_path,
            labels_path=labels_path,
            name=self.name,
            **kwargs,
        )

        return self.merge_importer(
            dataset_importer,
            label_field=label_field,
            tags=tags,
            key_field=key_field,
            key_fcn=key_fcn,
            skip_existing=skip_existing,
            insert_new=insert_new,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
            add_info=add_info,
        )

    def add_archive(
        self,
        archive_path,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        label_field=None,
        tags=None,
        expand_schema=True,
        add_info=True,
        cleanup=True,
        **kwargs,
    ):
        """Adds the contents of the given archive to the dataset.

        If a directory with the same root name as ``archive_path`` exists, it
        is assumed that this directory contains the extracted contents of the
        archive, and thus the archive is not re-extracted.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        .. note::

            The following archive formats are explicitly supported::

                .zip, .tar, .tar.gz, .tgz, .tar.bz, .tbz

            If an archive *not* in the above list is found, extraction will be
            attempted via the ``patool`` package, which supports many formats
            but may require that additional system packages be installed.

        Args:
            archive_path: the path to an archive of a dataset directory
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type of the
                dataset in ``archive_path``
            data_path (None): an optional parameter that enables explicit
                control over the location of the exported media for certain
                dataset types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``archive_path`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``archive_path`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``archive_path`` has no effect on the location of the data

                By default, it is assumed that the data can be located in the
                default location within ``archive_path`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in
                    ``archive_path`` of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``archive_path`` has no effect on
                    the location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``archive_path`` of the labels for the default layout of the
                dataset type being imported
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument specifies a
                string prefix to prepend to each label key; the default in this
                case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            add_info (True): whether to add dataset info from the importer (if
                any) to the dataset's ``info``
            cleanup (True): whether to delete the archive after extracting it
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        dataset_dir = _extract_archive_if_necessary(archive_path, cleanup)
        return self.add_dir(
            dataset_dir=dataset_dir,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            add_info=add_info,
            **kwargs,
        )

    def merge_archive(
        self,
        archive_path,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        label_field=None,
        tags=None,
        key_field="filepath",
        key_fcn=None,
        skip_existing=False,
        insert_new=True,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
        add_info=True,
        cleanup=True,
        **kwargs,
    ):
        """Merges the contents of the given archive into the dataset.

        If a directory with the same root name as ``archive_path`` exists, it
        is assumed that this directory contains the extracted contents of the
        archive, and thus the archive is not re-extracted.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        .. note::

            The following archive formats are explicitly supported::

                .zip, .tar, .tar.gz, .tgz, .tar.bz, .tbz

            If an archive *not* in the above list is found, extraction will be
            attempted via the ``patool`` package, which supports many formats
            but may require that additional system packages be installed.

        By default, samples with the same absolute ``filepath`` are merged, but
        you can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the imported samples are merged in, overwriting
        any existing values for those fields, with the exception of list fields
        (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both collections are updated
        rather than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether existing samples should be modified or skipped
        -   Whether new samples should be added or omitted
        -   Whether new fields can be added to the dataset schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input fields to different field names of this dataset

        Args:
            archive_path: the path to an archive of a dataset directory
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type of the
                dataset in ``archive_path``
            data_path (None): an optional parameter that enables explicit
                control over the location of the exported media for certain
                dataset types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``archive_path`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``archive_path`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``archive_path`` has no effect on the location of the data

                By default, it is assumed that the data can be located in the
                default location within ``archive_path`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in
                    ``archive_path`` of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``archive_path`` has no effect on
                    the location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``archive_path`` of the labels for the default layout of the
                dataset type being imported
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument specifies a
                string prefix to prepend to each label key; the default in this
                case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            key_fcn (None): a function that accepts a
                :class:`fiftyone.core.sample.Sample` instance and computes a
                key to decide if two samples should be merged. If a ``key_fcn``
                is provided, ``key_field`` is ignored
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            fields (None): an optional field or iterable of fields to which to
                restrict the merge. If provided, fields other than these are
                omitted from ``samples`` when merging or adding samples. One
                exception is that ``filepath`` is always included when adding
                new samples, since the field is required. This can also be a
                dict mapping field names of the input collection to field names
                of this dataset
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge. If provided, these fields are omitted
                from imported samples, if present. One exception is that
                ``filepath`` is always included when adding new samples, since
                the field is required
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types. For
                label lists fields, existing :class:`fiftyone.core.label.Label`
                elements are either replaced (when ``overwrite`` is True) or
                kept (when ``overwrite`` is False) when their ``id`` matches a
                label from the provided samples
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            add_info (True): whether to add dataset info from the importer
                (if any) to the dataset
            cleanup (True): whether to delete the archive after extracting it
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``
        """
        dataset_dir = _extract_archive_if_necessary(archive_path, cleanup)
        return self.merge_dir(
            dataset_dir=dataset_dir,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            key_field=key_field,
            key_fcn=key_fcn,
            skip_existing=skip_existing,
            insert_new=insert_new,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
            add_info=add_info,
            **kwargs,
        )

    def add_importer(
        self,
        dataset_importer,
        label_field=None,
        tags=None,
        expand_schema=True,
        add_info=True,
    ):
        """Adds the samples from the given
        :class:`fiftyone.utils.data.importers.DatasetImporter` to the dataset.

        See :ref:`this guide <custom-dataset-importer>` for more details about
        importing datasets in custom formats by defining your own
        :class:`DatasetImporter <fiftyone.utils.data.importers.DatasetImporter>`.

        Args:
            dataset_importer: a
                :class:`fiftyone.utils.data.importers.DatasetImporter`
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument specifies a
                string prefix to prepend to each label key; the default in this
                case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            add_info (True): whether to add dataset info from the importer (if
                any) to the dataset's ``info``

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        return foud.import_samples(
            self,
            dataset_importer,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            add_info=add_info,
        )

    def merge_importer(
        self,
        dataset_importer,
        label_field=None,
        tags=None,
        key_field="filepath",
        key_fcn=None,
        skip_existing=False,
        insert_new=True,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
        add_info=True,
    ):
        """Merges the samples from the given
        :class:`fiftyone.utils.data.importers.DatasetImporter` into the
        dataset.

        See :ref:`this guide <custom-dataset-importer>` for more details about
        importing datasets in custom formats by defining your own
        :class:`DatasetImporter <fiftyone.utils.data.importers.DatasetImporter>`.

        By default, samples with the same absolute ``filepath`` are merged, but
        you can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the imported samples are merged in, overwriting
        any existing values for those fields, with the exception of list fields
        (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both collections are updated
        rather than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether existing samples should be modified or skipped
        -   Whether new samples should be added or omitted
        -   Whether new fields can be added to the dataset schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input fields to different field names of this dataset

        Args:
            dataset_importer: a
                :class:`fiftyone.utils.data.importers.DatasetImporter`
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument specifies a
                string prefix to prepend to each label key; the default in this
                case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            key_fcn (None): a function that accepts a
                :class:`fiftyone.core.sample.Sample` instance and computes a
                key to decide if two samples should be merged. If a ``key_fcn``
                is provided, ``key_field`` is ignored
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            fields (None): an optional field or iterable of fields to which to
                restrict the merge. If provided, fields other than these are
                omitted from ``samples`` when merging or adding samples. One
                exception is that ``filepath`` is always included when adding
                new samples, since the field is required. This can also be a
                dict mapping field names of the input collection to field names
                of this dataset
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge. If provided, these fields are omitted
                from imported samples, if present. One exception is that
                ``filepath`` is always included when adding new samples, since
                the field is required
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types. For
                label lists fields, existing :class:`fiftyone.core.label.Label`
                elements are either replaced (when ``overwrite`` is True) or
                kept (when ``overwrite`` is False) when their ``id`` matches a
                label from the provided samples
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            add_info (True): whether to add dataset info from the importer
                (if any) to the dataset
        """
        return foud.merge_samples(
            self,
            dataset_importer,
            label_field=label_field,
            tags=tags,
            key_field=key_field,
            key_fcn=key_fcn,
            skip_existing=skip_existing,
            insert_new=insert_new,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
            add_info=add_info,
        )

    def add_images(self, paths_or_samples, sample_parser=None, tags=None):
        """Adds the given images to the dataset.

        This operation does not read the images.

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding images to a dataset by defining your own
        :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of image paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if sample_parser is None:
            sample_parser = foud.ImageSampleParser()

        return foud.add_images(
            self, paths_or_samples, sample_parser, tags=tags
        )

    def add_labeled_images(
        self,
        samples,
        sample_parser,
        label_field=None,
        tags=None,
        expand_schema=True,
    ):
        """Adds the given labeled images to the dataset.

        This operation will iterate over all provided samples, but the images
        will not be read (unless the sample parser requires it in order to
        compute image metadata).

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding labeled images to a dataset by defining your own
        :class:`LabeledImageSampleParser <fiftyone.utils.data.parsers.LabeledImageSampleParser>`.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`
                instance to use to parse the samples
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample, this
                argument specifies the name of the field to use; the default is
                ``"ground_truth"``. If the parser produces a dictionary of
                labels per sample, this argument specifies a string prefix to
                prepend to each label key; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        return foud.add_labeled_images(
            self,
            samples,
            sample_parser,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
        )

    def add_images_dir(self, images_dir, tags=None, recursive=True):
        """Adds the given directory of images to the dataset.

        See :class:`fiftyone.types.dataset_types.ImageDirectory` for format
        details. In particular, note that files with non-image MIME types are
        omitted.

        This operation does not read the images.

        Args:
            images_dir: a directory of images
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a list of IDs of the samples in the dataset
        """
        image_paths = foud.parse_images_dir(images_dir, recursive=recursive)
        sample_parser = foud.ImageSampleParser()
        return self.add_images(image_paths, sample_parser, tags=tags)

    def add_images_patt(self, images_patt, tags=None):
        """Adds the given glob pattern of images to the dataset.

        This operation does not read the images.

        Args:
            images_patt: a glob pattern of images like
                ``/path/to/images/*.jpg``
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples in the dataset
        """
        image_paths = etau.get_glob_matches(images_patt)
        sample_parser = foud.ImageSampleParser()
        return self.add_images(image_paths, sample_parser, tags=tags)

    def ingest_images(
        self,
        paths_or_samples,
        sample_parser=None,
        tags=None,
        dataset_dir=None,
        image_format=None,
    ):
        """Ingests the given iterable of images into the dataset.

        The images are read in-memory and written to ``dataset_dir``.

        See :ref:`this guide <custom-sample-parser>` for more details about
        ingesting images into a dataset by defining your own
        :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of image paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            dataset_dir (None): the directory in which the images will be
                written. By default, :func:`get_default_dataset_dir` is used
            image_format (None): the image format to use to write the images to
                disk. By default, ``fiftyone.config.default_image_ext`` is used

        Returns:
            a list of IDs of the samples in the dataset
        """
        if sample_parser is None:
            sample_parser = foud.ImageSampleParser()

        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.UnlabeledImageDatasetIngestor(
            dataset_dir,
            paths_or_samples,
            sample_parser,
            image_format=image_format,
        )

        return self.add_importer(dataset_ingestor, tags=tags)

    def ingest_labeled_images(
        self,
        samples,
        sample_parser,
        label_field=None,
        tags=None,
        expand_schema=True,
        dataset_dir=None,
        image_format=None,
    ):
        """Ingests the given iterable of labeled image samples into the
        dataset.

        The images are read in-memory and written to ``dataset_dir``.

        See :ref:`this guide <custom-sample-parser>` for more details about
        ingesting labeled images into a dataset by defining your own
        :class:`LabeledImageSampleParser <fiftyone.utils.data.parsers.LabeledImageSampleParser>`.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`
                instance to use to parse the samples
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample, this
                argument specifies the name of the field to use; the default is
                ``"ground_truth"``. If the parser produces a dictionary of
                labels per sample, this argument specifies a string prefix to
                prepend to each label key; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if the sample's schema is not a subset of the dataset schema
            dataset_dir (None): the directory in which the images will be
                written. By default, :func:`get_default_dataset_dir` is used
            image_format (None): the image format to use to write the images to
                disk. By default, ``fiftyone.config.default_image_ext`` is used

        Returns:
            a list of IDs of the samples in the dataset
        """
        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.LabeledImageDatasetIngestor(
            dataset_dir, samples, sample_parser, image_format=image_format,
        )

        return self.add_importer(
            dataset_ingestor,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
        )

    def add_videos(self, paths_or_samples, sample_parser=None, tags=None):
        """Adds the given videos to the dataset.

        This operation does not read the videos.

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding videos to a dataset by defining your own
        :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of video paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledVideoSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if sample_parser is None:
            sample_parser = foud.VideoSampleParser()

        return foud.add_videos(
            self, paths_or_samples, sample_parser, tags=tags
        )

    def add_labeled_videos(
        self,
        samples,
        sample_parser,
        label_field=None,
        tags=None,
        expand_schema=True,
    ):
        """Adds the given labeled videos to the dataset.

        This operation will iterate over all provided samples, but the videos
        will not be read/decoded/etc.

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding labeled videos to a dataset by defining your own
        :class:`LabeledVideoSampleParser <fiftyone.utils.data.parsers.LabeledVideoSampleParser>`.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledVideoSampleParser`
                instance to use to parse the samples
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the parser produces a
                dictionary of labels per sample/frame, this argument specifies
                a string prefix to prepend to each label key; the default in
                this case is to directly use the keys of the imported label
                dictionaries as field names
            label_field ("ground_truth"): the name (or root name) of the
                frame field(s) to use for the labels
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        return foud.add_labeled_videos(
            self,
            samples,
            sample_parser,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
        )

    def add_videos_dir(self, videos_dir, tags=None, recursive=True):
        """Adds the given directory of videos to the dataset.

        See :class:`fiftyone.types.dataset_types.VideoDirectory` for format
        details. In particular, note that files with non-video MIME types are
        omitted.

        This operation does not read/decode the videos.

        Args:
            videos_dir: a directory of videos
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a list of IDs of the samples in the dataset
        """
        video_paths = foud.parse_videos_dir(videos_dir, recursive=recursive)
        sample_parser = foud.VideoSampleParser()
        return self.add_videos(video_paths, sample_parser, tags=tags)

    def add_videos_patt(self, videos_patt, tags=None):
        """Adds the given glob pattern of videos to the dataset.

        This operation does not read/decode the videos.

        Args:
            videos_patt: a glob pattern of videos like
                ``/path/to/videos/*.mp4``
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples in the dataset
        """
        video_paths = etau.get_glob_matches(videos_patt)
        sample_parser = foud.VideoSampleParser()
        return self.add_videos(video_paths, sample_parser, tags=tags)

    def ingest_videos(
        self, paths_or_samples, sample_parser=None, tags=None, dataset_dir=None
    ):
        """Ingests the given iterable of videos into the dataset.

        The videos are copied to ``dataset_dir``.

        See :ref:`this guide <custom-sample-parser>` for more details about
        ingesting videos into a dataset by defining your own
        :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of video paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledVideoSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            dataset_dir (None): the directory in which the videos will be
                written. By default, :func:`get_default_dataset_dir` is used

        Returns:
            a list of IDs of the samples in the dataset
        """
        if sample_parser is None:
            sample_parser = foud.VideoSampleParser()

        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.UnlabeledVideoDatasetIngestor(
            dataset_dir, paths_or_samples, sample_parser
        )

        return self.add_importer(dataset_ingestor, tags=tags)

    def ingest_labeled_videos(
        self,
        samples,
        sample_parser,
        tags=None,
        expand_schema=True,
        dataset_dir=None,
    ):
        """Ingests the given iterable of labeled video samples into the
        dataset.

        The videos are copied to ``dataset_dir``.

        See :ref:`this guide <custom-sample-parser>` for more details about
        ingesting labeled videos into a dataset by defining your own
        :class:`LabeledVideoSampleParser <fiftyone.utils.data.parsers.LabeledVideoSampleParser>`.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledVideoSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if the sample's schema is not a subset of the dataset schema
            dataset_dir (None): the directory in which the videos will be
                written. By default, :func:`get_default_dataset_dir` is used

        Returns:
            a list of IDs of the samples in the dataset
        """
        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.LabeledVideoDatasetIngestor(
            dataset_dir, samples, sample_parser
        )

        return self.add_importer(
            dataset_ingestor, tags=tags, expand_schema=expand_schema
        )

    @classmethod
    def from_dir(
        cls,
        dataset_dir=None,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        name=None,
        label_field=None,
        tags=None,
        **kwargs,
    ):
        """Creates a :class:`Dataset` from the contents of the given directory.

        You can create datasets with this method via the following basic
        patterns:

        (a) Provide ``dataset_dir`` and ``dataset_type`` to import the contents
            of a directory that is organized in the default layout for the
            dataset type as documented in
            :ref:`this guide <loading-datasets-from-disk>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            or other type-specific parameters to perform a customized
            import. This syntax provides the flexibility to, for example,
            perform labels-only imports or imports where the source media lies
            in a different location than the labels

        In either workflow, the remaining parameters of this method can be
        provided to further configure the import.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        Args:
            dataset_dir (None): the dataset directory. This can be omitted if
                you provide arguments such as ``data_path`` and ``labels_path``
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type of the
                dataset
            data_path (None): an optional parameter that enables explicit
                control over the location of the exported media for certain
                dataset types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``export_dir`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``dataset_dir`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``dataset_dir`` has no effect on the location of the data

                By default, it is assumed that the data can be located in the
                default location within ``dataset_dir`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in ``dataset_dir``
                    of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``dataset_dir`` has no effect on the
                    location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``dataset_dir`` of the labels for the default layout of the
                dataset type being imported
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument specifies a
                string prefix to prepend to each label key; the default in this
                case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_dir(
            dataset_dir=dataset_dir,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            **kwargs,
        )
        return dataset

    @classmethod
    def from_archive(
        cls,
        archive_path,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        name=None,
        label_field=None,
        tags=None,
        cleanup=True,
        **kwargs,
    ):
        """Creates a :class:`Dataset` from the contents of the given archive.

        If a directory with the same root name as ``archive_path`` exists, it
        is assumed that this directory contains the extracted contents of the
        archive, and thus the archive is not re-extracted.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        .. note::

            The following archive formats are explicitly supported::

                .zip, .tar, .tar.gz, .tgz, .tar.bz, .tbz

            If an archive *not* in the above list is found, extraction will be
            attempted via the ``patool`` package, which supports many formats
            but may require that additional system packages be installed.

        Args:
            archive_path: the path to an archive of a dataset directory
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type of the
                dataset in ``archive_path``
            data_path (None): an optional parameter that enables explicit
                control over the location of the exported media for certain
                dataset types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``archive_path`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``archive_path`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``archive_path`` has no effect on the location of the data

                By default, it is assumed that the data can be located in the
                default location within ``archive_path`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in
                    ``archive_path`` of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``archive_path`` has no effect on
                    the location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``archive_path`` of the labels for the default layout of the
                dataset type being imported
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument specifies a
                string prefix to prepend to each label key; the default in this
                case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            cleanup (True): whether to delete the archive after extracting it
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_archive(
            archive_path,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            cleanup=cleanup,
            **kwargs,
        )
        return dataset

    @classmethod
    def from_importer(
        cls, dataset_importer, name=None, label_field=None, tags=None
    ):
        """Creates a :class:`Dataset` by importing the samples in the given
        :class:`fiftyone.utils.data.importers.DatasetImporter`.

        See :ref:`this guide <custom-dataset-importer>` for more details about
        providing a custom
        :class:`DatasetImporter <fiftyone.utils.data.importers.DatasetImporter>`
        to import datasets into FiftyOne.

        Args:
            dataset_importer: a
                :class:`fiftyone.utils.data.importers.DatasetImporter`
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument specifies a
                string prefix to prepend to each label key; the default in this
                case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_importer(
            dataset_importer, label_field=label_field, tags=tags
        )
        return dataset

    @classmethod
    def from_images(
        cls, paths_or_samples, sample_parser=None, name=None, tags=None
    ):
        """Creates a :class:`Dataset` from the given images.

        This operation does not read the images.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`
        to load image samples into FiftyOne.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of image paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_images(
            paths_or_samples, sample_parser=sample_parser, tags=tags
        )
        return dataset

    @classmethod
    def from_labeled_images(
        cls, samples, sample_parser, name=None, label_field=None, tags=None,
    ):
        """Creates a :class:`Dataset` from the given labeled images.

        This operation will iterate over all provided samples, but the images
        will not be read.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`LabeledImageSampleParser <fiftyone.utils.data.parsers.LabeledImageSampleParser>`
        to load labeled image samples into FiftyOne.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample, this
                argument specifies the name of the field to use; the default is
                ``"ground_truth"``. If the parser produces a dictionary of
                labels per sample, this argument specifies a string prefix to
                prepend to each label key; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_labeled_images(
            samples, sample_parser, label_field=label_field, tags=tags,
        )
        return dataset

    @classmethod
    def from_images_dir(cls, images_dir, name=None, tags=None, recursive=True):
        """Creates a :class:`Dataset` from the given directory of images.

        This operation does not read the images.

        Args:
            images_dir: a directory of images
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_images_dir(images_dir, tags=tags, recursive=recursive)
        return dataset

    @classmethod
    def from_images_patt(cls, images_patt, name=None, tags=None):
        """Creates a :class:`Dataset` from the given glob pattern of images.

        This operation does not read the images.

        Args:
            images_patt: a glob pattern of images like
                ``/path/to/images/*.jpg``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_images_patt(images_patt, tags=tags)
        return dataset

    @classmethod
    def from_videos(
        cls, paths_or_samples, sample_parser=None, name=None, tags=None
    ):
        """Creates a :class:`Dataset` from the given videos.

        This operation does not read/decode the videos.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`
        to load video samples into FiftyOne.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of video paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledVideoSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_videos(
            paths_or_samples, sample_parser=sample_parser, tags=tags
        )
        return dataset

    @classmethod
    def from_labeled_videos(
        cls, samples, sample_parser, name=None, label_field=None, tags=None
    ):
        """Creates a :class:`Dataset` from the given labeled videos.

        This operation will iterate over all provided samples, but the videos
        will not be read/decoded/etc.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`LabeledVideoSampleParser <fiftyone.utils.data.parsers.LabeledVideoSampleParser>`
        to load labeled video samples into FiftyOne.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledVideoSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the parser produces a
                dictionary of labels per sample/frame, this argument specifies
                a string prefix to prepend to each label key; the default in
                this case is to directly use the keys of the imported label
                dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_labeled_videos(
            samples, sample_parser, label_field=label_field, tags=tags
        )
        return dataset

    @classmethod
    def from_videos_dir(cls, videos_dir, name=None, tags=None, recursive=True):
        """Creates a :class:`Dataset` from the given directory of videos.

        This operation does not read/decode the videos.

        Args:
            videos_dir: a directory of videos
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_videos_dir(videos_dir, tags=tags, recursive=recursive)
        return dataset

    @classmethod
    def from_videos_patt(cls, videos_patt, name=None, tags=None):
        """Creates a :class:`Dataset` from the given glob pattern of videos.

        This operation does not read/decode the videos.

        Args:
            videos_patt: a glob pattern of videos like
                ``/path/to/videos/*.mp4``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_videos_patt(videos_patt, tags=tags)
        return dataset

    @classmethod
    def from_dict(cls, d, name=None, rel_dir=None, frame_labels_dir=None):
        """Loads a :class:`Dataset` from a JSON dictionary generated by
        :func:`fiftyone.core.collections.SampleCollection.to_dict`.

        The JSON dictionary can contain an export of any
        :class:`fiftyone.core.collections.SampleCollection`, e.g.,
        :class:`Dataset` or :class:`fiftyone.core.view.DatasetView`.

        Args:
            d: a JSON dictionary
            name (None): a name for the new dataset. By default, ``d["name"]``
                is used
            rel_dir (None): a relative directory to prepend to the ``filepath``
                of each sample if the filepath is not absolute (begins with a
                path separator). The path is converted to an absolute path
                (if necessary) via
                ``os.path.abspath(os.path.expanduser(rel_dir))``
            frame_labels_dir (None): a directory of per-sample JSON files
                containing the frame labels for video samples. If omitted, it
                is assumed that the frame labels are included directly in the
                provided JSON dict. Only applicable to video datasets

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = d["name"]

        if rel_dir is not None:
            rel_dir = os.path.abspath(os.path.expanduser(rel_dir))

        name = make_unique_dataset_name(name)
        dataset = cls(name)

        media_type = d.get("media_type", None)
        if media_type is not None:
            dataset.media_type = media_type

        dataset._apply_field_schema(d["sample_fields"])
        if media_type == fom.VIDEO:
            dataset._apply_frame_field_schema(d["frame_fields"])

        dataset.info = d.get("info", {})

        dataset.classes = d.get("classes", {})
        dataset.default_classes = d.get("default_classes", [])

        dataset.mask_targets = dataset._parse_mask_targets(
            d.get("mask_targets", {})
        )
        dataset.default_mask_targets = dataset._parse_default_mask_targets(
            d.get("default_mask_targets", {})
        )

        def parse_sample(sd):
            if rel_dir and not sd["filepath"].startswith(os.path.sep):
                sd["filepath"] = os.path.join(rel_dir, sd["filepath"])

            if media_type == fom.VIDEO:
                frames = sd.pop("frames", {})

                if etau.is_str(frames):
                    frames_path = os.path.join(frame_labels_dir, frames)
                    frames = etas.load_json(frames_path).get("frames", {})

                sample = fos.Sample.from_dict(sd)

                for key, value in frames.items():
                    sample.frames[int(key)] = fofr.Frame.from_dict(value)
            else:
                sample = fos.Sample.from_dict(sd)

            return sample

        samples = d["samples"]
        num_samples = len(samples)
        _samples = map(parse_sample, samples)
        dataset.add_samples(
            _samples, expand_schema=False, num_samples=num_samples
        )

        return dataset

    @classmethod
    def from_json(
        cls, path_or_str, name=None, rel_dir=None, frame_labels_dir=None
    ):
        """Loads a :class:`Dataset` from JSON generated by
        :func:`fiftyone.core.collections.SampleCollection.write_json` or
        :func:`fiftyone.core.collections.SampleCollection.to_json`.

        The JSON file can contain an export of any
        :class:`fiftyone.core.collections.SampleCollection`, e.g.,
        :class:`Dataset` or :class:`fiftyone.core.view.DatasetView`.

        Args:
            path_or_str: the path to a JSON file on disk or a JSON string
            name (None): a name for the new dataset. By default, ``d["name"]``
                is used
            rel_dir (None): a relative directory to prepend to the ``filepath``
                of each sample, if the filepath is not absolute (begins with a
                path separator). The path is converted to an absolute path
                (if necessary) via
                ``os.path.abspath(os.path.expanduser(rel_dir))``

        Returns:
            a :class:`Dataset`
        """
        d = etas.load_json(path_or_str)
        return cls.from_dict(
            d, name=name, rel_dir=rel_dir, frame_labels_dir=frame_labels_dir
        )

    def _add_view_stage(self, stage):
        return self.view().add_stage(stage)

    def _pipeline(
        self,
        pipeline=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
    ):
        if self.media_type != fom.VIDEO:
            attach_frames = False
            detach_frames = False
            frames_only = False

        if not attach_frames:
            detach_frames = False

        if frames_only:
            attach_frames = True

        if attach_frames:
            _pipeline = self._frames_lookup_pipeline()
        else:
            _pipeline = []

        if pipeline is not None:
            _pipeline.extend(pipeline)

        if detach_frames:
            _pipeline.append({"$project": {"frames": False}})
        elif frames_only:
            _pipeline.extend(
                [
                    {"$project": {"frames": True}},
                    {"$unwind": "$frames"},
                    {"$replaceRoot": {"newRoot": "$frames"}},
                ]
            )

        return _pipeline

    def _frames_lookup_pipeline(self):
        if self._is_clips:
            return [
                {
                    "$lookup": {
                        "from": self._frame_collection_name,
                        "let": {
                            "sample_id": "$_sample_id",
                            "first": {"$arrayElemAt": ["$support", 0]},
                            "last": {"$arrayElemAt": ["$support", 1]},
                        },
                        "pipeline": [
                            {
                                "$match": {
                                    "$expr": {
                                        "$and": [
                                            {
                                                "$eq": [
                                                    "$_sample_id",
                                                    "$$sample_id",
                                                ]
                                            },
                                            {
                                                "$gte": [
                                                    "$frame_number",
                                                    "$$first",
                                                ]
                                            },
                                            {
                                                "$lte": [
                                                    "$frame_number",
                                                    "$$last",
                                                ]
                                            },
                                        ]
                                    }
                                }
                            },
                            {"$sort": {"frame_number": 1}},
                        ],
                        "as": "frames",
                    }
                }
            ]

        return [
            {
                "$lookup": {
                    "from": self._frame_collection_name,
                    "let": {"sample_id": "$_id"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$eq": ["$$sample_id", "$_sample_id"]
                                }
                            }
                        },
                        {"$sort": {"frame_number": 1}},
                    ],
                    "as": "frames",
                }
            }
        ]

    def _aggregate(
        self,
        pipeline=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
    ):
        _pipeline = self._pipeline(
            pipeline=pipeline,
            attach_frames=attach_frames,
            detach_frames=detach_frames,
            frames_only=frames_only,
        )

        return foo.aggregate(self._sample_collection, _pipeline)

    @property
    def _sample_collection_name(self):
        return self._doc.sample_collection_name

    @property
    def _sample_collection(self):
        return foo.get_db_conn()[self._sample_collection_name]

    @property
    def _frame_collection_name(self):
        return self._doc.frame_collection_name

    @property
    def _frame_collection(self):
        return foo.get_db_conn()[self._frame_collection_name]

    @property
    def _frame_indexes(self):
        index_info = self._frame_collection.index_information()
        return [k["key"][0][0] for k in index_info.values()]

    def _apply_field_schema(self, new_fields):
        curr_fields = self.get_field_schema()
        add_field_fcn = self.add_sample_field
        self._apply_schema(curr_fields, new_fields, add_field_fcn)

    def _apply_frame_field_schema(self, new_fields):
        curr_fields = self.get_frame_field_schema()
        add_field_fcn = self.add_frame_field
        self._apply_schema(curr_fields, new_fields, add_field_fcn)

    def _apply_schema(self, curr_fields, new_fields, add_field_fcn):
        for field_name, field_str in new_fields.items():
            if field_name in curr_fields:
                # Ensure that existing field matches the requested field
                _new_field_str = str(field_str)
                _curr_field_str = str(curr_fields[field_name])
                if _new_field_str != _curr_field_str:
                    raise ValueError(
                        "Existing field %s=%s does not match new field type %s"
                        % (field_name, _curr_field_str, _new_field_str)
                    )
            else:
                # Add new field
                ftype, embedded_doc_type, subfield = fof.parse_field_str(
                    field_str
                )
                add_field_fcn(
                    field_name,
                    ftype,
                    embedded_doc_type=embedded_doc_type,
                    subfield=subfield,
                )

    def _ensure_label_field(self, label_field, label_cls):
        if label_field not in self.get_field_schema():
            self.add_sample_field(
                label_field,
                fof.EmbeddedDocumentField,
                embedded_doc_type=label_cls,
            )

    def _expand_schema(self, samples):
        expanded = False
        fields = self.get_field_schema(include_private=True)
        for sample in samples:
            self._validate_media_type(sample)

            if self.media_type == fom.VIDEO:
                expanded |= self._expand_frame_schema(sample.frames)

            for field_name in sample._get_field_names(include_private=True):
                if field_name == "_id":
                    continue

                if field_name in fields:
                    continue

                value = sample[field_name]
                if value is None:
                    continue

                self._sample_doc_cls.add_implied_field(field_name, value)
                fields = self.get_field_schema(include_private=True)
                expanded = True

        if expanded:
            self._reload()

    def _expand_frame_schema(self, frames):
        expanded = False
        fields = self.get_frame_field_schema(include_private=True)
        for frame in frames.values():
            for field_name in frame._get_field_names(include_private=True):
                if field_name == "_id":
                    continue

                if field_name in fields:
                    continue

                value = frame[field_name]
                if value is None:
                    continue

                self._frame_doc_cls.add_implied_field(field_name, value)
                fields = self.get_frame_field_schema(include_private=True)
                expanded = True

        return expanded

    def _validate_media_type(self, sample):
        if self.media_type != sample.media_type:
            raise fom.MediaTypeError(
                "Sample media type '%s' does not match dataset media type '%s'"
                % (sample.media_type, self.media_type)
            )

    def _sample_dict_to_doc(self, d):
        try:
            return self._sample_doc_cls.from_dict(d, extended=False)
        except:
            # The dataset's schema may have been changed in another process;
            # let's try reloading to see if that fixes things
            self.reload()

            return self._sample_doc_cls.from_dict(d, extended=False)

    def _frame_dict_to_doc(self, d):
        try:
            return self._frame_doc_cls.from_dict(d, extended=False)
        except:
            # The dataset's schema may have been changed in another process;
            # let's try reloading to see if that fixes things
            self.reload()

            return self._frame_doc_cls.from_dict(d, extended=False)

    def _validate_samples(self, samples):
        fields = self.get_field_schema(include_private=True)
        for sample in samples:
            non_existent_fields = set()

            for field_name, value in sample.iter_fields():
                field = fields.get(field_name, None)
                if field is None:
                    if value is not None:
                        non_existent_fields.add(field_name)
                else:
                    if value is not None or not field.null:
                        try:
                            field.validate(value)
                        except moe.ValidationError as e:
                            raise moe.ValidationError(
                                "Invalid value for field '%s'. Reason: %s"
                                % (field_name, str(e))
                            )

            if non_existent_fields:
                raise ValueError(
                    "Fields %s do not exist on dataset '%s'"
                    % (non_existent_fields, self.name)
                )

    def reload(self):
        """Reloads the dataset and any in-memory samples from the database."""
        self._reload(hard=True)
        self._reload_docs(hard=True)

        self._annotation_cache.clear()
        self._brain_cache.clear()
        self._evaluation_cache.clear()

    def _reload(self, hard=False):
        if not hard:
            self._doc.reload()
            return

        doc, sample_doc_cls, frame_doc_cls = _load_dataset(
            self.name, virtual=True
        )

        self._doc = doc
        self._sample_doc_cls = sample_doc_cls
        self._frame_doc_cls = frame_doc_cls

    def _reload_docs(self, hard=False):
        fos.Sample._reload_docs(self._sample_collection_name, hard=hard)

        if self.media_type == fom.VIDEO:
            fofr.Frame._reload_docs(self._frame_collection_name, hard=hard)

    def _serialize(self):
        return self._doc.to_dict(extended=True)


def _get_random_characters(n):
    return "".join(
        random.choice(string.ascii_lowercase + string.digits) for _ in range(n)
    )


def _list_datasets(include_private=False):
    conn = foo.get_db_conn()

    if include_private:
        return sorted(conn.datasets.distinct("name"))

    # Datasets whose sample collections don't start with `samples.` are private
    # e.g., patches or frames datasets
    return sorted(
        conn.datasets.find(
            {"sample_collection_name": {"$regex": "^samples\\."}}
        ).distinct("name")
    )


def _list_dataset_info():
    info = []
    for name in _list_datasets():
        try:
            dataset = Dataset(name, _create=False, _virtual=True)
            num_samples = dataset._sample_collection.estimated_document_count()
            i = {
                "name": dataset.name,
                "created_at": dataset.created_at,
                "last_loaded_at": dataset.last_loaded_at,
                "version": dataset.version,
                "persistent": dataset.persistent,
                "media_type": dataset.media_type,
                "num_samples": num_samples,
            }
        except:
            # If the dataset can't be loaded, it likely requires migration, so
            # we can't show any information about it
            i = {
                "name": name,
                "created_at": None,
                "last_loaded_at": None,
                "version": None,
                "persistent": None,
                "media_type": None,
                "num_samples": None,
            }

        info.append(i)

    return info


def _create_dataset(
    name,
    persistent=False,
    _patches=False,
    _frames=False,
    _clips=False,
    _src_collection=None,
):
    if dataset_exists(name):
        raise ValueError(
            (
                "Dataset '%s' already exists; use `fiftyone.load_dataset()` "
                "to load an existing dataset"
            )
            % name
        )

    sample_collection_name = _make_sample_collection_name(
        patches=_patches, frames=_frames, clips=_clips
    )
    sample_doc_cls = _create_sample_document_cls(sample_collection_name)

    # pylint: disable=no-member
    sample_fields = [
        foo.SampleFieldDocument.from_field(field)
        for field in sample_doc_cls._fields.values()
    ]

    if _clips:
        # Clips datasets directly inherit frames from source dataset
        src_dataset = _src_collection._dataset
        media_type = fom.VIDEO
        frame_collection_name = src_dataset._doc.frame_collection_name
        frame_doc_cls = src_dataset._frame_doc_cls
        frame_fields = src_dataset._doc.frame_fields
    else:
        # @todo don't create frame collection until media type is VIDEO?
        media_type = None
        frame_collection_name = _make_frame_collection_name(
            sample_collection_name
        )
        frame_doc_cls = _create_frame_document_cls(frame_collection_name)
        frame_fields = []

    now = datetime.utcnow()
    dataset_doc = foo.DatasetDocument(
        name=name,
        version=focn.VERSION,
        created_at=now,
        last_loaded_at=now,
        media_type=media_type,
        sample_collection_name=sample_collection_name,
        frame_collection_name=frame_collection_name,
        persistent=persistent,
        sample_fields=sample_fields,
        frame_fields=frame_fields,
    )
    dataset_doc.save()

    if _clips:
        _create_indexes(sample_collection_name, None)
    else:
        _create_indexes(sample_collection_name, frame_collection_name)

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _create_indexes(sample_collection_name, frame_collection_name):
    conn = foo.get_db_conn()

    collection = conn[sample_collection_name]
    collection.create_index("filepath")

    if frame_collection_name is not None:
        frame_collection = conn[frame_collection_name]
        frame_collection.create_index(
            [("_sample_id", 1), ("frame_number", 1)], unique=True
        )


def _make_sample_collection_name(patches=False, frames=False, clips=False):
    conn = foo.get_db_conn()
    now = datetime.now()

    if patches:
        prefix = "patches"
    elif frames:
        prefix = "frames"
    elif clips:
        prefix = "clips"
    else:
        prefix = "samples"

    create_name = lambda timestamp: ".".join([prefix, timestamp])

    name = create_name(now.strftime("%Y.%m.%d.%H.%M.%S"))
    if name in conn.list_collection_names():
        name = create_name(now.strftime("%Y.%m.%d.%H.%M.%S.%f"))

    return name


def _make_frame_collection_name(sample_collection_name):
    return "frames." + sample_collection_name


def _create_sample_document_cls(sample_collection_name):
    return type(sample_collection_name, (foo.DatasetSampleDocument,), {})


def _create_frame_document_cls(frame_collection_name):
    return type(frame_collection_name, (foo.DatasetFrameDocument,), {})


def _get_dataset_doc(collection_name, frames=False):
    if frames:
        # Clips datasets share their parent dataset's frame collection, but
        # only the parent sample collection starts with "samples."
        query = {
            "frame_collection_name": collection_name,
            "sample_collection_name": {"$regex": "^samples\\."},
        }
    else:
        query = {"sample_collection_name": collection_name}

    conn = foo.get_db_conn()
    doc = conn.datasets.find_one(query, {"name": 1})

    if doc is None:
        dtype = "sample" if not frames else "frame"
        raise ValueError(
            "No dataset found with %s collection name '%s'"
            % (dtype, collection_name)
        )

    dataset = load_dataset(doc["name"])
    return dataset._doc


def _load_clips_source_dataset(frame_collection_name):
    # All clips datasets have a source dataset with the same frame collection
    query = {
        "frame_collection_name": frame_collection_name,
        "sample_collection_name": {"$regex": "^samples\\."},
    }

    conn = foo.get_db_conn()
    doc = conn.datasets.find_one(query, {"name": 1})

    if doc is None:
        # The source dataset must have been deleted...
        return None

    return load_dataset(doc["name"])


def _load_dataset(name, virtual=False):
    if not virtual:
        fomi.migrate_dataset_if_necessary(name)

    try:
        # pylint: disable=no-member
        dataset_doc = foo.DatasetDocument.objects.get(name=name)
    except moe.DoesNotExist:
        raise ValueError("Dataset '%s' not found" % name)

    sample_collection_name = dataset_doc.sample_collection_name
    sample_doc_cls = _create_sample_document_cls(sample_collection_name)

    default_sample_fields = fos.get_default_sample_fields(include_private=True)
    for sample_field in dataset_doc.sample_fields:
        if sample_field.name in default_sample_fields:
            continue

        sample_doc_cls._declare_field(sample_field)

    frame_collection_name = dataset_doc.frame_collection_name

    if not virtual:
        dataset_doc.last_loaded_at = datetime.utcnow()
        dataset_doc.save()

    if sample_collection_name.startswith("clips."):
        # Clips datasets directly inherit frames from source dataset
        _src_dataset = _load_clips_source_dataset(frame_collection_name)
    else:
        _src_dataset = None

    if _src_dataset is not None:
        frame_doc_cls = _src_dataset._frame_doc_cls
        dataset_doc.frame_fields = _src_dataset._doc.frame_fields
    else:
        frame_doc_cls = _create_frame_document_cls(frame_collection_name)

        if dataset_doc.media_type == fom.VIDEO:
            default_frame_fields = fofr.get_default_frame_fields(
                include_private=True
            )
            for frame_field in dataset_doc.frame_fields:
                if frame_field.name in default_frame_fields:
                    continue

                frame_doc_cls._declare_field(frame_field)

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _delete_dataset_doc(dataset_doc):
    #
    # Must manually cleanup run results, which are stored using GridFS
    # https://docs.mongoengine.org/guide/gridfs.html#deletion
    #

    for run_doc in dataset_doc.annotation_runs.values():
        if run_doc.results is not None:
            run_doc.results.delete()

    for run_doc in dataset_doc.brain_methods.values():
        if run_doc.results is not None:
            run_doc.results.delete()

    for run_doc in dataset_doc.evaluations.values():
        if run_doc.results is not None:
            run_doc.results.delete()

    dataset_doc.delete()


def _clone_dataset_or_view(dataset_or_view, name):
    if dataset_exists(name):
        raise ValueError("Dataset '%s' already exists" % name)

    if isinstance(dataset_or_view, fov.DatasetView):
        dataset = dataset_or_view._dataset
        view = dataset_or_view
    else:
        dataset = dataset_or_view
        view = None

    dataset._reload()

    sample_collection_name = _make_sample_collection_name()
    frame_collection_name = _make_frame_collection_name(sample_collection_name)

    #
    # Clone dataset document
    #

    dataset_doc = dataset._doc.copy()
    dataset_doc.name = name
    dataset_doc.created_at = datetime.utcnow()
    dataset_doc.last_loaded_at = None
    dataset_doc.persistent = False
    dataset_doc.sample_collection_name = sample_collection_name
    dataset_doc.frame_collection_name = frame_collection_name

    # Run results get special treatment at the end
    dataset_doc.annotation_runs.clear()
    dataset_doc.brain_methods.clear()
    dataset_doc.evaluations.clear()

    if view is not None:
        # Respect filtered sample fields, if any
        schema = view.get_field_schema()
        dataset_doc.sample_fields = [
            f
            for f in dataset_doc.sample_fields
            if f.name in set(schema.keys())
        ]

        # Respect filtered frame fields, if any
        if dataset.media_type == fom.VIDEO:
            frame_schema = view.get_frame_field_schema()
            dataset_doc.frame_fields = [
                f
                for f in dataset_doc.frame_fields
                if f.name in set(frame_schema.keys())
            ]

    dataset_doc.save()

    # Create indexes
    _create_indexes(sample_collection_name, frame_collection_name)

    # Clone samples
    coll, pipeline = _get_samples_pipeline(dataset_or_view)
    pipeline.append({"$out": sample_collection_name})
    foo.aggregate(coll, pipeline)

    # Clone frames
    if dataset.media_type == fom.VIDEO:
        coll, pipeline = _get_frames_pipeline(dataset_or_view)
        pipeline.append({"$out": frame_collection_name})
        foo.aggregate(coll, pipeline)

    clone_dataset = load_dataset(name)

    # Clone run results
    if (
        dataset.has_annotation_runs
        or dataset.has_brain_runs
        or dataset.has_evaluations
    ):
        _clone_runs(clone_dataset, dataset._doc)

    return clone_dataset


def _get_samples_pipeline(sample_collection):
    coll = sample_collection._dataset._sample_collection
    pipeline = sample_collection._pipeline(detach_frames=True)
    return coll, pipeline


def _get_frames_pipeline(sample_collection):
    if isinstance(sample_collection, fov.DatasetView):
        dataset = sample_collection._dataset
        view = sample_collection
    else:
        dataset = sample_collection
        view = None

    if dataset._is_clips:
        # Clips datasets use `sample_id` to associated with frames, but now as
        # a standalone collection, they must use `_id`
        coll = dataset._sample_collection
        pipeline = sample_collection._pipeline(attach_frames=True) + [
            {"$project": {"frames": True}},
            {"$unwind": "$frames"},
            {"$set": {"frames._sample_id": "$_id"}},
            {"$replaceRoot": {"newRoot": "$frames"}},
            {"$unset": "_id"},
        ]
    elif view is not None:
        # The view may modify the frames, so we route the frames though
        # the sample collection
        coll = dataset._sample_collection
        pipeline = view._pipeline(frames_only=True)
    else:
        # Here we can directly aggregate on the frame collection
        coll = dataset._frame_collection
        pipeline = []

    return coll, pipeline


def _save_view(view, fields):
    dataset = view._dataset

    merge = fields is not None
    if fields is None:
        fields = []

    if dataset.media_type == fom.VIDEO:
        sample_fields = []
        frame_fields = []
        for field in fields:
            field, is_frame_field = view._handle_frame_field(field)
            if is_frame_field:
                frame_fields.append(field)
            else:
                sample_fields.append(field)
    else:
        sample_fields = fields
        frame_fields = []

    #
    # Save samples
    #

    pipeline = view._pipeline(detach_frames=True)

    if merge:
        if sample_fields:
            # @todo if `view` omits samples, shouldn't we set their field
            # values to None here, for consistency with the fact that $out
            # will delete samples that don't appear in `view`?
            pipeline.append({"$project": {f: True for f in sample_fields}})
            pipeline.append({"$merge": dataset._sample_collection_name})
            foo.aggregate(dataset._sample_collection, pipeline)
    else:
        pipeline.append({"$out": dataset._sample_collection_name})
        foo.aggregate(dataset._sample_collection, pipeline)

        for field_name in view._get_missing_fields():
            dataset._sample_doc_cls._delete_field_schema(field_name)

    #
    # Save frames
    #

    if dataset.media_type == fom.VIDEO:
        # The view may modify the frames, so we route the frames through the
        # sample collection
        pipeline = view._pipeline(frames_only=True)

        # Clips views may contain overlapping clips, so we must select only
        # the first occurrance of each frame
        if dataset._is_clips:
            pipeline.extend(
                [
                    {"$group": {"_id": "$_id", "doc": {"$first": "$$ROOT"}}},
                    {"$replaceRoot": {"newRoot": "$doc"}},
                ]
            )

        if merge:
            if frame_fields:
                # @todo if `view` omits samples, shouldn't we set their field
                # values to None here, for consistency with the fact that $out
                # will delete samples that don't appear in `view`?
                pipeline.append({"$project": {f: True for f in frame_fields}})
                pipeline.append({"$merge": dataset._frame_collection_name})
                foo.aggregate(dataset._sample_collection, pipeline)
        else:
            pipeline.append({"$out": dataset._frame_collection_name})
            foo.aggregate(dataset._sample_collection, pipeline)

            for field_name in view._get_missing_fields(frames=True):
                dataset._frame_doc_cls._delete_field_schema(field_name)

    #
    # Reload in-memory documents
    #

    # The samples now in the collection
    sample_ids = dataset.values("id")

    if dataset.media_type == fom.VIDEO:
        # pylint: disable=unexpected-keyword-arg
        fofr.Frame._sync_docs(dataset._frame_collection_name, sample_ids)

    fos.Sample._sync_docs(dataset._sample_collection_name, sample_ids)


def _merge_dataset_doc(
    dataset,
    collection_or_doc,
    fields=None,
    omit_fields=None,
    expand_schema=True,
    merge_info=True,
    overwrite_info=False,
):
    #
    # Merge media type
    #

    src_media_type = collection_or_doc.media_type
    if dataset.media_type is None:
        dataset.media_type = src_media_type

    if src_media_type != dataset.media_type and src_media_type is not None:
        raise ValueError(
            "Cannot merge a dataset with media_type='%s' into a dataset "
            "with media_type='%s'" % (src_media_type, dataset.media_type)
        )

    #
    # Merge schemas
    #

    curr_doc = dataset._doc
    is_video = dataset.media_type == fom.VIDEO

    if isinstance(collection_or_doc, foc.SampleCollection):
        # Respects filtered schemas, if any
        doc = collection_or_doc._dataset._doc
        schema = collection_or_doc.get_field_schema()
        if is_video:
            frame_schema = collection_or_doc.get_frame_field_schema()
    else:
        doc = collection_or_doc
        schema = {f.name: f.to_field() for f in doc.sample_fields}
        if is_video:
            frame_schema = {f.name: f.to_field() for f in doc.frame_fields}

    # Omit fields first in case `fields` is a dict that changes field names
    if omit_fields is not None:
        if is_video:
            omit_fields, omit_frame_fields = fou.split_frame_fields(
                omit_fields
            )
            frame_schema = {
                k: v
                for k, v in frame_schema.items()
                if k not in omit_frame_fields
            }

        schema = {k: v for k, v in schema.items() if k not in omit_fields}

    if fields is not None:
        if not isinstance(fields, dict):
            fields = {f: f for f in fields}

        if is_video:
            fields, frame_fields = fou.split_frame_fields(fields)

            frame_schema = {
                frame_fields[k]: v
                for k, v in frame_schema.items()
                if k in frame_fields
            }

        schema = {fields[k]: v for k, v in schema.items() if k in fields}

    dataset._sample_doc_cls.merge_field_schema(
        schema, expand_schema=expand_schema
    )
    if is_video and frame_schema is not None:
        dataset._frame_doc_cls.merge_field_schema(
            frame_schema, expand_schema=expand_schema
        )

    if not merge_info:
        curr_doc.reload()
        return

    #
    # Merge info
    #

    if overwrite_info:
        curr_doc.info.update(doc.info)
        curr_doc.classes.update(doc.classes)
        curr_doc.mask_targets.update(doc.mask_targets)

        if doc.default_classes:
            curr_doc.default_classes = doc.default_classes

        if doc.default_mask_targets:
            curr_doc.default_mask_targets = doc.default_mask_targets
    else:
        _update_no_overwrite(curr_doc.info, doc.info)
        _update_no_overwrite(curr_doc.classes, doc.classes)
        _update_no_overwrite(curr_doc.mask_targets, doc.mask_targets)

        if doc.default_classes and not curr_doc.default_classes:
            curr_doc.default_classes = doc.default_classes

        if doc.default_mask_targets and not curr_doc.default_mask_targets:
            curr_doc.default_mask_targets = doc.default_mask_targets

    curr_doc.save()

    if dataset:
        if doc.annotation_runs:
            logger.warning(
                "Annotation runs cannot be merged into a non-empty dataset"
            )

        if doc.brain_methods:
            logger.warning(
                "Brain runs cannot be merged into a non-empty dataset"
            )

        if doc.evaluations:
            logger.warning(
                "Evaluations cannot be merged into a non-empty dataset"
            )
    else:
        dataset.delete_annotation_runs()
        dataset.delete_brain_runs()
        dataset.delete_evaluations()

        _clone_runs(dataset, doc)


def _update_no_overwrite(d, dnew):
    d.update({k: v for k, v in dnew.items() if k not in d})


def _clone_runs(dst_dataset, src_doc):
    dst_doc = dst_dataset._doc

    #
    # Clone annotation runs results
    #
    # GridFS files must be manually copied
    # This works by loading the source dataset's copy of the results into
    # memory and then writing a new copy for the destination dataset
    #

    for anno_key, run_doc in src_doc.annotation_runs.items():
        _run_doc = deepcopy(run_doc)
        dst_doc.annotation_runs[anno_key] = _run_doc
        results = foan.AnnotationMethod.load_run_results(dst_dataset, anno_key)
        _run_doc.results = None
        foan.AnnotationMethod.save_run_results(dst_dataset, anno_key, results)

    #
    # Clone brain results
    #
    # GridFS files must be manually copied
    # This works by loading the source dataset's copy of the results into
    # memory and then writing a new copy for the destination dataset
    #

    for brain_key, run_doc in src_doc.brain_methods.items():
        _run_doc = deepcopy(run_doc)
        dst_doc.brain_methods[brain_key] = _run_doc
        results = fob.BrainMethod.load_run_results(dst_dataset, brain_key)
        _run_doc.results = None
        fob.BrainMethod.save_run_results(dst_dataset, brain_key, results)

    #
    # Clone evaluation results
    #
    # GridFS files must be manually copied
    # This works by loading the source dataset's copy of the results into
    # memory and then writing a new copy for the destination dataset
    #

    for eval_key, run_doc in src_doc.evaluations.items():
        _run_doc = deepcopy(run_doc)
        dst_doc.evaluations[eval_key] = _run_doc
        results = foe.EvaluationMethod.load_run_results(dst_dataset, eval_key)
        _run_doc.results = None
        foe.EvaluationMethod.save_run_results(dst_dataset, eval_key, results)

    dst_doc.save()


def _ensure_index(sample_collection, db_field, unique=False):
    # For some reason the ID index is not reported by `index_information()` as
    # being unique like other manually created indexes, but it is
    if db_field == "_id":
        return False, False

    coll = sample_collection._dataset._sample_collection

    # db_field -> (name, unique)
    index_map = _get_single_index_map(coll)

    new = False
    dropped = False

    if db_field in index_map:
        name, _unique = index_map[db_field]
        if _unique or (_unique == unique):
            # Satisfactory index already exists
            return new, dropped

        # Must upgrade to unique index
        coll.drop_index(name)
        dropped = True

    coll.create_index(db_field, unique=True)
    new = True

    return new, dropped


def _cleanup_index(sample_collection, db_field, new_index, dropped_index):
    coll = sample_collection._dataset._sample_collection

    if new_index:
        # db_field -> (name, unique)
        index_map = _get_single_index_map(coll)

        name = index_map[db_field][0]
        coll.drop_index(name)

    if dropped_index:
        coll.create_index(db_field)


def _get_single_index_map(coll):
    # db_field -> (name, unique)
    return {
        v["key"][0][0]: (k, v.get("unique", False))
        for k, v in coll.index_information().items()
        if len(v["key"]) == 1
    }


def _merge_samples_python(
    dataset,
    samples,
    key_field=None,
    key_fcn=None,
    skip_existing=False,
    insert_new=True,
    fields=None,
    omit_fields=None,
    merge_lists=True,
    overwrite=True,
    expand_schema=True,
    num_samples=None,
):
    if num_samples is None:
        try:
            num_samples = len(samples)
        except:
            pass

    if key_fcn is None:
        id_map = {k: v for k, v in zip(*dataset.values([key_field, "id"]))}
        key_fcn = lambda sample: sample[key_field]
    else:
        id_map = {}
        logger.info("Indexing dataset...")
        for sample in dataset.iter_samples(progress=True):
            id_map[key_fcn(sample)] = sample.id

    _samples = _make_merge_samples_generator(
        dataset,
        samples,
        key_fcn,
        id_map,
        skip_existing=skip_existing,
        insert_new=insert_new,
        fields=fields,
        omit_fields=omit_fields,
        merge_lists=merge_lists,
        overwrite=overwrite,
        expand_schema=expand_schema,
    )

    # Dynamically size batches so that they are as large as possible while
    # still achieving a nice frame rate on the progress bar
    target_latency = 0.2  # in seconds
    batcher = fou.DynamicBatcher(
        _samples, target_latency, init_batch_size=1, max_batch_beta=2.0
    )

    logger.info("Merging samples...")
    with fou.ProgressBar(total=num_samples) as pb:
        for batch in batcher:
            dataset._upsert_samples_batch(batch, expand_schema, True)
            pb.update(count=len(batch))


def _make_merge_samples_generator(
    dataset,
    samples,
    key_fcn,
    id_map,
    skip_existing=False,
    insert_new=True,
    fields=None,
    omit_fields=None,
    merge_lists=True,
    overwrite=True,
    expand_schema=True,
):
    # When inserting new samples, `filepath` cannot be excluded
    if insert_new:
        if isinstance(fields, dict):
            insert_fields = fields.copy()
            insert_fields["filepath"] = "filepath"
        elif fields is not None:
            insert_fields = fields.copy()
            if "filepath" not in insert_fields:
                insert_fields = ["filepath"] + insert_fields
        else:
            insert_fields = None

        insert_omit_fields = omit_fields
        if insert_omit_fields is not None:
            insert_omit_fields = [
                f for f in insert_omit_fields if f != "filepath"
            ]

    for sample in samples:
        key = key_fcn(sample)
        if key in id_map:
            if not skip_existing:
                existing_sample = dataset[id_map[key]]
                existing_sample.merge(
                    sample,
                    fields=fields,
                    omit_fields=omit_fields,
                    merge_lists=merge_lists,
                    overwrite=overwrite,
                    expand_schema=expand_schema,
                )

                yield existing_sample

        elif insert_new:
            if insert_fields is not None or insert_omit_fields is not None:
                sample = sample.copy(
                    fields=insert_fields, omit_fields=insert_omit_fields
                )
            elif sample._in_db:
                sample = sample.copy()

            yield sample


def _merge_samples_pipeline(
    src_collection,
    dst_dataset,
    key_field,
    skip_existing=False,
    insert_new=True,
    fields=None,
    omit_fields=None,
    merge_lists=True,
    overwrite=True,
):
    #
    # Prepare for merge
    #

    in_key_field = key_field
    db_fields_map = src_collection._get_db_fields_map()
    key_field = db_fields_map.get(key_field, key_field)

    is_video = dst_dataset.media_type == fom.VIDEO
    src_dataset = src_collection._dataset

    new_src_index, dropped_src_index = _ensure_index(
        src_dataset, key_field, unique=True
    )
    new_dst_index, dropped_dst_index = _ensure_index(
        dst_dataset, key_field, unique=True
    )

    if is_video:
        frame_fields = None
        omit_frame_fields = None

    if fields is not None:
        if not isinstance(fields, dict):
            fields = {f: f for f in fields}

        if is_video:
            fields, frame_fields = fou.split_frame_fields(fields)

    if omit_fields is not None:
        if is_video:
            omit_fields, omit_frame_fields = fou.split_frame_fields(
                omit_fields
            )

        if fields is not None:
            fields = {k: v for k, v in fields.items() if k not in omit_fields}
            omit_fields = None

        if is_video and frame_fields is not None:
            frame_fields = {
                k: v
                for k, v in frame_fields.items()
                if k not in omit_frame_fields
            }
            omit_frame_fields = None

    #
    # The implementation of merging video frames is currently a bit complex.
    # It may be possible to simplify this...
    #
    # The trouble is that the `_sample_id` of the frame documents need to match
    # the `_id` of the sample documents after merging. There may be a more
    # clever way to make this happen via `$lookup` than what is implemented
    # here, but here's the current workflow:
    #
    # - Store the `key_field` value on each frame document in both the source
    #   and destination collections corresopnding to its parent sample in a
    #   temporary `frame_key_field` field
    # - Merge the sample documents without frames attached
    # - Merge the frame documents on `[frame_key_field, frame_number]` with
    #   their old `_sample_id`s unset
    # - Generate a `key_field` -> `_id` mapping for the post-merge sample docs,
    #   then make a pass over the frame documents and set
    #   their `_sample_id` to the corresponding value from this mapping
    # - The merge is complete, so delete `frame_key_field` from both frame
    #   collections
    #

    if is_video:
        frame_key_field = "_merge_key"
        _index_frames(dst_dataset, key_field, frame_key_field)
        _index_frames(src_collection, key_field, frame_key_field)

        # Must create unique indexes in order to use `$merge`
        frame_index_spec = [(frame_key_field, 1), ("frame_number", 1)]
        dst_frame_index = dst_dataset._frame_collection.create_index(
            frame_index_spec, unique=True
        )
        src_frame_index = src_dataset._frame_collection.create_index(
            frame_index_spec, unique=True
        )

    #
    # Merge samples
    #

    default_fields = set(
        src_collection._get_default_sample_fields(include_private=True)
    )
    default_fields.discard("id")

    sample_pipeline = src_collection._pipeline(detach_frames=True)

    if fields is not None:
        project = {}
        for k, v in fields.items():
            k = db_fields_map.get(k, k)
            v = db_fields_map.get(v, v)
            if k == v:
                project[k] = True
            else:
                project[v] = "$" + k

        if insert_new:
            # Must include default fields when new samples may be inserted.
            # Any extra fields here are omitted in `when_matched` pipeline
            project["filepath"] = True
            project["_rand"] = True
            project["_media_type"] = True

            if "tags" not in project:
                project["tags"] = []

        sample_pipeline.append({"$project": project})

    if omit_fields is not None:
        _omit_fields = set(omit_fields)
    else:
        _omit_fields = set()

    _omit_fields.add("id")
    _omit_fields.discard(in_key_field)

    if insert_new:
        # Can't omit default fields here when new samples may be inserted.
        # Any extra fields here are omitted in `when_matched` pipeline
        _omit_fields -= default_fields

    if _omit_fields:
        unset_fields = [db_fields_map.get(f, f) for f in _omit_fields]
        sample_pipeline.append({"$unset": unset_fields})

    if skip_existing:
        when_matched = "keepExisting"
    else:
        # We had to include all default fields since they are required if new
        # samples are inserted, but, when merging, the user may have wanted
        # them excluded
        delete_fields = set()
        if insert_new:
            if fields is not None:
                delete_fields.update(
                    f for f in default_fields if f not in set(fields.values())
                )

            if omit_fields is not None:
                delete_fields.update(
                    f for f in default_fields if f in omit_fields
                )

        when_matched = _merge_docs(
            src_collection,
            merge_lists=merge_lists,
            fields=fields,
            omit_fields=omit_fields,
            delete_fields=delete_fields,
            overwrite=overwrite,
            frames=False,
        )

    if insert_new:
        when_not_matched = "insert"
    else:
        when_not_matched = "discard"

    sample_pipeline.append(
        {
            "$merge": {
                "into": dst_dataset._sample_collection_name,
                "on": key_field,
                "whenMatched": when_matched,
                "whenNotMatched": when_not_matched,
            }
        }
    )

    # Merge samples
    src_dataset._aggregate(pipeline=sample_pipeline)

    # Cleanup indexes
    _cleanup_index(src_collection, key_field, new_src_index, dropped_src_index)
    _cleanup_index(dst_dataset, key_field, new_dst_index, dropped_dst_index)

    #
    # Merge frames
    #

    if is_video:
        # @todo this there a cleaner way to avoid this? we have to be sure that
        # `frame_key_field` is not excluded by a user's view here...
        _src_collection = _always_select_field(
            src_collection, "frames." + frame_key_field
        )

        db_fields_map = src_collection._get_db_fields_map(frames=True)

        frame_pipeline = _src_collection._pipeline(frames_only=True)

        if frame_fields is not None:
            project = {}
            for k, v in frame_fields.items():
                k = db_fields_map.get(k, k)
                v = db_fields_map.get(v, v)
                if k == v:
                    project[k] = True
                else:
                    project[v] = "$" + k

            project[frame_key_field] = True
            project["frame_number"] = True
            frame_pipeline.append({"$project": project})

        if omit_frame_fields is not None:
            _omit_frame_fields = set(omit_frame_fields)
        else:
            _omit_frame_fields = set()

        _omit_frame_fields.update(["id", "_sample_id"])
        _omit_frame_fields.discard(frame_key_field)
        _omit_frame_fields.discard("frame_number")

        unset_fields = [db_fields_map.get(f, f) for f in _omit_frame_fields]
        frame_pipeline.append({"$unset": unset_fields})

        if skip_existing:
            when_frame_matched = "keepExisting"
        else:
            when_frame_matched = _merge_docs(
                src_collection,
                merge_lists=merge_lists,
                fields=frame_fields,
                omit_fields=omit_frame_fields,
                overwrite=overwrite,
                frames=True,
            )

        frame_pipeline.append(
            {
                "$merge": {
                    "into": dst_dataset._frame_collection_name,
                    "on": [frame_key_field, "frame_number"],
                    "whenMatched": when_frame_matched,
                    "whenNotMatched": "insert",
                }
            }
        )

        # Merge frames
        src_dataset._aggregate(pipeline=frame_pipeline)

        # Drop indexes
        dst_dataset._frame_collection.drop_index(dst_frame_index)
        src_dataset._frame_collection.drop_index(src_frame_index)

        # Finalize IDs
        _finalize_frames(dst_dataset, key_field, frame_key_field)

        # Cleanup merge key
        cleanup_op = {"$unset": {frame_key_field: ""}}
        src_dataset._frame_collection.update_many({}, cleanup_op)
        dst_dataset._frame_collection.update_many({}, cleanup_op)

    # Reload docs
    fos.Sample._reload_docs(dst_dataset._sample_collection_name)
    if is_video:
        fofr.Frame._reload_docs(dst_dataset._frame_collection_name)


def _merge_docs(
    sample_collection,
    merge_lists=True,
    fields=None,
    omit_fields=None,
    delete_fields=None,
    overwrite=False,
    frames=False,
):
    if frames:
        schema = sample_collection.get_frame_field_schema()
    else:
        schema = sample_collection.get_field_schema()

    if merge_lists:
        list_fields = []
        elem_fields = []
        for field, field_type in schema.items():
            if fields is not None and field not in fields:
                continue

            if omit_fields is not None and field in omit_fields:
                continue

            if isinstance(field_type, fof.ListField):
                root = fields[field] if fields is not None else field
                list_fields.append(root)
            elif isinstance(
                field_type, fof.EmbeddedDocumentField
            ) and issubclass(field_type.document_type, fol._LABEL_LIST_FIELDS):
                root = fields[field] if fields is not None else field
                elem_fields.append(
                    root + "." + field_type.document_type._LABEL_LIST_FIELD
                )
    else:
        list_fields = None
        elem_fields = None

    if overwrite:
        root_doc = "$$ROOT"

        if delete_fields:
            cond = {
                "$and": [
                    {"$ne": ["$$item.v", None]},
                    {"$not": {"$in": ["$$item.k", list(delete_fields)]}},
                ]
            }
        else:
            cond = {"$ne": ["$$item.v", None]}

        new_doc = {
            "$arrayToObject": {
                "$filter": {
                    "input": {"$objectToArray": "$$new"},
                    "as": "item",
                    "cond": cond,
                }
            }
        }

        docs = [root_doc, new_doc]
    else:
        if delete_fields:
            new_doc = {
                "$arrayToObject": {
                    "$filter": {
                        "input": {"$objectToArray": "$$new"},
                        "as": "item",
                        "cond": {
                            "$not": {"$in": ["$$item.k", list(delete_fields)]}
                        },
                    }
                }
            }
        else:
            new_doc = "$$new"

        root_doc = {
            "$arrayToObject": {
                "$filter": {
                    "input": {"$objectToArray": "$$ROOT"},
                    "as": "item",
                    "cond": {"$ne": ["$$item.v", None]},
                }
            }
        }

        docs = [new_doc, root_doc]

    if list_fields or elem_fields:
        doc = {}

        if list_fields:
            for list_field in list_fields:
                _merge_list_field(doc, list_field)

        if elem_fields:
            for elem_field in elem_fields:
                _merge_label_list_field(doc, elem_field, overwrite=overwrite)

        docs.append(doc)

    return [{"$replaceWith": {"$mergeObjects": docs}}]


def _merge_list_field(doc, list_field):
    doc[list_field] = {
        "$switch": {
            "branches": [
                {
                    "case": {"$not": {"$gt": ["$" + list_field, None]}},
                    "then": "$$new." + list_field,
                },
                {
                    "case": {"$not": {"$gt": ["$$new." + list_field, None]}},
                    "then": "$" + list_field,
                },
            ],
            "default": {
                "$concatArrays": [
                    "$" + list_field,
                    {
                        "$filter": {
                            "input": "$$new." + list_field,
                            "as": "this",
                            "cond": {
                                "$not": {"$in": ["$$this", "$" + list_field]}
                            },
                        }
                    },
                ]
            },
        }
    }


def _merge_label_list_field(doc, elem_field, overwrite=False):
    field, leaf = elem_field.split(".")

    if overwrite:
        root = "$$new." + field
        elements = {
            "$reverseArray": {
                "$let": {
                    "vars": {
                        "new_ids": {
                            "$map": {
                                "input": "$$new." + elem_field,
                                "as": "this",
                                "in": "$$this._id",
                            },
                        },
                    },
                    "in": {
                        "$reduce": {
                            "input": {"$reverseArray": "$" + elem_field},
                            "initialValue": {
                                "$reverseArray": "$$new." + elem_field
                            },
                            "in": {
                                "$cond": {
                                    "if": {
                                        "$not": {
                                            "$in": ["$$this._id", "$$new_ids"]
                                        }
                                    },
                                    "then": {
                                        "$concatArrays": [
                                            "$$value",
                                            ["$$this"],
                                        ]
                                    },
                                    "else": "$$value",
                                }
                            },
                        }
                    },
                }
            }
        }
    else:
        root = "$" + field
        elements = {
            "$let": {
                "vars": {
                    "existing_ids": {
                        "$map": {
                            "input": "$" + elem_field,
                            "as": "this",
                            "in": "$$this._id",
                        },
                    },
                },
                "in": {
                    "$reduce": {
                        "input": "$$new." + elem_field,
                        "initialValue": "$" + elem_field,
                        "in": {
                            "$cond": {
                                "if": {
                                    "$not": {
                                        "$in": ["$$this._id", "$$existing_ids"]
                                    }
                                },
                                "then": {
                                    "$concatArrays": ["$$value", ["$$this"]]
                                },
                                "else": "$$value",
                            }
                        },
                    }
                },
            }
        }

    doc[field] = {
        "$switch": {
            "branches": [
                {
                    "case": {"$not": {"$gt": ["$" + field, None]}},
                    "then": "$$new." + field,
                },
                {
                    "case": {"$not": {"$gt": ["$$new." + field, None]}},
                    "then": "$" + field,
                },
            ],
            "default": {"$mergeObjects": [root, {leaf: elements}]},
        }
    }


def _index_frames(sample_collection, key_field, frame_key_field):
    ids, keys, all_sample_ids = sample_collection.values(
        ["_id", key_field, "frames._sample_id"]
    )
    keys_map = {k: v for k, v in zip(ids, keys)}

    frame_keys = []
    for sample_ids in all_sample_ids:
        if sample_ids:
            sample_keys = [keys_map[_id] for _id in sample_ids]
        else:
            sample_keys = sample_ids

        frame_keys.append(sample_keys)

    sample_collection.set_values(
        "frames." + frame_key_field,
        frame_keys,
        expand_schema=False,
        _allow_missing=True,
    )


def _always_select_field(sample_collection, field):
    if not isinstance(sample_collection, fov.DatasetView):
        return sample_collection

    view = sample_collection

    if not any(isinstance(stage, fost.SelectFields) for stage in view._stages):
        return view

    # Manually insert `field` into all `SelectFields` stages
    _view = view._base_view
    for stage in view._stages:
        if isinstance(stage, fost.SelectFields):
            stage = fost.SelectFields(
                stage.field_names + [field], _allow_missing=True
            )

        _view = _view.add_stage(stage)

    return _view


def _finalize_frames(sample_collection, key_field, frame_key_field):
    results = sample_collection.values([key_field, "_id"])
    ids_map = {k: v for k, v in zip(*results)}

    frame_coll = sample_collection._frame_collection

    ops = [
        UpdateMany(
            {frame_key_field: key}, {"$set": {"_sample_id": ids_map[key]}}
        )
        for key in frame_coll.distinct(frame_key_field)
    ]

    foo.bulk_write(ops, frame_coll)


def _get_sample_ids(samples_or_ids):
    if etau.is_str(samples_or_ids):
        return [samples_or_ids]

    if isinstance(samples_or_ids, (fos.Sample, fos.SampleView)):
        return [samples_or_ids.id]

    if isinstance(samples_or_ids, foc.SampleCollection):
        return samples_or_ids.values("id")

    if isinstance(samples_or_ids, np.ndarray):
        return list(samples_or_ids)

    if not samples_or_ids:
        return []

    if isinstance(next(iter(samples_or_ids)), (fos.Sample, fos.SampleView)):
        return [s.id for s in samples_or_ids]

    return list(samples_or_ids)


def _parse_fields(field_names):
    if etau.is_str(field_names):
        field_names = [field_names]

    fields = [f for f in field_names if "." not in f]
    embedded_fields = [f for f in field_names if "." in f]
    return fields, embedded_fields


def _parse_field_mapping(field_mapping):
    fields = []
    new_fields = []
    embedded_fields = []
    embedded_new_fields = []
    for field, new_field in field_mapping.items():
        if "." in field or "." in new_field:
            embedded_fields.append(field)
            embedded_new_fields.append(new_field)
        else:
            fields.append(field)
            new_fields.append(new_field)

    return fields, new_fields, embedded_fields, embedded_new_fields


def _extract_archive_if_necessary(archive_path, cleanup):
    dataset_dir = etau.split_archive(archive_path)[0]

    if not os.path.isdir(dataset_dir):
        outdir = os.path.dirname(dataset_dir)
        etau.extract_archive(
            archive_path, outdir=outdir, delete_archive=cleanup
        )

        if not os.path.isdir(dataset_dir):
            raise ValueError(
                "Expected to find a directory '%s' after extracting '%s', "
                "but it was not found" % (dataset_dir, archive_path)
            )
    else:
        logger.info(
            "Assuming '%s' contains the extracted contents of '%s'",
            dataset_dir,
            archive_path,
        )

    return dataset_dir
