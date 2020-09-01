"""
FiftyOne datasets.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import datetime
import inspect
import logging
import numbers
import os
import reprlib

from bson import ObjectId
from mongoengine.errors import DoesNotExist, FieldDoesNotExist

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.fields as fof
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
    except DoesNotExist:
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


def get_default_dataset_dir(name):
    """Returns the default dataset directory for the dataset with the given
    name.

    Args:
        name: the dataset name

    Returns:
        the default directory for the dataset
    """
    return os.path.join(fo.config.default_dataset_dir, name)


def delete_dataset(name):
    """Deletes the FiftyOne dataset with the given name.

    If reference to the dataset exists in memory, only `Dataset.name` and
    `Dataset.deleted` will be valid attributes. Accessing any other attributes
    or methods will raise a :class:`DatasetError`

    If reference to a sample exists in memory, the sample's dataset will be
    "unset" such that `sample.in_dataset == False`

    Args:
        name: the name of the dataset

    Raises:
        ValueError: if the dataset is not found
    """
    dataset = fo.load_dataset(name)
    dataset.delete()


def delete_non_persistent_datasets():
    """Deletes all non-persistent datasets."""
    for dataset_name in list_datasets():
        dataset = load_dataset(dataset_name)
        if not dataset.persistent:
            dataset.delete()


class Dataset(foc.SampleCollection, metaclass=DatasetSingleton):
    """A FiftyOne dataset.

    Datasets represent an ordered collection of
    :class:`fiftyone.core.sample.Sample` instances that describe a particular
    type of raw media (e.g., images) together with a user-defined set of
    fields.

    FiftyOne datasets ingest and store the labels for all samples internally;
    raw media is stored on disk and the dataset provides paths to the data.

    See :doc:`this guide </user_guide/basics>` for an overview of the basics of
    working with FiftyOne datasets.

    Args:
        name (None): the name of the dataset. By default,
            :func:`get_default_dataset_name` is used
        persistent (False): whether the dataset should persist in the database
            after the session terminates
    """

    # Batch size used when commiting samples to the database
    _BATCH_SIZE = 128

    def __init__(self, name=None, persistent=False, _create=True):
        if name is None and _create:
            name = get_default_dataset_name()

        if _create:
            self._doc, self._sample_doc_cls = _create_dataset(
                name, persistent=persistent
            )
        else:
            self._doc, self._sample_doc_cls = _load_dataset(name)

        self._deleted = False

    def __len__(self):
        return self._sample_collection.count_documents({})

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
        if name.startswith("__") or name in [
            "name",
            "deleted",
            "_deleted",
            "_doc",
        ]:
            return super().__getattribute__(name)

        if getattr(self, "_deleted", False):
            raise DoesNotExistError("Dataset '%s' is deleted" % self.name)

        return super().__getattribute__(name)

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

    def summary(self):
        """Returns a string summary of the dataset.

        Returns:
            a string summary
        """
        return "\n".join(
            [
                "Name:           %s" % self.name,
                "Num samples:    %d" % len(self),
                "Persistent:     %s" % self.persistent,
                "Info:           %s" % _info_repr.repr(self.info),
                "Tags:           %s" % self.get_tags(),
                "Sample fields:",
                self._to_fields_str(self.get_field_schema()),
            ]
        )

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
        return foos.default_sample_fields(include_private=include_private)

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
        return self._sample_doc_cls.get_field_schema(
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

    def delete_sample_field(self, field_name):
        """Deletes the field from all samples in the dataset.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        self._sample_doc_cls.delete_field(field_name)
        fos.Sample._purge_field(self._sample_collection_name, field_name)

    def get_tags(self):
        """Returns the list of unique tags of samples in the dataset.

        Returns:
            a list of tags
        """
        return list(self.distinct("tags"))

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
        for d in self._sample_collection.find():
            doc = self._sample_dict_to_doc(d)
            yield fos.Sample.from_doc(doc, dataset=self)

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
            :class:`mongoengine.errors.ValidationError` if a field of the
            sample has a type that is inconsistent with the dataset schema, or
            if ``expand_schema == False`` and a new field is encountered
        """
        if expand_schema:
            self._expand_schema([sample])

        if sample._in_db:
            sample = sample.copy()

        self._validate_sample(sample)

        d = sample.to_mongo_dict()
        d.pop("_id", None)  # remove the ID if in DB
        self._sample_collection.insert_one(d)  # adds `_id` to `d`

        if not sample._in_db:
            doc = self._sample_doc_cls.from_dict(d, extended=False)
            sample._set_backing_doc(doc, dataset=self)

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
            :class:`mongoengine.errors.ValidationError` if a field of a sample
            has a type that is inconsistent with the dataset schema, or if
            ``expand_schema == False`` and a new field is encountered
        """
        if num_samples is None:
            try:
                num_samples = len(samples)
            except:
                pass

        sample_ids = []
        with fou.ProgressBar(total=num_samples) as pb:
            for batch in fou.iter_batches(samples, self._BATCH_SIZE):
                sample_ids.extend(
                    self._add_samples_batch(batch, expand_schema)
                )
                pb.update(count=len(batch))

        return sample_ids

    def _add_samples_batch(self, samples, expand_schema):
        if expand_schema:
            self._expand_schema(samples)

        for sample in samples:
            self._validate_sample(sample)

        dicts = [sample.to_mongo_dict() for sample in samples]
        for d in dicts:
            d.pop("_id", None)  # remove the ID if in DB

        self._sample_collection.insert_many(dicts)  # adds `_id` to each dict

        for sample, d in zip(samples, dicts):
            if not sample._in_db:
                doc = self._sample_doc_cls.from_dict(d, extended=False)
                sample._set_backing_doc(doc, dataset=self)

        return [str(d["_id"]) for d in dicts]

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
            collection_name=self._sample_collection_name,
            sample_ids=[sample_id],
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

        sample_object_ids = [ObjectId(id) for id in sample_ids]
        self._sample_collection.delete_many(
            {"_id": {"$in": sample_object_ids}}
        )

        fos.Sample._reset_backing_docs(
            collection_name=self._sample_collection_name, sample_ids=sample_ids
        )

    def clone_field(self, field_name, new_field_name, samples=None):
        """Clones the field values of the samples into a new field of this
        dataset.

        Any samples in ``samples`` that are not in this dataset (i.e., their
        sample ID does not match any samples in this dataset) are skipped.

        The fields of the input samples are **deep copied**.

        Args:
            field_name: the field name to clone
            new_field_name: the new field name to populate
            samples (None): an iterable of :class:`fiftyone.core.sample.Sample`
                instances whose fields to clone. For example, ``samples`` may
                be a :class:`fiftyone.core.views.DatasetView`. By default, this
                dataset itself is used

        Returns:
            tuple of

            -   num_cloned: the number of samples that were cloned
            -   num_skipped: the number of samples that were skipped
        """
        if samples is None:
            samples = self

        num_cloned = 0
        num_skipped = 0
        with fou.ProgressBar() as pb:
            for sample in pb(samples):
                try:
                    _sample = self[sample.id]
                except KeyError:
                    num_skipped += 1
                    continue

                _sample[new_field_name] = deepcopy(sample[field_name])
                _sample.save()
                num_cloned += 1

        return num_cloned, num_skipped

    def save(self):
        """Saves dataset-level information such as its ``info`` to the
        database.
        """
        self._doc.save()

    def clone(self, name=None):
        """Creates a clone of the dataset containing deep copies of all samples
        and dataset-level information in this dataset.

        Args:
            name (None): a name for the cloned dataset. By default,
                :func:`get_default_dataset_name` is used

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = get_default_dataset_name()

        if dataset_exists(name):
            raise ValueError("Dataset '%s' already exists" % name)

        # Make a unique, permanent name for this sample collection
        sample_collection_name = _make_sample_collection_name()

        # Clone the samples
        clone_pipeline = [
            {"$match": {}},
            {"$out": sample_collection_name},
        ]
        self._sample_collection.aggregate(clone_pipeline)

        # Clone the dataset document
        self._doc.reload("sample_fields")
        dataset_doc = deepcopy(self._doc)
        dataset_doc.name = name
        dataset_doc.sample_collection_name = sample_collection_name
        dataset_doc.save()

        return load_dataset(name=name)

    def clear(self):
        """Removes all samples from the dataset.

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.
        """
        self._sample_doc_cls.drop_collection()
        fos.Sample._reset_all_backing_docs(self._sample_collection_name)

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
            label_field ("ground_truth"): the name of the field to use for the
                labels (if applicable)
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
            label_field ("ground_truth"): the name of the field to use for the
                labels (if applicable)
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

    def add_images(self, samples, sample_parser, tags=None):
        """Adds the given images to the dataset.

        This operation does not read the images.

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding images to a dataset by defining your own
        :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`.

        Args:
            samples: an iterable of samples
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            tags (None): an optional list of tags to attach to each sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
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
            label_field ("ground_truth"): the name of the field to use for the
                labels
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
        sample_parser,
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
            samples: an iterable of samples
            sample_parser: a
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
            label_field ("ground_truth"): the name of the field to use for the
                labels
            tags (None): an optional list of tags to attach to each sample
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
            label_field ("ground_truth"): the name of the field to use for the
                labels (if applicable)
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
            label_field ("ground_truth"): the name of the field to use for the
                labels (if applicable)
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
            label_field ("ground_truth"): the name of the field to use for the
                labels
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

    def aggregate(self, pipeline=None):
        """Calls the current MongoDB aggregation pipeline on the dataset.

        Args:
            pipeline (None): an optional aggregation pipeline (list of dicts)
                to aggregate on

        Returns:
            an iterable over the aggregation result
        """
        if pipeline is None:
            pipeline = []

        return self._sample_collection.aggregate(pipeline)

    def serialize(self):
        """Serializes the dataset.

        Returns:
            a JSON representation of the dataset
        """
        return {"name": self.name}

    @classmethod
    def from_dict(cls, d, name=None, rel_dir=None):
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

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = d["name"]

        if rel_dir is not None:
            rel_dir = os.path.abspath(os.path.expanduser(rel_dir))

        def parse_sample(sd):
            if rel_dir and not sd["filepath"].startswith(os.path.sep):
                sd["filepath"] = os.path.join(rel_dir, sd["filepath"])

            return fos.Sample.from_dict(sd)

        dataset = cls(name)

        # Apply schema
        dataset._apply_field_schema(d["sample_fields"])

        # Add samples
        samples = d["samples"]
        num_samples = len(samples)
        _samples = map(parse_sample, d["samples"])
        dataset.add_samples(
            _samples, expand_schema=False, num_samples=num_samples
        )

        return dataset

    @classmethod
    def from_json(cls, path_or_str, name=None, rel_dir=None):
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
        return cls.from_dict(d, name=name, rel_dir=rel_dir)

    def _add_view_stage(self, stage):
        return self.view().add_stage(stage)

    @property
    def _sample_collection_name(self):
        return self._sample_doc_cls._meta["collection"]

    @property
    def _sample_collection(self):
        return foo.get_db_conn()[self._sample_collection_name]

    def _apply_field_schema(self, new_fields):
        curr_fields = self.get_field_schema()
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
                # Add new sample field
                ftype, embedded_doc_type, subfield = fof.parse_field_str(
                    field_str
                )
                self.add_sample_field(
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
            for field_name in sample.to_mongo_dict():
                if field_name == "_id":
                    continue

                if field_name not in fields:
                    self._sample_doc_cls.add_implied_field(
                        field_name, sample[field_name]
                    )
                    fields = self.get_field_schema(include_private=True)

    def _sample_dict_to_doc(self, d):
        return self._sample_doc_cls.from_dict(d, extended=False)

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

        if non_existest_fields:
            msg = "The fields %s do not exist on the dataset '%s'" % (
                non_existest_fields,
                self.name,
            )
            raise FieldDoesNotExist(msg)

        for field_name, value in sample.iter_fields():
            field = fields[field_name]
            if value is None and field.null:
                continue

            field.validate(value)


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


def _create_dataset(name, persistent=False):
    # Ensure dataset with given `name` does not already exist
    if dataset_exists(name):
        raise ValueError(
            (
                "Dataset '%s' already exists; use `fiftyone.load_dataset()` "
                "to load an existing dataset"
            )
            % name
        )

    # Make a unique, permanent name for this sample collection
    sample_collection_name = _make_sample_collection_name()

    # Create SampleDocument class for this dataset
    sample_doc_cls = _create_sample_document_cls(sample_collection_name)

    # Create DatasetDocument for this dataset
    dataset_doc = foo.DatasetDocument(
        name=name,
        sample_collection_name=sample_collection_name,
        persistent=persistent,
        sample_fields=foo.SampleFieldDocument.list_from_field_schema(
            sample_doc_cls.get_field_schema(include_private=True)
        ),
    )
    dataset_doc.save()

    # Create indexes
    conn = foo.get_db_conn()
    collection = conn[sample_collection_name]
    collection.create_index("filepath", unique=True)

    return dataset_doc, sample_doc_cls


def _make_sample_collection_name():
    conn = foo.get_db_conn()
    now = datetime.datetime.now()
    name = "samples." + now.strftime("%Y.%m.%d.%H.%M.%S")
    if name in conn.list_collection_names():
        name = "samples." + now.strftime("%Y.%m.%d.%H.%M.%S.%f")

    return name


def _create_sample_document_cls(sample_collection_name):
    return type(sample_collection_name, (foo.DatasetSampleDocument,), {})


def _load_dataset(name):
    # Load DatasetDocument for dataset
    try:
        # pylint: disable=no-member
        dataset_doc = foo.DatasetDocument.objects.get(name=name)
    except DoesNotExist:
        raise DoesNotExistError("Dataset '%s' not found" % name)

    # Create SampleDocument class for this dataset
    sample_doc_cls = _create_sample_document_cls(
        dataset_doc.sample_collection_name
    )

    # Populate sample field schema
    default_fields = Dataset.get_default_sample_fields(include_private=True)
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

        sample_doc_cls.add_field(
            sample_field.name,
            etau.get_class(sample_field.ftype),
            subfield=subfield,
            embedded_doc_type=embedded_doc_type,
            save=False,
        )

    return dataset_doc, sample_doc_cls
