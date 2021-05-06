"""
FiftyOne datasets.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import datetime
import fnmatch
import inspect
import logging
import numbers
import os
import random
import string

from bson import ObjectId
from deprecated import deprecated
import mongoengine.errors as moe
from pymongo import UpdateMany, UpdateOne
from pymongo.errors import BulkWriteError

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.aggregations as foa
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
import fiftyone.core.stages as fost
from fiftyone.core.singletons import DatasetSingleton
import fiftyone.core.view as fov
import fiftyone.core.utils as fou
import fiftyone.types as fot

foud = fou.lazy_import("fiftyone.utils.data")


logger = logging.getLogger(__name__)


def list_datasets():
    """Returns the list of available FiftyOne datasets.

    Returns:
        a list of :class:`Dataset` names
    """
    # pylint: disable=no-member
    return sorted(foo.DatasetDocument.objects.distinct("name"))


def dataset_exists(name):
    """Checks if the dataset exists.

    Args:
        name: the name of the dataset

    Returns:
        True/False
    """
    try:
        # pylint: disable=no-member
        foo.DatasetDocument.objects.get(name=name)
        return True
    except moe.DoesNotExist:
        return False


def load_dataset(name):
    """Loads the FiftyOne dataset with the given name.

    Note that :class:`Dataset` instances are singletons keyed by ``name``, so
    all calls to this function with a given dataset ``name`` in a program will
    return the same object.

    To create a new dataset, use the :class:`Dataset` constructor.

    Args:
        name: the name of the dataset

    Returns:
        a :class:`Dataset`

    Raises:
        ValueError: if no dataset exists with the given name
    """
    return Dataset(name, _create=False)


def get_default_dataset_name():
    """Returns a default dataset name based on the current time.

    Returns:
        a dataset name
    """
    now = datetime.datetime.now()
    name = now.strftime("%Y.%m.%d.%H.%M.%S")
    if name in list_datasets():
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
    dataset_names = list_datasets()

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

    If reference to the dataset exists in memory, only `Dataset.name` and
    `Dataset.deleted` will be valid attributes. Accessing any other attributes
    or methods will raise a :class:`DatasetError`

    If reference to a sample exists in memory, the sample's dataset will be
    "unset" such that `sample.in_dataset == False`

    Args:
        name: the name of the dataset
        verbose (False): whether to log the name of the deleted dataset

    Raises:
        ValueError: if the dataset is not found
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
    all_datasets = list_datasets()
    for name in fnmatch.filter(all_datasets, glob_patt):
        delete_dataset(name, verbose=verbose)


def delete_non_persistent_datasets(verbose=False):
    """Deletes all non-persistent datasets.

    Args:
        verbose (False): whether to log the names of deleted datasets
    """
    for name in list_datasets():
        dataset = Dataset(name, _create=False, _migrate=False)
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

    See https://voxel51.com/docs/fiftyone/user_guide/basics.html for an
    overview of working with FiftyOne datasets.

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
        _migrate=True,
    ):
        if name is None and _create:
            name = get_default_dataset_name()

        if overwrite and dataset_exists(name):
            delete_dataset(name)

        if _create:
            (
                self._doc,
                self._sample_doc_cls,
                self._frame_doc_cls,
            ) = _create_dataset(name, persistent=persistent)
        else:
            (
                self._doc,
                self._sample_doc_cls,
                self._frame_doc_cls,
            ) = _load_dataset(name, migrate=_migrate)

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
    def media_type(self):
        """The media type of the dataset."""
        return self._doc.media_type

    @media_type.setter
    def media_type(self, media_type):
        if self:
            raise ValueError("Cannot set media type of a non-empty dataset")

        if media_type not in fom.MEDIA_TYPES:
            raise ValueError(
                'media_type can only be one of %s; received "%s"'
                % (fom.MEDIA_TYPES, media_type)
            )

        self._doc.media_type = media_type

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
        try:
            self._doc.name = name
            self._doc.save()
        except:
            self._doc.name = _name
            raise

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
            rendered as invislble in the App.

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
            rendered as invislble in the App.

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
            "Name:           %s" % self.name,
            "Media type:     %s" % self.media_type,
            "Num samples:    %d" % aggs[0],
            "Persistent:     %s" % self.persistent,
            "Tags:           %s" % aggs[1],
            "Sample fields:",
            self._to_fields_str(self.get_field_schema()),
        ]

        if self.media_type == fom.VIDEO:
            elements.extend(
                [
                    "Frame fields:",
                    self._to_fields_str(self.get_frame_field_schema()),
                ]
            )

        return "\n".join(elements)

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

        Raises:
            ValueError: if the dataset is empty
        """
        return super().first()

    def last(self):
        """Returns the last sample in the dataset.

        Returns:
            a :class:`fiftyone.core.sample.Sample`

        Raises:
            ValueError: if the dataset is empty
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

    @classmethod
    def get_default_sample_fields(cls, include_private=False):
        """Gets the default fields present on all :class:`Dataset` instances.

        Args:
            include_private (False): whether or not to return fields prefixed
                with a ``_``

        Returns:
            a tuple of field names
        """
        return fos.get_default_sample_fields(include_private=include_private)

    @classmethod
    def get_default_frame_fields(cls, include_private=False):
        """Gets the default fields present on all
        :class:`fiftyone.core.frame.Frame` instances.

        Args:
            include_private (False): whether or not to return fields prefixed
                with a ``_``

        Returns:
            a tuple of field names
        """
        return fofr.get_default_frame_fields(include_private=include_private)

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
        d = self._sample_doc_cls.get_field_schema(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            include_private=include_private,
        )

        if not include_private and (self.media_type == fom.VIDEO):
            d.pop("frames", None)

        return d

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
        self, field_name, ftype, embedded_doc_type=None, subfield=None
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
        )
        self._reload()

    def _add_sample_field_if_necessary(
        self, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        field_kwargs = dict(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
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
        self, field_name, ftype, embedded_doc_type=None, subfield=None
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
        )
        self._reload()

    def _add_frame_field_if_necessary(
        self, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        field_kwargs = dict(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
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
            self._frame_doc_cls._rename_fields(
                fields, new_fields, are_frame_fields=True
            )
            fofr.Frame._rename_fields(
                self._frame_collection_name, fields, new_fields
            )

        if embedded_fields:
            sample_collection = self if view is None else view
            self._frame_doc_cls._rename_embedded_fields(
                embedded_fields, embedded_new_fields, sample_collection
            )
            fofr.Frame._reload_docs(self._frame_collection_name)

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

                0: raise error if a top-level field cannot be deleted
                1: log warning if a top-level field cannot be deleted
                2: ignore top-level fields that cannot be deleted
        """
        self._delete_sample_fields(field_name, error_level)

    def delete_sample_fields(self, field_names, error_level=0):
        """Deletes the fields from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        fields.

        Args:
            field_names: the field name or iterable of field names
            error_level (0): the error level to use. Valid values are:

                0: raise error if a top-level field cannot be deleted
                1: log warning if a top-level field cannot be deleted
                2: ignore top-level fields that cannot be deleted
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

                0: raise error if a top-level field cannot be deleted
                1: log warning if a top-level field cannot be deleted
                2: ignore top-level fields that cannot be deleted
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

                0: raise error if a top-level field cannot be deleted
                1: log warning if a top-level field cannot be deleted
                2: ignore top-level fields that cannot be deleted
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

    def _delete_frame_fields(self, field_names, error_level):
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        fields, embedded_fields = _parse_fields(field_names)

        if fields:
            self._frame_doc_cls._delete_fields(
                fields, are_frame_fields=True, error_level=error_level
            )
            fofr.Frame._purge_fields(self._frame_collection_name, fields)

        if embedded_fields:
            self._frame_doc_cls._delete_embedded_fields(embedded_fields)
            fofr.Frame._reload_docs(self._frame_collection_name)

    def iter_samples(self, batch_size=None):
        """Returns an iterator over the samples in the dataset.

        batch_size (None): an optional batch size

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for d in self._aggregate(detach_frames=True, batch_size=batch_size):
            doc = self._sample_dict_to_doc(d)
            sample = fos.Sample.from_doc(doc, dataset=self)

            yield sample

    def add_sample(self, sample, expand_schema=True):
        """Adds the given sample to the dataset.

        If the sample instance does not belong to a dataset, it is updated
        in-place to reflect its membership in this dataset. If the sample
        instance belongs to another dataset, it is not modified.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if the sample's schema is not a subset of the dataset schema

        Returns:
            the ID of the sample in the dataset

        Raises:
            ``mongoengine.errors.ValidationError``: if a field of the sample
                has a type that is inconsistent with the dataset schema, or if
                ``expand_schema == False`` and a new field is encountered
        """
        if sample._in_db:
            sample = sample.copy()

        if self.media_type is None:
            self.media_type = sample.media_type

        if expand_schema:
            self._expand_schema([sample])

        self._validate_sample(sample)

        d = sample.to_mongo_dict()
        self._sample_collection.insert_one(d)  # adds `_id` to `d`

        doc = self._sample_dict_to_doc(d)
        sample._set_backing_doc(doc, dataset=self)

        if self.media_type == fom.VIDEO:
            sample.frames.save()

        return str(d["_id"])

    def add_samples(self, samples, expand_schema=True, num_samples=None):
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
            num_samples (None): the number of samples in ``samples``. If not
                provided, this is computed via ``len(samples)``, if possible.
                This value is optional and is used only for optimization and
                progress tracking

        Returns:
            a list of IDs of the samples in the dataset

        Raises:
            ``mongoengine.errors.ValidationError``: if a field of a sample has
                a type that is inconsistent with the dataset schema, or if
                ``expand_schema == False`` and a new field is encountered
        """
        if num_samples is None:
            try:
                num_samples = len(samples)
            except:
                pass

        # @todo optimize adjust dynamically based on sample save time
        batch_size = 128 if self.media_type == fom.IMAGE else 1

        sample_ids = []
        with fou.ProgressBar(total=num_samples) as pb:
            for batch in fou.iter_batches(samples, batch_size):
                sample_ids.extend(
                    self._add_samples_batch(batch, expand_schema)
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
            omit_none_fields=False,
            skip_existing=True,
            insert_new=True,
            include_info=include_info,
            overwrite_info=overwrite_info,
        )
        return self.skip(num_samples).values("id")

    def _add_samples_batch(self, samples, expand_schema):
        samples = [s.copy() if s._in_db else s for s in samples]

        if self.media_type is None and samples:
            self.media_type = samples[0].media_type

        if expand_schema:
            self._expand_schema(samples)

        for sample in samples:
            self._validate_sample(sample)

        dicts = [sample.to_mongo_dict() for sample in samples]

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
        self, doc, expand_schema=True, merge_info=True, overwrite_info=False
    ):
        _merge_dataset_doc(
            self,
            doc,
            expand_schema=expand_schema,
            merge_info=merge_info,
            overwrite_info=overwrite_info,
        )

    def merge_samples(
        self,
        samples,
        key_field="filepath",
        key_fcn=None,
        omit_none_fields=True,
        skip_existing=False,
        insert_new=True,
        expand_schema=True,
        omit_default_fields=False,
        overwrite=True,
        include_info=True,
        overwrite_info=False,
    ):
        """Merges the given samples into this dataset.

        By default, samples with the same absolute ``filepath`` are merged.
        You can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        Args:
            samples: an iterable of :class:`fiftyone.core.sample.Sample`
                instances or a
                :class:`fiftyone.core.collections.SampleCollection`
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            key_fcn (None): a function that accepts a
                :class:`fiftyone.core.sample.Sample` instance and computes a
                key to decide if two samples should be merged. If a ``key_fcn``
                is provided, ``key_field`` is ignored
            omit_none_fields (True): whether to omit ``None``-valued fields of
                the provided samples when merging their fields
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            omit_default_fields (False): whether to omit default sample fields
                when merging. If ``True``, ``insert_new`` must be ``False``
            overwrite (True): whether to overwrite (True) or skip (False)
                existing sample fields
            include_info (True): whether to merge dataset-level information
                such as ``info`` and ``classes``. Only applicable when
                ``samples`` is a
                :class:`fiftyone.core.collections.SampleCollection`
            overwrite_info (False): whether to overwrite existing dataset-level
                information. Only applicable when ``samples`` is a
                :class:`fiftyone.core.collections.SampleCollection` and
                ``include_info`` is True
        """
        # Use efficient implementation when possible
        if (
            isinstance(samples, foc.SampleCollection)
            and key_fcn is None
            and overwrite
        ):
            _merge_samples(
                samples,
                self,
                key_field,
                omit_none_fields=omit_none_fields,
                skip_existing=skip_existing,
                insert_new=insert_new,
                expand_schema=expand_schema,
                omit_default_fields=omit_default_fields,
                include_info=include_info,
                overwrite_info=overwrite_info,
            )
            return

        if omit_default_fields:
            if insert_new:
                raise ValueError(
                    "Cannot omit default fields when `insert_new=True`"
                )

            omit_fields = fos.get_default_sample_fields()
        else:
            omit_fields = None

        if isinstance(samples, foc.SampleCollection):
            _merge_dataset_doc(
                self,
                samples,
                expand_schema=expand_schema,
                merge_info=include_info,
                overwrite_info=overwrite_info,
            )

        if key_fcn is None:
            aggs = [foa.Values(key_field), foa.Values("id")]
            id_map = {key: _id for key, _id in zip(*self.aggregate(aggs))}
            key_fcn = lambda sample: sample[key_field]
        else:
            id_map = {}
            logger.info("Indexing dataset...")
            with fou.ProgressBar() as pb:
                for sample in pb(self):
                    id_map[key_fcn(sample)] = sample.id

        logger.info("Merging samples...")
        with fou.ProgressBar() as pb:
            for sample in pb(samples):
                key = key_fcn(sample)
                if key in id_map:
                    if not skip_existing:
                        existing_sample = self[id_map[key]]
                        existing_sample.merge(
                            sample,
                            omit_fields=omit_fields,
                            omit_none_fields=omit_none_fields,
                            overwrite=overwrite,
                            expand_schema=expand_schema,
                        )
                        existing_sample.save()
                elif insert_new:
                    self.add_sample(sample, expand_schema=expand_schema)

    def delete_samples(self, samples_or_ids):
        """Deletes the given sample(s) from the dataset.

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.

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
        _sample_ids = [ObjectId(_id) for _id in sample_ids]

        self._sample_collection.delete_many({"_id": {"$in": _sample_ids}})

        fos.Sample._reset_docs(
            self._sample_collection_name, sample_ids=sample_ids
        )

        if self.media_type == fom.VIDEO:
            self._frame_collection.delete_many(
                {"_sample_id": {"$in": _sample_ids}}
            )

            fofr.Frame._reset_docs(
                self._frame_collection_name, sample_ids=sample_ids
            )

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

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.

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

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.

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

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.
        """
        self._sample_doc_cls.drop_collection()
        fos.Sample._reset_docs(self._sample_collection_name)

        self._frame_doc_cls.drop_collection()
        fofr.Frame._reset_docs(self._frame_collection_name)

    def delete(self):
        """Deletes the dataset.

        Once deleted, only the ``name`` and ``deleted`` attributes of a dataset
        may be accessed.

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.
        """
        self.clear()
        _delete_dataset_doc(self._doc)
        self._deleted = True

    def add_dir(
        self,
        dataset_dir,
        dataset_type,
        label_field="ground_truth",
        tags=None,
        expand_schema=True,
        add_info=True,
        **kwargs
    ):
        """Adds the contents of the given directory to the dataset.

        See :doc:`this guide </user_guide/dataset_creation/datasets>` for
        descriptions of available dataset types.

        Args:
            dataset_dir: the dataset directory
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type of the
                dataset in ``dataset_dir``
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            add_info (True): whether to add dataset info from the importer (if
                any) to the dataset's ``info``
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type`` via the syntax
                ``DatasetImporter(dataset_dir, **kwargs)``

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if inspect.isclass(dataset_type):
            dataset_type = dataset_type()

        # If the input dataset contains TFRecords, they must be unpacked into a
        # temporary directory during conversion
        if (
            isinstance(
                dataset_type,
                (
                    fot.TFImageClassificationDataset,
                    fot.TFObjectDetectionDataset,
                ),
            )
            and "images_dir" not in kwargs
        ):
            images_dir = get_default_dataset_dir(self.name)
            logger.info("Unpacking images to '%s'", images_dir)
            kwargs["images_dir"] = images_dir

        dataset_importer_cls = dataset_type.get_dataset_importer_cls()

        try:
            dataset_importer = dataset_importer_cls(dataset_dir, **kwargs)
        except Exception as e:
            importer_name = dataset_importer_cls.__name__
            raise ValueError(
                "Failed to construct importer using syntax "
                "%s(dataset_dir, **kwargs); you may need to supply mandatory "
                "arguments to the constructor via `kwargs`. Please consult "
                "the documentation of `%s` to learn more"
                % (importer_name, etau.get_class_name(dataset_importer_cls))
            ) from e

        return self.add_importer(
            dataset_importer,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            add_info=add_info,
        )

    def add_archive(
        self,
        archive_path,
        dataset_type,
        cleanup=True,
        label_field="ground_truth",
        tags=None,
        expand_schema=True,
        add_info=True,
        **kwargs
    ):
        """Adds the contents of the given archive to the dataset.

        If the archive does not exist but a dataset with the same root name
        does exist, it is assumed that this directory contains the extracted
        contents of the archive.

        See :doc:`this guide </user_guide/dataset_creation/datasets>` for
        descriptions of available dataset types.

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
            cleanup (True): whether to delete the archive after extracting it
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            add_info (True): whether to add dataset info from the importer (if
                any) to the dataset's ``info``
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type`` via the syntax
                ``DatasetImporter(dataset_dir, **kwargs)``

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        dataset_dir = etau.split_archive(archive_path)[0]
        if os.path.isfile(archive_path) or not os.path.isdir(dataset_dir):
            etau.extract_archive(
                archive_path, outdir=dataset_dir, delete_archive=cleanup
            )

        return self.add_dir(
            dataset_dir,
            dataset_type,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            add_info=add_info,
            **kwargs,
        )

    def add_importer(
        self,
        dataset_importer,
        label_field="ground_truth",
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
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
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

    def add_images(self, samples, sample_parser=None, tags=None):
        """Adds the given images to the dataset.

        This operation does not read the images.

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding images to a dataset by defining your own
        :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`.

        Args:
            samples: an iterable of data. If no ``sample_parser`` is provided,
                this must be an iterable of image paths. If a ``sample_parser``
                is provided, this can be an arbitrary iterable whose elements
                can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse ``samples``
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if sample_parser is None:
            sample_parser = foud.ImageSampleParser()

        return foud.add_images(self, samples, sample_parser, tags=tags)

    def add_labeled_images(
        self,
        samples,
        sample_parser,
        label_field="ground_truth",
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
                instance to use to parse ``samples``
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
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
        samples,
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
            samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of image paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse ``samples``
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
            dataset_dir, samples, sample_parser, image_format=image_format,
        )

        return self.add_importer(dataset_ingestor, tags=tags)

    def ingest_labeled_images(
        self,
        samples,
        sample_parser,
        label_field="ground_truth",
        tags=None,
        expand_schema=True,
        dataset_dir=None,
        skip_unlabeled=False,
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
                instance to use to parse ``samples``
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if the sample's schema is not a subset of the dataset schema
            dataset_dir (None): the directory in which the images will be
                written. By default, :func:`get_default_dataset_dir` is used
            skip_unlabeled (False): whether to skip unlabeled images when
                importing
            image_format (None): the image format to use to write the images to
                disk. By default, ``fiftyone.config.default_image_ext`` is used

        Returns:
            a list of IDs of the samples in the dataset
        """
        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.LabeledImageDatasetIngestor(
            dataset_dir,
            samples,
            sample_parser,
            skip_unlabeled=skip_unlabeled,
            image_format=image_format,
        )

        return self.add_importer(
            dataset_ingestor,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
        )

    def add_videos(self, samples, sample_parser=None, tags=None):
        """Adds the given videos to the dataset.

        This operation does not read the videos.

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding videos to a dataset by defining your own
        :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`.

        Args:
            samples: an iterable of data. If no ``sample_parser`` is provided,
                this must be an iterable of video paths. If a ``sample_parser``
                is provided, this can be an arbitrary iterable whose elements
                can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse ``samples``
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if sample_parser is None:
            sample_parser = foud.VideoSampleParser()

        return foud.add_videos(self, samples, sample_parser, tags=tags)

    def add_labeled_videos(
        self,
        samples,
        sample_parser,
        label_field="ground_truth",
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
                instance to use to parse ``samples``
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
        self, samples, sample_parser=None, tags=None, dataset_dir=None,
    ):
        """Ingests the given iterable of videos into the dataset.

        The videos are copied to ``dataset_dir``.

        See :ref:`this guide <custom-sample-parser>` for more details about
        ingesting videos into a dataset by defining your own
        :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`.

        Args:
            samples: an iterable of data. If no ``sample_parser`` is provided,
                this must be an iterable of video paths. If a ``sample_parser``
                is provided, this can be an arbitrary iterable whose elements
                can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse ``samples``
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
            dataset_dir, samples, sample_parser
        )

        return self.add_importer(dataset_ingestor, tags=tags)

    def ingest_labeled_videos(
        self,
        samples,
        sample_parser,
        tags=None,
        expand_schema=True,
        dataset_dir=None,
        skip_unlabeled=False,
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
                instance to use to parse ``samples``
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if the sample's schema is not a subset of the dataset schema
            dataset_dir (None): the directory in which the videos will be
                written. By default, :func:`get_default_dataset_dir` is used
            skip_unlabeled (False): whether to skip unlabeled videos when
                importing

        Returns:
            a list of IDs of the samples in the dataset
        """
        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.LabeledVideoDatasetIngestor(
            dataset_dir, samples, sample_parser, skip_unlabeled=skip_unlabeled,
        )

        return self.add_importer(
            dataset_ingestor, tags=tags, expand_schema=expand_schema
        )

    @classmethod
    def from_dir(
        cls,
        dataset_dir,
        dataset_type,
        name=None,
        label_field="ground_truth",
        tags=None,
        **kwargs
    ):
        """Creates a :class:`Dataset` from the contents of the given directory.

        See :doc:`this guide </user_guide/dataset_creation/datasets>` for
        descriptions of available dataset types.

        Args:
            dataset_dir: the dataset directory
            dataset_type: the :class:`fiftyone.types.dataset_types.Dataset`
                type of the dataset in ``dataset_dir``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type`` via the syntax
                ``DatasetImporter(dataset_dir, **kwargs)``

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_dir(
            dataset_dir,
            dataset_type,
            label_field=label_field,
            tags=tags,
            **kwargs,
        )
        return dataset

    @classmethod
    def from_archive(
        cls,
        archive_path,
        dataset_type,
        cleanup=True,
        name=None,
        label_field="ground_truth",
        tags=None,
        **kwargs
    ):
        """Creates a :class:`Dataset` from the contents of the given archive.

        If the archive does not exist but a dataset with the same root name
        does exist, it is assumed that this directory contains the extracted
        contents of the archive.

        See :doc:`this guide </user_guide/dataset_creation/datasets>` for
        descriptions of available dataset types.

        .. note::

            The following archive formats are explicitly supported::

                .zip, .tar, .tar.gz, .tgz, .tar.bz, .tbz

            If an archive *not* in the above list is found, extraction will be
            attempted via the ``patool`` package, which supports many formats
            but may require that additional system packages be installed.

        Args:
            archive_path: the path to an archive of a dataset directory
            dataset_type: the :class:`fiftyone.types.dataset_types.Dataset`
                type of the dataset in ``archive_path``
            cleanup (True): whether to delete the archive after extracting it
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type`` via the syntax
                ``DatasetImporter(dataset_dir, **kwargs)``

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_archive(
            archive_path,
            dataset_type,
            cleanup=cleanup,
            label_field=label_field,
            tags=tags,
            **kwargs,
        )
        return dataset

    @classmethod
    def from_importer(
        cls, dataset_importer, name=None, label_field="ground_truth", tags=None
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
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
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
    def from_images(cls, samples, sample_parser, name=None, tags=None):
        """Creates a :class:`Dataset` from the given images.

        This operation does not read the images.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`
        to load image samples into FiftyOne.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse ``samples``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_images(samples, sample_parser, tags=tags)
        return dataset

    @classmethod
    def from_labeled_images(
        cls,
        samples,
        sample_parser,
        name=None,
        label_field="ground_truth",
        tags=None,
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
                instance to use to parse ``samples``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels
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
    def from_videos(cls, samples, sample_parser, name=None, tags=None):
        """Creates a :class:`Dataset` from the given videos.

        This operation does not read/decode the videos.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`
        to load video samples into FiftyOne.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.UnlabeledVideoSampleParser`
                instance to use to parse ``samples``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_videos(samples, sample_parser, tags=tags)
        return dataset

    @classmethod
    def from_labeled_videos(
        cls, samples, sample_parser, name=None, tags=None,
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
                instance to use to parse ``samples``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_labeled_videos(samples, sample_parser, tags=tags)
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

    def list_indexes(self, include_private=False):
        """Returns the fields of the dataset that are indexed.

        Args:
            include_private (False): whether to include private fields that
                start with ``_``

        Returns:
            a list of field names
        """
        index_info = self._sample_collection.index_information()
        index_fields = [v["key"][0][0] for v in index_info.values()]

        if include_private:
            return index_fields

        return [f for f in index_fields if not f.startswith("_")]

    def create_index(self, field_name, unique=False, sphere2d=False):
        """Creates an index on the given field.

        If the given field already has a unique index, it will be retained
        regardless of the ``unique`` value you specify.

        If the given field already has a non-unique index but you requested a
        unique index, the existing index will be dropped.

        Indexes enable efficient sorting, merging, and other such operations.

        Args:
            field_name: the field name or ``embedded.field.name``
            unique (False): whether to add a uniqueness constraint to the index
            sphere2d (False): whether the field is a GeoJSON field that
                requires a sphere2d index
        """
        root = field_name.split(".", 1)[0]

        if root not in self.get_field_schema(include_private=True):
            raise ValueError("Dataset has no field '%s'" % root)

        index_info = self._sample_collection.index_information()
        index_map = {
            v["key"][0][0]: v.get("unique", False) for v in index_info.values()
        }
        if field_name in index_map:
            _unique = index_map[field_name]
            if _unique or (unique == _unique):
                # Satisfactory index already exists
                return

            # Must drop existing index
            self.drop_index(field_name)

        if sphere2d:
            index_spec = [(field_name, "2dsphere")]
        else:
            index_spec = field_name

        self._sample_collection.create_index(index_spec, unique=unique)

    def drop_index(self, field_name):
        """Drops the index on the given field.

        Args:
            field_name: the field name or ``embedded.field.name``
        """
        index_info = self._sample_collection.index_information()
        index_map = {v["key"][0][0]: k for k, v in index_info.items()}

        if field_name not in index_map:
            if ("." not in field_name) and (
                field_name not in self.get_field_schema()
            ):
                raise ValueError("Dataset has no field '%s'" % field_name)

            raise ValueError("Dataset field '%s' is not indexed" % field_name)

        self._sample_collection.drop_index(index_map[field_name])

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
            _pipeline = [
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
        else:
            _pipeline = []

        if pipeline is not None:
            _pipeline += pipeline

        if detach_frames:
            _pipeline += [{"$project": {"frames": False}}]
        elif frames_only:
            _pipeline += [
                {"$project": {"frames": True}},
                {"$unwind": "$frames"},
                {"$replaceRoot": {"newRoot": "$frames"}},
            ]

        return _pipeline

    def _aggregate(
        self,
        pipeline=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
        batch_size=None,
    ):
        _pipeline = self._pipeline(
            pipeline=pipeline,
            attach_frames=attach_frames,
            detach_frames=detach_frames,
            frames_only=frames_only,
        )

        return foo.aggregate(
            self._sample_collection, _pipeline, batch_size=batch_size
        )

    @property
    def _sample_collection_name(self):
        return self._sample_doc_cls._meta["collection"]

    @property
    def _sample_collection(self):
        return foo.get_db_conn()[self._sample_collection_name]

    @property
    def _frame_collection_name(self):
        return "frames." + self._sample_collection_name

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
        fields = self.get_field_schema(include_private=True)
        for sample in samples:
            self._validate_media_type(sample)

            if self.media_type == fom.VIDEO:
                self._expand_frame_schema(sample.frames)

            for field_name in sample._get_field_names(include_private=True):
                if field_name == "_id":
                    continue

                if field_name in fields:
                    continue

                if field_name == "frames" and self.media_type == fom.VIDEO:
                    continue

                value = sample[field_name]
                if value is None:
                    continue

                self._sample_doc_cls.add_implied_field(field_name, value)
                fields = self.get_field_schema(include_private=True)

        self._reload()

    def _expand_frame_schema(self, frames):
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

        return fields

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

    def _to_fields_str(self, field_schema):
        max_len = max([len(field_name) for field_name in field_schema]) + 1
        return "\n".join(
            "    %s %s" % ((field_name + ":").ljust(max_len), str(field))
            for field_name, field in field_schema.items()
        )

    def _validate_sample(self, sample):
        fields = self.get_field_schema(include_private=True)

        non_existent_fields = {
            fn for fn in sample.field_names if fn not in fields
        }

        if self.media_type == fom.VIDEO:
            non_existent_fields.discard("frames")

        if non_existent_fields:
            msg = "The fields %s do not exist on the dataset '%s'" % (
                non_existent_fields,
                self.name,
            )
            raise moe.FieldDoesNotExist(msg)

        for field_name, value in sample.iter_fields():
            field = fields[field_name]
            if field_name == "frames" and self.media_type == fom.VIDEO:
                continue

            if value is None and field.null:
                continue

            field.validate(value)

    def reload(self):
        """Reloads the dataset and any in-memory samples from the database."""
        self._reload(hard=True)
        self._reload_docs(hard=True)

    def _reload(self, hard=False):
        if not hard:
            self._doc.reload()
            return

        (
            self._doc,
            self._sample_doc_cls,
            self._frame_doc_cls,
        ) = _load_dataset(self.name, migrate=False)

    def _reload_docs(self, hard=False):
        fos.Sample._reload_docs(self._sample_collection_name, hard=hard)

        if self.media_type == fom.VIDEO:
            fofr.Frame._reload_docs(self._frame_collection_name, hard=hard)


def _get_random_characters(n):
    return "".join(
        random.choice(string.ascii_lowercase + string.digits) for _ in range(n)
    )


def _create_dataset(name, persistent=False, media_type=None):
    if dataset_exists(name):
        raise ValueError(
            (
                "Dataset '%s' already exists; use `fiftyone.load_dataset()` "
                "to load an existing dataset"
            )
            % name
        )

    sample_collection_name = _make_sample_collection_name()
    sample_doc_cls = _create_sample_document_cls(sample_collection_name)

    frame_collection_name = "frames." + sample_collection_name
    frame_doc_cls = _create_frame_document_cls(frame_collection_name)

    dataset_doc = foo.DatasetDocument(
        media_type=media_type,
        name=name,
        sample_collection_name=sample_collection_name,
        persistent=persistent,
        sample_fields=foo.SampleFieldDocument.list_from_field_schema(
            sample_doc_cls.get_field_schema(include_private=True)
        ),
        version=focn.VERSION,
    )
    dataset_doc.save()

    # Create indexes
    _create_indexes(sample_collection_name, frame_collection_name)

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _create_indexes(sample_collection_name, frame_collection_name):
    conn = foo.get_db_conn()
    collection = conn[sample_collection_name]
    collection.create_index("filepath", unique=True)
    frame_collection = conn[frame_collection_name]
    frame_collection.create_index([("_sample_id", 1), ("frame_number", 1)])


def _make_sample_collection_name():
    conn = foo.get_db_conn()
    now = datetime.datetime.now()
    name = "samples." + now.strftime("%Y.%m.%d.%H.%M.%S")
    if name in conn.list_collection_names():
        name = "samples." + now.strftime("%Y.%m.%d.%H.%M.%S.%f")

    return name


def _create_sample_document_cls(sample_collection_name):
    return type(sample_collection_name, (foo.DatasetSampleDocument,), {})


def _create_frame_document_cls(frame_collection_name):
    return type(frame_collection_name, (foo.DatasetFrameSampleDocument,), {})


def _load_dataset(name, migrate=True):
    if migrate:
        fomi.migrate_dataset_if_necessary(name)

    try:
        # pylint: disable=no-member
        dataset_doc = foo.DatasetDocument.objects.get(name=name)
    except moe.DoesNotExist:
        raise ValueError("Dataset '%s' not found" % name)

    sample_doc_cls = _create_sample_document_cls(
        dataset_doc.sample_collection_name
    )

    frame_doc_cls = _create_frame_document_cls(
        "frames." + dataset_doc.sample_collection_name
    )

    default_fields = Dataset.get_default_sample_fields(include_private=True)
    for sample_field in dataset_doc.sample_fields:
        if sample_field.name in default_fields:
            continue

        sample_doc_cls._declare_field(sample_field)

    if dataset_doc.media_type == fom.VIDEO:
        for frame_field in dataset_doc.frame_fields:
            frame_doc_cls._declare_field(frame_field)

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _drop_samples(dataset_doc):
    conn = foo.get_db_conn()

    sample_collection_name = dataset_doc.sample_collection_name
    sample_collection = conn[sample_collection_name]
    sample_collection.drop()

    frame_collection_name = "frames." + dataset_doc.sample_collection_name
    frame_collection = conn[frame_collection_name]
    frame_collection.drop()


def _delete_dataset_doc(dataset_doc):
    #
    # Must manually cleanup run results, which are stored using GridFS
    # https://docs.mongoengine.org/guide/gridfs.html#deletion
    #

    for run_doc in dataset_doc.evaluations.values():
        if run_doc.results is not None:
            run_doc.results.delete()

    for run_doc in dataset_doc.brain_methods.values():
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
    frame_collection_name = "frames." + sample_collection_name

    #
    # Clone dataset document
    #

    dataset_doc = dataset._doc.copy()
    dataset_doc.name = name
    dataset_doc.persistent = False
    dataset_doc.sample_collection_name = sample_collection_name

    # Run results get special treatment at the end
    dataset_doc.evaluations = {}
    dataset_doc.brain_methods = {}

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

    #
    # Clone samples
    #

    pipeline = dataset_or_view._pipeline(detach_frames=True)
    pipeline += [{"$out": sample_collection_name}]
    foo.aggregate(dataset._sample_collection, pipeline)

    #
    # Clone frames
    #

    if dataset.media_type == fom.VIDEO:
        if view is not None:
            # The view may modify the frames, so we route the frames though
            # the sample collection
            pipeline = view._pipeline(frames_only=True)
            pipeline += [{"$out": frame_collection_name}]
            foo.aggregate(dataset._sample_collection, pipeline)
        else:
            # Here we can directly aggregate on the frame collection
            pipeline = [{"$out": frame_collection_name}]
            foo.aggregate(dataset._frame_collection, pipeline)

    clone_dataset = load_dataset(name)

    # Clone RunResults
    if dataset.has_evaluations or dataset.has_brain_runs:
        _clone_runs(clone_dataset, dataset._doc)

    return clone_dataset


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
            pipeline.append({"$project": {f: True for f in sample_fields}})
            pipeline.append({"$merge": dataset._sample_collection_name})
            foo.aggregate(dataset._sample_collection, pipeline)
    else:
        pipeline.append({"$out": dataset._sample_collection_name})
        foo.aggregate(dataset._sample_collection, pipeline)

        for field_name in view._get_missing_fields():
            dataset._sample_doc_cls._delete_field_schema(field_name, False)

    #
    # Save frames
    #

    if dataset.media_type == fom.VIDEO:
        # The view may modify the frames, so we route the frames through the
        # sample collection
        pipeline = view._pipeline(frames_only=True)

        if merge:
            if frame_fields:
                pipeline.append({"$project": {f: True for f in frame_fields}})
                pipeline.append({"$merge": dataset._frame_collection_name})
                foo.aggregate(dataset._sample_collection, pipeline)
        else:
            pipeline.append({"$out": dataset._frame_collection_name})
            foo.aggregate(dataset._sample_collection, pipeline)

            for field_name in view._get_missing_fields(frames=True):
                dataset._frame_doc_cls._delete_field_schema(field_name, False)

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
    expand_schema=True,
    merge_info=True,
    overwrite_info=False,
):
    curr_doc = dataset._doc

    #
    # Merge media type
    #

    src_media_type = collection_or_doc.media_type
    if curr_doc.media_type is None:
        curr_doc.media_type = src_media_type

    if src_media_type != curr_doc.media_type and src_media_type is not None:
        raise ValueError(
            "Cannot merge a dataset with media_type='%s' into a dataset "
            "with media_type='%s'" % (src_media_type, curr_doc.media_type)
        )

    #
    # Merge schemas
    #

    is_video = curr_doc.media_type == fom.VIDEO

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
        if doc.evaluations:
            logger.warning(
                "Evaluations cannot be merged into a non-empty dataset"
            )

        if doc.brain_methods:
            logger.warning(
                "Brain runs cannot be merged into a non-empty dataset"
            )
    else:
        dataset.delete_evaluations()
        dataset.delete_brain_runs()

        _clone_runs(dataset, doc)


def _update_no_overwrite(d, dnew):
    d.update({k: v for k, v in dnew.items() if k not in d})


def _clone_runs(dst_dataset, src_doc):
    dst_doc = dst_dataset._doc

    # Clone evaluation results

    dst_doc.evaluations = deepcopy(src_doc.evaluations)

    # GridFS files must be manually copied
    # This works by loading the source dataset's copy of the results into
    # memory and then writing a new copy for the destination dataset
    for eval_key, run_doc in dst_doc.evaluations.items():
        results = foe.EvaluationMethod.load_run_results(dst_dataset, eval_key)
        run_doc.results = None
        foe.EvaluationMethod.save_run_results(dst_dataset, eval_key, results)

    # Clone brain results

    dst_doc.brain_methods = deepcopy(src_doc.brain_methods)

    # GridFS files must be manually copied
    # This works by loading the source dataset's copy of the results into
    # memory and then writing a new copy for the destination dataset
    for brain_key, run_doc in dst_doc.brain_methods.items():
        results = fob.BrainMethod.load_run_results(dst_dataset, brain_key)
        run_doc.results = None
        fob.BrainMethod.save_run_results(dst_dataset, brain_key, results)

    dst_doc.save()


def _merge_samples(
    src_collection,
    dst_dataset,
    key_field,
    omit_none_fields=True,
    skip_existing=False,
    insert_new=True,
    expand_schema=True,
    omit_default_fields=False,
    include_info=True,
    overwrite_info=False,
):
    if omit_default_fields and insert_new:
        raise ValueError("Cannot omit default fields when `insert_new=True`")

    if key_field == "id":
        key_field = "_id"

    if skip_existing:
        when_matched = "keepExisting"
    else:
        when_matched = "merge"

    if insert_new:
        when_not_matched = "insert"
    else:
        when_not_matched = "discard"

    # Merge dataset metadata
    _merge_dataset_doc(
        dst_dataset,
        src_collection,
        expand_schema=expand_schema,
        merge_info=include_info,
        overwrite_info=overwrite_info,
    )

    #
    # Prepare for merge
    #

    is_video = dst_dataset.media_type == fom.VIDEO
    src_dataset = src_collection._dataset

    if key_field not in ("_id", "filepath"):
        # Must have unique indexes in order to use `$merge`
        new_src_index = key_field not in src_collection.list_indexes(
            include_private=True
        )
        new_dst_index = key_field not in dst_dataset.list_indexes(
            include_private=True
        )

        # Re-run creation in case existing index is not unique. If the index
        # is already unique, this is a no-op
        src_dataset.create_index(key_field, unique=True)
        dst_dataset.create_index(key_field, unique=True)
    else:
        new_src_index = False
        new_dst_index = False

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

    if omit_default_fields:
        omit_fields = list(
            dst_dataset.get_default_sample_fields(include_private=True)
        )
    else:
        omit_fields = ["_id"]

    try:
        omit_fields.remove(key_field)
    except ValueError:
        pass

    sample_pipeline = src_collection._pipeline(detach_frames=True)

    if omit_fields:
        sample_pipeline.append({"$unset": omit_fields})

    if omit_none_fields:
        sample_pipeline.append(
            {
                "$replaceWith": {
                    "$arrayToObject": {
                        "$filter": {
                            "input": {"$objectToArray": "$$ROOT"},
                            "as": "item",
                            "cond": {"$ne": ["$$item.v", None]},
                        }
                    }
                }
            }
        )

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

    if new_src_index:
        src_collection.drop_index(key_field)

    if new_dst_index:
        dst_dataset.drop_index(key_field)

    #
    # Merge frames
    #

    if is_video:
        # @todo this there a cleaner way to avoid this? we have to be sure that
        # `frame_key_field` is not excluded by a user's view here...
        _src_collection = _always_select_field(
            src_collection, "frames." + frame_key_field
        )

        frame_pipeline = _src_collection._pipeline(frames_only=True)

        frame_pipeline.extend([{"$unset": ["_id", "_sample_id"]}])

        if omit_none_fields:
            frame_pipeline.append(
                {
                    "$replaceWith": {
                        "$arrayToObject": {
                            "$filter": {
                                "input": {"$objectToArray": "$$ROOT"},
                                "as": "item",
                                "cond": {"$ne": ["$$item.v", None]},
                            }
                        }
                    }
                }
            )

        frame_pipeline.append(
            {
                "$merge": {
                    "into": dst_dataset._frame_collection_name,
                    "on": [frame_key_field, "frame_number"],
                    "whenMatched": when_matched,
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


def _index_frames(sample_collection, key_field, frame_key_field):
    aggs = [foa.Values("_id"), foa.Values(key_field)]
    keys_map = {k: v for k, v in zip(*sample_collection.aggregate(aggs))}

    all_sample_ids = sample_collection.values("frames._sample_id")

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

    # Manually insert `field` into all `SelectFields` stages
    view = sample_collection._dataset.view()
    for stage in sample_collection.stages:
        if isinstance(stage, fost.SelectFields):
            stage = fost.SelectFields(stage.field_names + [field])

        view = view.add_stage(stage)

    return view


def _finalize_frames(sample_collection, key_field, frame_key_field):
    aggs = [foa.Values(key_field), foa.Values("_id")]
    ids_map = {k: v for k, v in zip(*sample_collection.aggregate(aggs))}

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
