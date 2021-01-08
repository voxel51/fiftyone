"""
FiftyOne datasets.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
import fnmatch
import inspect
import logging
import numbers
import os
import random
import reprlib
import string

from bson import ObjectId
import mongoengine.errors as moe
from pymongo.errors import BulkWriteError

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.aggregations as foa
from fiftyone.constants import VERSION
import fiftyone.core.collections as foc
import fiftyone.core.fields as fof
import fiftyone.core.frame as fofr
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
from fiftyone.migrations import get_migration_runner
import fiftyone.core.odm as foo
import fiftyone.core.odm.sample as foos
import fiftyone.core.sample as fos
from fiftyone.core.singleton import DatasetSingleton
import fiftyone.core.view as fov
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.data as foud


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
    dataset = fo.load_dataset(name)
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
        did_delete = _drop_dataset(name, drop_persistent=False)
        if did_delete and verbose:
            logger.info("Dataset '%s' deleted", name)


class Dataset(foc.SampleCollection, metaclass=DatasetSingleton):
    """A FiftyOne dataset.

    Datasets represent an ordered collection of
    :class:`fiftyone.core.sample.Sample` instances that describe a particular
    type of raw media (e.g., images or videos) together with a user-defined set
    of fields.

    FiftyOne datasets ingest and store the labels for all samples internally;
    raw media is stored on disk and the dataset provides paths to the data.

    See :doc:`this guide </user_guide/basics>` for an overview of the basics of
    working with FiftyOne datasets.

    Args:
        name (None): the name of the dataset. By default,
            :func:`get_default_dataset_name` is used
        persistent (False): whether the dataset should persist in the database
            after the session terminates
        overwrite (False): whether to overwrite an existing dataset of the same
            name
    """

    def __init__(
        self, name=None, persistent=False, overwrite=False, _create=True
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
            ) = _load_dataset(name)

        self._deleted = False

    def __len__(self):
        return self.aggregate(foa.Count()).count

    def __getitem__(self, sample_id_or_slice):
        if isinstance(sample_id_or_slice, numbers.Integral):
            raise ValueError(
                "Accessing dataset samples by numeric index is not supported. "
                "Use sample IDs instead"
            )

        if isinstance(sample_id_or_slice, slice):
            return self.view()[sample_id_or_slice]

        d = self._sample_collection.find_one(
            {"_id": ObjectId(sample_id_or_slice)}
        )

        if d is None:
            raise KeyError("No sample found with ID '%s'" % sample_id_or_slice)

        doc = self._sample_dict_to_doc(d)

        return fos.Sample.from_doc(doc, dataset=self)

    def __delitem__(self, sample_id):
        self.remove_sample(sample_id)

    def __getattribute__(self, name):
        if name.startswith("__") or name in (
            "name",
            "deleted",
            "_deleted",
            "_doc",
        ):
            return super().__getattribute__(name)

        if getattr(self, "_deleted", False):
            raise DoesNotExistError("Dataset '%s' is deleted" % self.name)

        return super().__getattribute__(name)

    @property
    def media_type(self):
        """The media type of the dataset."""
        return self._doc.media_type

    @media_type.setter
    def media_type(self, media_type):
        if len(self) != 0:
            raise ValueError("Cannot set media type of a non-empty dataset")

        if media_type not in fom.MEDIA_TYPES:
            raise ValueError(
                'media_type can only be one of %s; received "%s"'
                % (fom.MEDIA_TYPES, media_type)
            )

        if media_type == fom.VIDEO:
            self._sample_doc_cls.add_field(
                "frames", fof.EmbeddedDocumentField, fol._Frames
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
        """A dictionary of information about the dataset."""
        return self._doc.info

    @info.setter
    def info(self, info):
        self._doc.info = info

    @property
    def deleted(self):
        """Whether the dataset is deleted."""
        return self._deleted

    @property
    def _dataset(self):
        return self

    def summary(self):
        """Returns a string summary of the dataset.

        Returns:
            a string summary
        """
        aggs = self.aggregate(
            [foa.Count(), foa.Distinct("tags")], _attach_frames=False
        )
        elements = [
            "Name:           %s" % self.name,
            "Media type:     %s" % self.media_type,
            "Num samples:    %d" % aggs[0].count,
            "Persistent:     %s" % self.persistent,
            "Info:           %s" % _info_repr.repr(self.info),
            "Tags:           %s" % aggs[1].values,
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
        """Get the default fields present on any :class:`Dataset`.

        Args:
            include_private (False): whether or not to return fields prefixed
                with a `_`

        Returns:
            a tuple of field names
        """
        return foos.default_sample_fields(
            foo.DatasetSampleDocument, include_private=include_private
        )

    @classmethod
    def get_default_frame_fields(cls, include_private=False):
        """Get the default fields present on any :class:`Frame`.

        Args:
            include_private (False): whether or not to return fields prefixed
                with a `_`

        Returns:
            a tuple of field names
        """
        return foos.default_sample_fields(
            foo.DatasetFrameSampleDocument, include_private=include_private
        )

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
                `_` in the returned schema

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
                `_` in the returned schema

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
                field. Used only when ``ftype`` is an embedded
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the type of the contained field. Used only when
                ``ftype`` is a :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`
        """
        self._sample_doc_cls.add_field(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
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
                field. Used only when ``ftype`` is an embedded
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the type of the contained field. Used only when
                ``ftype`` is a :class:`fiftyone.core.fields.ListField` or
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

    def rename_sample_field(self, field_name, new_field_name):
        """Renames the sample field to the given new name.

        You can use dot notation (``embedded.field.name``) to rename embedded
        fields.

        Args:
            field_name: the field name
            new_field_name: the new field name
        """
        if "." in field_name:
            self._sample_doc_cls._rename_embedded_field(
                field_name, new_field_name
            )
            fos.Sample._reload_docs(self._sample_collection_name)
        else:
            self._sample_doc_cls._rename_field(field_name, new_field_name)
            fos.Sample._rename_field(
                self._sample_collection_name, field_name, new_field_name
            )

    def rename_frame_field(self, field_name, new_field_name):
        """Renames the frame-level field to the given new name.

        You can use dot notation (``embedded.field.name``) to rename embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_name: the field name
            new_field_name: the new field name
        """
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        if "." in field_name:
            self._frame_doc_cls._rename_embedded_field(
                field_name, new_field_name
            )
            fofr.Frame._reload_docs(self._frame_collection_name)
        else:
            self._frame_doc_cls._rename_field(
                field_name, new_field_name, is_frame_field=True
            )
            fofr.Frame._rename_field(
                self._frame_collection_name, field_name, new_field_name
            )

    def clone_sample_field(self, field_name, new_field_name):
        """Clones the given sample field into a new field of the dataset.

        You can use dot notation (``embedded.field.name``) to clone embedded
        fields.

        Args:
            field_name: the field name to clone
            new_field_name: the new field name to populate
        """
        self._clone_sample_field(field_name, new_field_name)

    def clone_frame_field(self, field_name, new_field_name):
        """Clones the frame-level field into a new field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_name: the field name
            new_field_name: the new field name
        """
        self._clone_frame_field(field_name, new_field_name)

    def _clone_sample_field(self, field_name, new_field_name, view=None):
        if view is not None:
            pipeline = view._pipeline(attach_frames=False)
        else:
            pipeline = None

        if "." in field_name:
            self._sample_doc_cls._clone_embedded_field(
                field_name, new_field_name, pipeline=pipeline
            )
        else:
            self._sample_doc_cls._clone_field(
                field_name, new_field_name, pipeline=pipeline
            )

        fos.Sample._reload_docs(self._sample_collection_name)

    def _clone_frame_field(self, field_name, new_field_name, view=None):
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        if view is not None:
            # @todo support this
            raise ValueError(
                "Cloning frame fields of a view is not yet supported"
            )
        else:
            pipeline = None

        if "." in field_name:
            self._frame_doc_cls._clone_embedded_field(
                field_name, new_field_name, pipeline=pipeline
            )
        else:
            self._frame_doc_cls._clone_field(
                field_name, new_field_name, pipeline=pipeline
            )

        fofr.Frame._reload_docs(self._frame_collection_name)

    def clear_sample_field(self, field_name):
        """Clears the values of the field from all samples in the dataset.

        The field will remain in the dataset's schema, and all samples will
        have the value ``None`` for the field.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        self._clear_sample_field(field_name)

    def clear_frame_field(self, field_name):
        """Clears the values of the frame field from all samples in the
        dataset.

        The field will remain in the dataset's frame schema, and all frames
        will have the value ``None`` for the field.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        self._clear_frame_field(field_name)

    def _clear_sample_field(self, field_name, view=None):
        if view is not None:
            pipeline = view._pipeline(attach_frames=False)
        else:
            pipeline = None

        if "." in field_name:
            self._sample_doc_cls._clear_embedded_field(
                field_name, pipeline=pipeline
            )
        else:
            self._sample_doc_cls._clear_field(field_name, pipeline=pipeline)

        fos.Sample._reload_docs(self._sample_collection_name)

    def _clear_frame_field(self, field_name, view=None):
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        if view is not None:
            # @todo support this
            raise ValueError(
                "Clearing frame fields of a view is not yet supported"
            )
        else:
            pipeline = None

        if "." in field_name:
            self._frame_doc_cls._clear_embedded_field(
                field_name, pipeline=pipeline
            )
        else:
            self._frame_doc_cls._clear_field(field_name, pipeline=pipeline)

        fofr.Frame._reload_docs(self._frame_collection_name)

    def delete_sample_field(self, field_name):
        """Deletes the field from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        fields.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        if "." in field_name:
            self._sample_doc_cls._delete_embedded_field(field_name)
            fos.Sample._reload_docs(self._sample_collection_name)
        else:
            self._sample_doc_cls._delete_field(field_name)
            fos.Sample._purge_field(self._sample_collection_name, field_name)

    def delete_frame_field(self, field_name):
        """Deletes the frame-level field from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        frame fields.

        Only applicable to video datasets.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        if self.media_type != fom.VIDEO:
            raise ValueError("Only video datasets have frame fields")

        if "." in field_name:
            self._frame_doc_cls._delete_embedded_field(field_name)
            fofr.Frame._reload_docs(self._frame_collection_name)
        else:
            self._frame_doc_cls._delete_field(field_name, is_frame_field=True)
            fofr.Frame._purge_field(self._frame_collection_name, field_name)

    def get_tags(self):
        """Returns the list of unique tags of samples in the dataset.

        Returns:
            a list of tags
        """
        return self.aggregate(foa.Distinct("tags")).values

    def distinct(self, field):
        """Finds all distinct values of a sample field across the dataset.

        If the field is a list, the distinct values will be distinct elements
        across all sample field lists.

        Args:
            field: a sample field like ``"tags"`` or a subfield like
                ``"ground_truth.label"``

        Returns:
            the set of distinct values
        """
        return set(self._sample_collection.distinct(field))

    def iter_samples(self):
        """Returns an iterator over the samples in the dataset.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for d in self._aggregate(hide_frames=True):
            frames = d.pop("_frames", [])
            doc = self._sample_dict_to_doc(d)
            sample = fos.Sample.from_doc(doc, dataset=self)
            if self.media_type == fom.VIDEO:
                sample.frames._set_replacements(frames)

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
        d.pop("_id", None)  # remove the ID if in DB
        self._sample_collection.insert_one(d)  # adds `_id` to `d`

        if not sample._in_db:
            doc = self._sample_doc_cls.from_dict(d, extended=False)
            sample._set_backing_doc(doc, dataset=self)

        if self.media_type == fom.VIDEO:
            sample.frames._serve(sample)
            sample.frames._save(insert=True)

        return str(d["_id"])

    def add_samples(self, samples, expand_schema=True, num_samples=None):
        """Adds the given samples to the dataset.

        Any sample instances that do not belong to a dataset are updated
        in-place to reflect membership in this dataset. Any sample instances
        that belong to other datasets are not modified.

        Args:
            samples: an iterable of :class:`fiftyone.core.sample.Sample`
                instances. For example, ``samples`` may be a :class:`Dataset`
                or a :class:`fiftyone.core.views.DatasetView`
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

    def _add_samples_batch(self, samples, expand_schema):
        samples = [s.copy() if s._in_db else s for s in samples]

        if self.media_type is None and len(samples) > 0:
            self.media_type = samples[0].media_type

        if expand_schema:
            self._expand_schema(samples)

        for sample in samples:
            self._validate_sample(sample)

        dicts = [sample.to_mongo_dict() for sample in samples]
        for d in dicts:
            d.pop("_id", None)  # remove the ID if in DB

        try:
            # adds `_id` to each dict
            self._sample_collection.insert_many(dicts)
        except BulkWriteError as bwe:
            msg = bwe.details["writeErrors"][0]["errmsg"]
            raise ValueError(msg) from bwe

        for sample, d in zip(samples, dicts):
            if not sample._in_db:
                doc = self._sample_doc_cls.from_dict(d, extended=False)
                sample._set_backing_doc(doc, dataset=self)

            if self.media_type == fom.VIDEO:
                sample.frames._serve(sample)
                sample.frames._save(insert=True)

        return [str(d["_id"]) for d in dicts]

    def merge_samples(
        self,
        samples,
        key_field="filepath",
        key_fcn=None,
        omit_none_fields=True,
        skip_existing=False,
        insert_new=True,
        omit_default_fields=False,
        overwrite=True,
    ):
        """Merges the given samples into this dataset.

        By default, samples with the same absolute ``filepath`` are merged.
        You can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        Args:
            samples: an iterable of :class:`fiftyone.core.sample.Sample`
                instances. For example, ``samples`` may be a :class:`Dataset`
                or a :class:`fiftyone.core.views.DatasetView`
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
            omit_default_fields (False): whether to omit default sample fields
                when merging. If ``True``, ``insert_new`` must be ``False``
            overwrite (True): whether to overwrite (True) or skip (False)
                existing sample fields
        """
        # Use efficient implementation when possible
        if (
            isinstance(samples, foc.SampleCollection)
            and key_fcn is None
            and overwrite
        ):
            self._merge_samples(
                samples,
                key_field=key_field,
                omit_none_fields=omit_none_fields,
                skip_existing=skip_existing,
                insert_new=insert_new,
                omit_default_fields=omit_default_fields,
            )
            return

        if key_fcn is None:
            key_fcn = lambda sample: sample[key_field]

        if omit_default_fields:
            if insert_new:
                raise ValueError(
                    "Cannot omit default fields when `insert_new=True`"
                )

            omit_fields = fos.get_default_sample_fields()
        else:
            omit_fields = None

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
                        )
                        existing_sample.save()
                elif insert_new:
                    self.add_sample(sample)

    def _merge_samples(
        self,
        sample_collection,
        key_field="filepath",
        omit_none_fields=True,
        skip_existing=False,
        insert_new=True,
        omit_default_fields=False,
    ):
        """Merges the given sample collection into this dataset.

        By default, samples with the same absolute ``filepath`` are merged.
        You can customize this behavior via the ``key_field`` parameter.

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            omit_none_fields (True): whether to omit ``None``-valued fields of
                the provided samples when merging their fields
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            omit_default_fields (False): whether to omit default sample fields
                when merging. If ``True``, ``insert_new`` must be ``False``
        """
        if self.media_type == fom.VIDEO:
            raise ValueError("Merging video collections is not yet supported")

        if omit_default_fields and insert_new:
            raise ValueError(
                "Cannot omit default fields when `insert_new=True`"
            )

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

        # Must create unique indexes in order to use `$merge`
        self.create_index(key_field, unique=True)
        sample_collection.create_index(key_field, unique=True)

        schema = sample_collection.get_field_schema()
        self._sample_doc_cls.merge_field_schema(schema)

        if omit_default_fields:
            omit_fields = list(
                self.get_default_sample_fields(include_private=True)
            )
        else:
            omit_fields = ["_id"]

        try:
            omit_fields.remove(key_field)
        except ValueError:
            pass

        pipeline = []

        if omit_fields:
            pipeline.append({"$unset": omit_fields})

        if omit_none_fields:
            pipeline.append(
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

        pipeline.append(
            {
                "$merge": {
                    "into": self._sample_collection_name,
                    "on": key_field,
                    "whenMatched": when_matched,
                    "whenNotMatched": when_not_matched,
                }
            }
        )

        sample_collection._aggregate(pipeline=pipeline, attach_frames=False)
        fos.Sample._reload_docs(self._sample_collection_name)

    def remove_sample(self, sample_or_id):
        """Removes the given sample from the dataset.

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.

        Args:
            sample_or_id: the :class:`fiftyone.core.sample.Sample` or sample
                ID to remove
        """
        if not isinstance(sample_or_id, fos.Sample):
            sample_id = sample_or_id
        else:
            sample_id = sample_or_id.id

        self._sample_collection.delete_one({"_id": ObjectId(sample_id)})

        fos.Sample._reset_backing_docs(
            self._sample_collection_name, doc_ids=[sample_id]
        )

    def remove_samples(self, samples_or_ids):
        """Removes the given samples from the dataset.

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.

        Args:
            samples: an iterable of :class:`fiftyone.core.sample.Sample`
                instances or sample IDs. For example, ``samples`` may be a
                :class:`fiftyone.core.views.DatasetView`
        """
        sample_ids = [
            sample_or_id.id
            if isinstance(sample_or_id, fos.Sample)
            else sample_or_id
            for sample_or_id in samples_or_ids
        ]

        self._sample_collection.delete_many(
            {"_id": {"$in": [ObjectId(_id) for _id in sample_ids]}}
        )

        fos.Sample._reset_backing_docs(
            self._sample_collection_name, doc_ids=sample_ids
        )

    def save(self):
        """Saves the dataset to the database.

        This only needs to be called when dataset-level information such as its
        :meth:`Dataset.info` is modified.
        """
        self._save()

    def _save(self, view=None):
        if view is not None:
            _save_view(view)

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
            _clone_dataset_or_view(view, name)
        else:
            _clone_dataset_or_view(self, name)

        return load_dataset(name=name)

    def clear(self):
        """Removes all samples from the dataset.

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.
        """
        self._sample_doc_cls.drop_collection()
        fos.Sample._reset_backing_docs(self._sample_collection_name)

        if self.media_type == fom.VIDEO:
            self._frame_doc_cls.drop_collection()
            fos.Sample._reset_backing_docs(self._frame_collection_name)

    def delete(self):
        """Deletes the dataset.

        Once deleted, only the ``name`` and ``deleted`` attributes of a dataset
        may be accessed.

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.
        """
        self.clear()
        self._doc.delete()
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
            tags (None): an optional list of tags to attach to each sample
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
            tags (None): an optional list of tags to attach to each sample
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
            samples: an iterable of samples. If no ``sample_parser`` is
                provided, this must be an iterable of image paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            tags (None): an optional list of tags to attach to each sample

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
            samples: an iterable of samples
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`
                instance to use to parse the samples
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
            tags (None): an optional list of tags to attach to each sample
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
            tags (None): an optional list of tags to attach to each sample
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
            tags (None): an optional list of tags to attach to each sample

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
            samples: an iterable of samples. If no ``sample_parser`` is
                provided, this must be an iterable of image paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            tags (None): an optional list of tags to attach to each sample
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
            samples: an iterable of samples
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`
                instance to use to parse the samples
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels (if applicable)
            tags (None): an optional list of tags to attach to each sample
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
            samples: an iterable of samples. If no ``sample_parser`` is
                provided, this must be an iterable of video paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            tags (None): an optional list of tags to attach to each sample

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
            samples: an iterable of samples
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledVideoSampleParser`
                instance to use to parse the samples
            label_field ("ground_truth"): the name (or root name) of the
                frame field(s) to use for the labels
            tags (None): an optional list of tags to attach to each sample
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
            tags (None): an optional list of tags to attach to each sample
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
            tags (None): an optional list of tags to attach to each sample

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
            samples: an iterable of samples. If no ``sample_parser`` is
                provided, this must be an iterable of video paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            tags (None): an optional list of tags to attach to each sample
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
            samples: an iterable of samples
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledVideoSampleParser`
                instance to use to parse the samples
            tags (None): an optional list of tags to attach to each sample
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
            tags (None): an optional list of tags to attach to each sample
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
            tags (None): an optional list of tags to attach to each sample

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
            samples: an iterable of samples
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional list of tags to attach to each sample

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
            samples: an iterable of samples
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name (or root name) of the
                field(s) to use for the labels
            tags (None): an optional list of tags to attach to each sample

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
            tags (None): an optional list of tags to attach to each sample
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
            tags (None): an optional list of tags to attach to each sample

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
            samples: an iterable of samples
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.UnlabeledVideoSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional list of tags to attach to each sample

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
            samples: an iterable of samples
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledVideoSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional list of tags to attach to each sample

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
            tags (None): an optional list of tags to attach to each sample
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
            tags (None): an optional list of tags to attach to each sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_videos_patt(videos_patt, tags=tags)
        return dataset

    def list_indexes(self):
        """Returns the fields of the dataset that are indexed.

        Returns:
            a list of field names
        """
        index_info = self._sample_collection.index_information()
        index_fields = [v["key"][0][0] for v in index_info.values()]
        return [f for f in index_fields if not f.startswith("_")]

    def create_index(self, field, unique=False):
        """Creates an index on the given field.

        If the given field already has a unique index, it will be retained
        regardless of the ``unique`` value you specify.

        If the given field already has a non-unique index but you requested a
        unique index, the existing index will be dropped.

        Indexes enable efficient sorting, merging, and other such operations.

        Args:
            field: the field name or ``embedded.field.name``
            unique (False): whether to add a uniqueness constraint to the index
        """
        if ("." not in field) and (field not in self.get_field_schema()):
            raise ValueError("Dataset has no field '%s'" % field)

        index_info = self._sample_collection.index_information()
        index_map = {
            v["key"][0][0]: v.get("unique", False) for v in index_info.values()
        }
        if field in index_map:
            _unique = index_map[field]
            if _unique or (unique == _unique):
                # Satisfactory index already exists
                return

            # Must drop existing index
            self.drop_index(field)

        self._sample_collection.create_index(field, unique=unique)

    def drop_index(self, field):
        """Drops the index on the given field.

        Args:
            field: the field name or ``embedded.field.name``
        """
        index_info = self._sample_collection.index_information()
        index_map = {v["key"][0][0]: k for k, v in index_info.items()}

        if field not in index_map:
            if ("." not in field) and (field not in self.get_field_schema()):
                raise ValueError("Dataset has no field '%s'" % field)

            raise ValueError("Dataset field '%s' is not indexed" % field)

        self._sample_collection.drop_index(index_map[field])

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
                of each sample, if the filepath is not absolute (begins with a
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
        dataset.save()

        def parse_sample(sd):
            if rel_dir and not sd["filepath"].startswith(os.path.sep):
                sd["filepath"] = os.path.join(rel_dir, sd["filepath"])

            if media_type == fom.VIDEO:
                frames = sd.pop("frames", {})

                if etau.is_str(frames):
                    frames_path = os.path.join(frame_labels_dir, frames)
                    frames = etas.load_json(frames_path).get("frames", {})

                sample = fos.Sample.from_dict(sd)

                sample._frames = fofr.Frames()  # @todo clean up this hack
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
        attach_frames=True,
        hide_frames=False,
        squash_frames=False,
    ):
        if attach_frames and (self.media_type == fom.VIDEO):
            _pipeline = self._attach_frames(hide_frames=hide_frames)
        else:
            _pipeline = []

        if pipeline is not None:
            _pipeline += pipeline

        if squash_frames and (self.media_type == fom.VIDEO):
            key = "_frames" if hide_frames else "frames"
            _pipeline.append({"$project": {key: False}})

        return _pipeline

    def _aggregate(
        self,
        pipeline=None,
        attach_frames=True,
        hide_frames=False,
        squash_frames=False,
    ):
        _pipeline = self._pipeline(
            pipeline=pipeline,
            attach_frames=attach_frames,
            hide_frames=hide_frames,
            squash_frames=squash_frames,
        )
        return self._sample_collection.aggregate(_pipeline)

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

                self._sample_doc_cls.add_implied_field(
                    field_name, value, frame_doc_cls=self._frame_doc_cls,
                )
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

                self._frame_doc_cls.add_implied_field(
                    field_name, value, frame_doc_cls=self._frame_doc_cls,
                )
                fields = self.get_frame_field_schema(include_private=True)

        return fields

    def _validate_media_type(self, sample):
        if self.media_type != sample.media_type:
            raise fom.MediaTypeError(
                "Sample media type '%s' does not match dataset media type '%s'"
                % (sample.media_type, self.media_type)
            )

    def _sample_dict_to_doc(self, d):
        return self._sample_doc_cls.from_dict(d, extended=False)

    def _frame_dict_to_doc(self, d):
        return self._frame_doc_cls.from_dict(d, extended=False)

    def _to_fields_str(self, field_schema):
        max_len = max([len(field_name) for field_name in field_schema]) + 1
        return "\n".join(
            "    %s %s" % ((field_name + ":").ljust(max_len), str(field))
            for field_name, field in field_schema.items()
        )

    def _validate_sample(self, sample):
        fields = self.get_field_schema(include_private=True)

        non_existest_fields = {
            fn for fn in sample.field_names if fn not in fields
        }

        if self.media_type == fom.VIDEO:
            non_existest_fields.discard("frames")

        if non_existest_fields:
            msg = "The fields %s do not exist on the dataset '%s'" % (
                non_existest_fields,
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

    def _reload(self):
        self._doc.reload()


class DoesNotExistError(Exception):
    """Exception raised when a dataset that does not exist is encountered."""

    pass


class _DatasetInfoRepr(reprlib.Repr):
    def repr_BaseList(self, obj, level):
        return self.repr_list(obj, level)

    def repr_BaseDict(self, obj, level):
        return self.repr_dict(obj, level)


_info_repr = _DatasetInfoRepr()
_info_repr.maxlevel = 2
_info_repr.maxdict = 3
_info_repr.maxlist = 3
_info_repr.maxtuple = 3
_info_repr.maxset = 3
_info_repr.maxstring = 63
_info_repr.maxother = 63


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

    frames_collection_name = "frames." + sample_collection_name
    frame_doc_cls = _create_frame_document_cls(frames_collection_name)

    # @todo add `frames_collection_name` to dataset document too
    dataset_doc = foo.DatasetDocument(
        media_type=media_type,
        name=name,
        sample_collection_name=sample_collection_name,
        persistent=persistent,
        sample_fields=foo.SampleFieldDocument.list_from_field_schema(
            sample_doc_cls.get_field_schema(include_private=True)
        ),
        version=VERSION,
    )
    dataset_doc.save()

    # Create indexes
    _create_indexes(sample_collection_name, frames_collection_name)

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _create_indexes(sample_collection_name, frames_collection_name):
    conn = foo.get_db_conn()
    collection = conn[sample_collection_name]
    collection.create_index("filepath", unique=True)
    frames_collection = conn[frames_collection_name]
    frames_collection.create_index(
        [("sample_id", foo.ASC), ("frame_number", foo.ASC)]
    )


def _clone_dataset_or_view(dataset_or_view, name):
    if dataset_exists(name):
        raise ValueError("Dataset '%s' already exists" % name)

    if isinstance(dataset_or_view, fov.DatasetView):
        dataset = dataset_or_view._dataset
        view = dataset_or_view
    else:
        dataset = dataset_or_view
        view = None

    sample_collection_name = _make_sample_collection_name()
    frames_collection_name = "frames." + sample_collection_name

    #
    # Clone samples
    #

    if view is not None:
        pipeline = view._pipeline(attach_frames=False)
    else:
        pipeline = [{"$match": {}}]

    dataset._sample_collection.aggregate(
        pipeline + [{"$out": sample_collection_name}]
    )

    #
    # Clone frames
    #

    if dataset.media_type == fom.VIDEO:
        if view is not None:
            # @todo support this
            raise ValueError(
                "Cloning views into video datasets is not yet supported"
            )

        frames_pipeline = [{"$match": {}}]
        dataset._frame_collection.aggregate(
            frames_pipeline + [{"$out": frames_collection_name}]
        )

    #
    # Clone dataset document
    #

    dataset._doc.reload()
    dataset_doc = dataset._doc.copy()
    dataset_doc.name = name
    dataset_doc.sample_collection_name = sample_collection_name

    if view is not None:
        # Respect filtered sample fields, if any
        schema = view.get_field_schema()
        sample_fields = list(schema.keys())
        dataset_doc.sample_fields = [
            sf for sf in dataset_doc.sample_fields if sf.name in sample_fields
        ]

        # Respect filtered frame fields, if any
        if dataset.media_type == fom.VIDEO:
            schema = view.get_frame_field_schema()
            frame_fields = list(schema.keys())
            dataset_doc.frame_fields = [
                sf
                for sf in dataset_doc.frame_fields
                if sf.name in frame_fields
            ]

    dataset_doc.save()

    # Create indexes
    _create_indexes(sample_collection_name, frames_collection_name)


def _save_view(view):
    dataset = view._dataset
    dataset._sample_collection.aggregate(
        view._pipeline(attach_frames=False)
        + [{"$out": dataset._sample_collection_name}]
    )

    doc_ids = [str(_id) for _id in dataset._sample_collection.distinct("_id")]
    fos.Sample._refresh_backing_docs(dataset._sample_collection_name, doc_ids)

    for field_name in view._get_missing_fields():
        dataset._sample_doc_cls._delete_field_schema(field_name, False)

    if dataset.media_type == fom.VIDEO:
        # @todo support this
        raise ValueError(
            "Saving views into video datasets is not yet supported"
        )


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


def _load_dataset(name):
    try:
        # pylint: disable=no-member
        dataset_doc = foo.DatasetDocument.objects.get(name=name)
    except moe.DoesNotExist:
        raise DoesNotExistError("Dataset '%s' not found" % name)

    version = dataset_doc.version
    if version is None or version != VERSION:
        runner = get_migration_runner(dataset_doc.version, VERSION)
        if runner.has_revisions:
            logger.info(
                "Migrating dataset '%s' to the current version (%s)",
                dataset_doc.name,
                VERSION,
            )
            runner.run(dataset_names=[dataset_doc.name])

        dataset_doc.reload()
        dataset_doc.version = VERSION
        dataset_doc.save()

    sample_doc_cls = _create_sample_document_cls(
        dataset_doc.sample_collection_name
    )

    frame_doc_cls = _create_frame_document_cls(
        "frames." + dataset_doc.sample_collection_name
    )

    is_video = dataset_doc.media_type == fom.VIDEO

    kwargs = {}
    default_fields = Dataset.get_default_sample_fields(include_private=True)

    if is_video:
        for frame_field in dataset_doc.frame_fields:
            subfield = (
                etau.get_class(frame_field.subfield)
                if frame_field.subfield
                else None
            )
            embedded_doc_type = (
                etau.get_class(frame_field.embedded_doc_type)
                if frame_field.embedded_doc_type
                else None
            )
            frame_doc_cls.add_field(
                frame_field.name,
                etau.get_class(frame_field.ftype),
                subfield=subfield,
                embedded_doc_type=embedded_doc_type,
                save=False,
            )

    for sample_field in dataset_doc.sample_fields:
        if sample_field.name in default_fields:
            continue

        subfield = (
            etau.get_class(sample_field.subfield)
            if sample_field.subfield
            else None
        )
        embedded_doc_type = (
            etau.get_class(sample_field.embedded_doc_type)
            if sample_field.embedded_doc_type
            else None
        )

        if sample_field.name == "frames":
            kwargs["frame_doc_cls"] = frame_doc_cls

        sample_doc_cls.add_field(
            sample_field.name,
            etau.get_class(sample_field.ftype),
            subfield=subfield,
            embedded_doc_type=embedded_doc_type,
            save=False,
            **kwargs,
        )

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _drop_dataset(name, drop_persistent=True):
    try:
        # pylint: disable=no-member
        dataset_doc = foo.DatasetDocument.objects.get(name=name)
    except moe.DoesNotExist:
        raise DoesNotExistError("Dataset '%s' not found" % name)

    if dataset_doc.persistent and not drop_persistent:
        return False

    sample_doc_cls = _create_sample_document_cls(
        dataset_doc.sample_collection_name
    )
    sample_doc_cls.drop_collection()

    frame_doc_cls = _create_frame_document_cls(
        "frames." + dataset_doc.sample_collection_name
    )
    frame_doc_cls.drop_collection()

    dataset_doc.delete()

    return True
