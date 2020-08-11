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
import fiftyone.core.odm as foo
import fiftyone.core.odm.sample as foos
import fiftyone.core.sample as fos
from fiftyone.core.singleton import DatasetSingleton
import fiftyone.core.view as fov
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


def list_dataset_names():
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
    if name in list_dataset_names():
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
    for dataset_name in list_dataset_names():
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
        persistent (False): whether the dataset will persist in the database
            once the session terminates
    """

    # Batch size used when commiting samples to the database
    _BATCH_SIZE = 128

    def __init__(self, name=None, persistent=False, _create=True):
        if name is None:
            name = get_default_dataset_name()

        self._name = name
        self._deleted = False

        if _create:
            self._meta, self._sample_doc_cls = _create_dataset(
                name, persistent=persistent
            )
        else:
            self._meta, self._sample_doc_cls = _load_dataset(name)

    def __len__(self):
        return self._collection.count_documents({})

    def __getitem__(self, sample_id_or_slice):
        if isinstance(sample_id_or_slice, numbers.Integral):
            raise ValueError(
                "Accessing dataset samples by numeric index is not supported. "
                "Use sample IDs instead"
            )

        if isinstance(sample_id_or_slice, slice):
            return self.view()[sample_id_or_slice]

        try:
            doc = self._get_query_set().get(id=sample_id_or_slice)
            return fos.Sample.from_doc(doc)
        except DoesNotExist:
            raise KeyError("No sample found with ID '%s'" % sample_id_or_slice)

    def __delitem__(self, sample_id):
        self.remove_sample(sample_id)

    def __getattribute__(self, name):
        if name.startswith("__") or name in [
            "name",
            "deleted",
            "_name",
            "_deleted",
        ]:
            return super().__getattribute__(name)

        if getattr(self, "_deleted", False):
            raise DoesNotExistError("Dataset '%s' is deleted" % self.name)

        return super().__getattribute__(name)

    @property
    def name(self):
        """The name of the dataset."""
        return self._name

    @property
    def persistent(self):
        """Whether the dataset persists in the database after a session is
        terminated.
        """
        return self._meta.persistent

    @persistent.setter
    def persistent(self, value):
        self._meta.persistent = value
        self._meta.save()

    @property
    def info(self):
        """A dictionary of information about the dataset."""
        return self._meta.info

    @info.setter
    def info(self, info):
        self._meta.info = info

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

        return fos.Sample.from_doc(sample_view._doc)

    def head(self, num_samples=3):
        """Returns a list of the first few samples in the dataset.

        If fewer than ``num_samples`` samples are in the dataset, only the
        available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [fos.Sample.from_doc(sv._doc) for sv in self[:num_samples]]

    def tail(self, num_samples=3):
        """Returns a list of the last few samples in the dataset.

        If fewer than ``num_samples`` samples are in the dataset, only the
        available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [fos.Sample.from_doc(sv._doc) for sv in self[-num_samples:]]

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
                :class:``fiftyone.core.fields.Field``
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:``fiftyone.core.odm.BaseEmbeddedDocument``
            include_private (False): a boolean indicating whether to return
                fields that start with the character "_"

        Returns:
             a dictionary mapping field names to field types
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
                :class:``fiftyone.core.fields.Field``
            embedded_doc_type (None): the
                ``fiftyone.core.odm.BaseEmbeddedDocument`` type of the field.
                Used only when ``ftype`` is
                :class:``fiftyone.core.fields.EmbeddedDocumentField``
            subfield (None): the type of the contained field. Used only when
                `ftype` is a list or dict type
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
        fos.Sample._purge_field(self.name, field_name)

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
        return set(self._collection.distinct(field))

    def iter_samples(self):
        """Returns an iterator over the samples in the dataset.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for doc in self._get_query_set():
            yield fos.Sample.from_doc(doc)

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
        self._collection.insert_one(d)  # adds `_id` to `d`

        if not sample._in_db:
            doc = self._sample_doc_cls.from_dict(d, extended=False)
            sample._set_backing_doc(doc)

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

        self._collection.insert_many(dicts)  # adds `_id` to each dict

        for sample, d in zip(samples, dicts):
            if not sample._in_db:
                doc = self._sample_doc_cls.from_dict(d, extended=False)
                sample._set_backing_doc(doc)

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

        self._collection.delete_one({"_id": ObjectId(sample_id)})

        fos.Sample._reset_backing_docs(
            dataset_name=self.name, sample_ids=[sample_id]
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
        self._collection.delete_many({"_id": {"$in": sample_object_ids}})

        fos.Sample._reset_backing_docs(
            dataset_name=self.name, sample_ids=sample_ids
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
        self._meta.save()

    def clear(self):
        """Removes all samples from the dataset.

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.
        """
        self._sample_doc_cls.drop_collection()
        fos.Sample._reset_all_backing_docs(self.name)

    def delete(self):
        """Deletes the dataset.

        Once deleted, only the ``name`` and ``deleted`` attributes of a dataset
        may be accessed.

        If reference to a sample exists in memory, the sample object will be
        updated such that ``sample.in_dataset == False``.
        """
        self.clear()
        self._meta.delete()
        self._deleted = True

    def add_dir(
        self,
        dataset_dir,
        dataset_type,
        label_field="ground_truth",
        tags=None,
        expand_schema=True,
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
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type`` via the syntax
                ``DatasetImporter(dataset_dir, **kwargs)``

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if inspect.isclass(dataset_type):
            dataset_type = dataset_type()

        dataset_importer_cls = dataset_type.get_dataset_importer_cls()
        dataset_importer = dataset_importer_cls(dataset_dir, **kwargs)

        return self.add_importer(
            dataset_importer,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
        )

    def add_importer(
        self,
        dataset_importer,
        label_field="ground_truth",
        tags=None,
        expand_schema=True,
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

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if isinstance(dataset_importer, foud.GenericSampleDatasetImporter):

            def parse_sample(sample):
                if tags:
                    sample.tags.extend(tags)

                return sample

        elif isinstance(dataset_importer, foud.UnlabeledImageDatasetImporter):

            def parse_sample(sample):
                image_path, image_metadata = sample
                return fos.Sample(
                    filepath=image_path, metadata=image_metadata, tags=tags,
                )

        elif isinstance(dataset_importer, foud.LabeledImageDatasetImporter):

            def parse_sample(sample):
                image_path, image_metadata, label = sample
                sample = fos.Sample(
                    filepath=image_path, metadata=image_metadata, tags=tags,
                )

                if label is not None:
                    sample[label_field] = label

                return sample

        else:
            raise ValueError(
                "Unsupported DatasetImporter type %s" % type(dataset_importer)
            )

        with dataset_importer:
            try:
                num_samples = len(dataset_importer)
            except:
                num_samples = None

            samples = map(parse_sample, iter(dataset_importer))
            return self.add_samples(
                samples, expand_schema=expand_schema, num_samples=num_samples
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
            a list of IDs of the samples in the dataset
        """
        if not sample_parser.has_image_path:
            raise ValueError(
                "Sample parser must have `has_image_path == True` to add its "
                "samples to the dataset"
            )

        def parse_sample(sample):
            sample_parser.with_sample(sample)

            image_path = sample_parser.get_image_path()

            if sample_parser.has_image_metadata:
                metadata = sample_parser.get_image_metadata()
            else:
                metadata = None

            return fos.Sample(
                filepath=image_path, metadata=metadata, tags=tags
            )

        try:
            num_samples = len(samples)
        except:
            num_samples = None

        _samples = map(parse_sample, samples)
        return self.add_samples(_samples, num_samples=num_samples)

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
        will not be read.

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
            a list of IDs of the samples in the dataset
        """
        if not sample_parser.has_image_path:
            raise ValueError(
                "Sample parser must have `has_image_path == True` to add its "
                "samples to the dataset"
            )

        def parse_sample(sample):
            sample_parser.with_sample(sample)

            image_path = sample_parser.get_image_path()

            if sample_parser.has_image_metadata:
                metadata = sample_parser.get_image_metadata()
            else:
                metadata = None

            label = sample_parser.get_label()

            sample = fos.Sample(
                filepath=image_path, metadata=metadata, tags=tags,
            )

            if label is not None:
                sample[label_field] = label

            return sample

        try:
            num_samples = len(samples)
        except:
            num_samples = None

        _samples = map(parse_sample, samples)
        return self.add_samples(
            _samples, expand_schema=expand_schema, num_samples=num_samples
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

    def add_images_patt(self, image_patt, tags=None):
        """Adds the given glob pattern of images to the dataset.

        This operation does not read the images.

        Args:
            image_patt: a glob pattern of images like ``/path/to/images/*.jpg``
            tags (None): an optional list of tags to attach to each sample

        Returns:
            a list of IDs of the samples in the dataset
        """
        image_paths = etau.parse_glob_pattern(image_patt)
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
    def from_images_patt(cls, image_patt, name=None, tags=None):
        """Creates a :class:`Dataset` from the given glob pattern of images.

        This operation does not read the images.

        Args:
            image_patt: a glob pattern of images like ``/path/to/images/*.jpg``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional list of tags to attach to each sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_images_patt(image_patt, tags=tags)
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

        return self._collection.aggregate(pipeline)

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

        samples = d["samples"]
        num_samples = len(samples)
        _samples = map(parse_sample, d["samples"])

        dataset = cls(name)
        dataset.add_samples(_samples, num_samples=num_samples)
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
    def _collection_name(self):
        return self._sample_doc_cls._meta["collection"]

    @property
    def _collection(self):
        return foo.get_db_conn()[self._collection_name]

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

    def _get_query_set(self, **kwargs):
        # pylint: disable=no-member
        return self._sample_doc_cls.objects(**kwargs)

    def _to_fields_str(self, field_schema):
        fields_dict = {
            field_name: str(field)
            for field_name, field in field_schema.items()
        }
        max_len = max([len(field_name) for field_name in fields_dict]) + 1
        return "\n".join(
            "    %s %s" % ((field_name + ":").ljust(max_len), field)
            for field_name, field in fields_dict.items()
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
    if dataset_exists(name):
        raise ValueError(
            (
                "Dataset '%s' already exists; use `fiftyone.load_dataset()` "
                "to load an existing dataset"
            )
            % name
        )

    # Create sample class
    _sample_doc_cls = type(name, (foo.DatasetSampleDocument,), {})

    # Create dataset meta document
    _meta = foo.DatasetDocument(
        name=name,
        sample_fields=foo.SampleFieldDocument.list_from_field_schema(
            _sample_doc_cls.get_field_schema(include_private=True)
        ),
        persistent=persistent,
    )
    _meta.save()

    # Create indexes
    collection_name = _sample_doc_cls._meta["collection"]
    collection = foo.get_db_conn()[collection_name]
    collection.create_index("filepath", unique=True)

    return _meta, _sample_doc_cls


def _load_dataset(name):
    try:
        # pylint: disable=no-member
        _meta = foo.DatasetDocument.objects.get(name=name)
    except DoesNotExist:
        raise DoesNotExistError("Dataset '%s' not found" % name)

    _sample_doc_cls = type(name, (foo.DatasetSampleDocument,), {})

    num_default_fields = len(foos.default_sample_fields(include_private=True))

    for sample_field in _meta.sample_fields[num_default_fields:]:
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

        _sample_doc_cls.add_field(
            sample_field.name,
            etau.get_class(sample_field.ftype),
            subfield=subfield,
            embedded_doc_type=embedded_doc_type,
            save=False,
        )

    return _meta, _sample_doc_cls
