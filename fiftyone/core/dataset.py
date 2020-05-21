"""
FiftyOne datasets.

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
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import datetime
import logging
import numbers
import os

from mongoengine import ListField, DictField, EmbeddedDocumentField
from mongoengine.errors import DoesNotExist

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
from fiftyone.core.singleton import DatasetSingleton
import fiftyone.core.view as fov
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


def list_dataset_names():
    """Returns the list of available FiftyOne datasets.

    Returns:
        a list of :class:`Dataset` names
    """
    # pylint: disable=no-member
    return list(foo.ODMDataset.objects.distinct("name"))


def load_dataset(name):
    """Loads the FiftyOne dataset with the given name.

    Args:
        name: the name of the dataset

    Returns:
        a :class:`Dataset`
    """
    return Dataset(name, create_empty=False)


def get_default_dataset_name():
    """Returns a default dataset name based on the current time.

    Returns:
        a dataset name
    """
    name = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    logger.info("Using default dataset name '%s'", name)
    return name


def get_default_dataset_dir(name, split=None):
    """Returns the default dataset directory for the dataset with the given
    name.

    Args:
        name: the dataset name
        split (None): an optional split

    Returns:
        the default dataset directory
    """
    dataset_dir = os.path.join(fo.config.default_dataset_dir, name)
    if split is not None:
        dataset_dir = os.path.join(dataset_dir, split)

    logger.info("Using default dataset directory '%s'", dataset_dir)
    return dataset_dir


class Dataset(foc.SampleCollection, metaclass=DatasetSingleton):
    """A FiftyOne dataset.

    Datasets represent a homogeneous collection of
    :class:`fiftyone.core.sample.Sample` instances that describe a particular
    type of raw media (e.g., images) together with a user-defined set of
    fields.

    FiftyOne datasets ingest and store the labels for all samples internally;
    raw media is stored on disk and the dataset provides paths to the data.

    Args:
        name: the name of the dataset
        create_empty (True): whether to create a dataset with the given name
            if it does not already exist
    """

    def __init__(self, name, create_empty=True):
        self._name = name
        self._sample_doc_cls = None
        self._meta = None

        try:
            self._load_dataset(name=name)
        except DoesNotExist:
            if create_empty:
                self._initialize_dataset(name=name)
            else:
                raise ValueError("Dataset '%s' not found" % name)

    def __len__(self):
        return self._get_query_set().count()

    def __getitem__(self, sample_id):
        if isinstance(sample_id, numbers.Integral):
            raise ValueError(
                "Accessing dataset samples by numeric index is not supported. "
                "Use sample IDs instead"
            )

        if isinstance(sample_id, slice):
            raise ValueError(
                "Slicing datasets is not supported. Use `view()` to "
                "obtain a DatasetView if you want to slice your samples"
            )

        try:
            doc = self._get_query_set().get(id=sample_id)
            return self._load_sample_from_doc(doc)
        except DoesNotExist:
            raise KeyError("No sample found with ID '%s'" % sample_id)

    def __delitem__(self, sample_id):
        self[sample_id]._delete()

    @property
    def name(self):
        """The name of the dataset."""
        return self._name

    def summary(self):
        """Returns a string summary of the dataset.

        Returns:
            a string summary
        """
        return "\n".join(
            [
                "Name:           %s" % self.name,
                "Num samples:    %d" % len(self),
                "Tags:           %s" % list(self.get_tags()),
                "Sample fields:",
                self._get_fields_str(),
            ]
        )

    def get_sample_fields(self, ftype=None):
        """Returns a schema dictionary describing the fields of the samples
        in the dataset.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                ``mongoengine.fields.BaseField``

        Returns:
             a dictionary mapping field names to field types
        """
        return self._sample_doc_cls.get_field_schema(ftype=ftype)

    def add_sample_field(
        self, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        """Adds a new sample field to the dataset.

        Args:
            field_name: the field name
            ftype: the field type to create. Must be a subclass of
                ``mongoengine.fields.BaseField``
            embedded_doc_type (None): the
                ``mongoengine.fields.EmbeddedDocument`` type of the field. Used
                only when ``ftype == EmbeddedDocumentField``
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

    def get_tags(self):
        """Returns the set of tags in the dataset.

        Returns:
            a set of tags
        """
        return self.distinct("tags")

    def iter_samples(self):
        """Returns an iterator over the samples in the dataset.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for doc in self._get_query_set():
            yield self._load_sample_from_doc(doc)

    def add_sample(self, sample, expand_schema=True):
        """Adds the given sample to the dataset.

        If the sample belongs to another dataset, a copy is created and added
        to this dataset.

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

        doc = self._sample_doc_cls(**sample.to_dict())
        sample._set_backing_doc(doc)

        return sample.id

    def add_samples(self, samples, expand_schema=True):
        """Adds the given samples to the dataset.

        If a sample belongs to another dataset, a copy is created and added to
        this dataset.

        Args:
            samples: an iterable of :class:`fiftyone.core.sample.Sample`
                instances. For example, ``samples`` may be a :class:`Dataset`
                or a :class:`fiftyone.core.views.DatasetView`
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema

        Returns:
            a list of IDs of the samples in the dataset

        Raises:
            :class:`mongoengine.errors.ValidationError` if a field of a sample
            has a type that is inconsistent with the dataset schema, or if
            ``expand_schema == False`` and a new field is encountered
        """
        # Create copies of any samples already in datasets
        samples = [s.copy() if s._in_db else s for s in samples]

        if expand_schema:
            self._expand_schema(samples)

        docs = self._get_query_set().insert(
            [self._sample_doc_cls(**sample.to_dict()) for sample in samples]
        )

        for sample, doc in zip(samples, docs):
            sample._set_backing_doc(doc)

        return [str(doc.id) for doc in docs]

    def update_samples(self):
        # @todo(Tyler) making this a TODO. Jason wants to add a tag to all
        #   samples in a view
        raise NotImplementedError("Not yet implemented")

    def delete_sample(self, sample_or_id):
        """Deletes the given sample from the dataset.

        Args:
            sample_or_id: the :class:`fiftyone.core.sample.Sample` or sample
                ID to delete
        """
        if isinstance(sample_or_id, fos.Sample):
            sample_id = sample_or_id.id
        else:
            sample_id = sample_or_id

        del self[sample_id]

    def delete_samples(self, samples_or_ids):
        """Deletes the given samples from the dataset.

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
        self._get_query_set(id__in=sample_ids).delete()

    def clear(self):
        """Deletes all samples from the dataset."""
        self._sample_doc_cls.drop_collection()

    def view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        entire dataset.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return fov.DatasetView(self)

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
        return set(self._get_query_set().distinct(field))

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

        return self._get_query_set().aggregate(pipeline)

    def serialize(self):
        """Serializes the dataset.

        Returns:
            a JSON representation of the dataset
        """
        return {"name": self.name}

    @classmethod
    def from_image_classification_samples(
        cls, samples, name=None, label_field="ground_truth", labels_map=None,
    ):
        """Creates a :class:`Dataset` for the given image classification
        samples.

        The input ``samples`` can be any iterable that emits
        ``(image_path, target)`` tuples, where:

            - ``image_path`` is the path to the image on disk

            - ``target`` is either a label string, or, if a ``labels_map`` is
              provided, a class ID that can be mapped to a label string via
              ``labels_map[target]``

        For example, ``samples`` may be a ``torch.utils.data.Dataset`` or an
        iterable generated by ``tf.data.Dataset.as_numpy_iterator()``.

        If your samples do not fit this schema, see
        :func:`Dataset.from_labeled_image_samples` for details on how to
        provide your own :class:`fiftyone.utils.data.LabeledImageSampleParser`
        to parse your samples.

        This operation will iterate over all provided samples, but the images
        will not be read.

        Args:
            samples: an iterable of samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name of the field to use for the
                labels
            labels_map (None): an optional dict mapping class IDs to label
                strings. If provided, it is assumed that ``target`` is a class
                ID that should be mapped to a label string via
                ``labels_map[target]``

        Returns:
            a :class:`Dataset`
        """
        sample_parser = foud.ImageClassificationSampleParser(
            labels_map=labels_map
        )
        return cls.from_labeled_image_samples(
            samples,
            name=name,
            label_field=label_field,
            sample_parser=sample_parser,
        )

    @classmethod
    def from_image_detection_samples(
        cls, samples, name=None, label_field="ground_truth", labels_map=None,
    ):
        """Creates a :class:`Dataset` for the given image detection samples.

        The input ``samples`` can be any iterable that emits
        ``(image_path, detections)`` tuples, where:

            - ``image_path`` is the path to the image on disk

            - ``detections`` is a list of detections in the following format::

                [
                    {
                        "label": <label>,
                        "bounding_box": [
                            <top-left-x>, <top-left-y>, <width>, <height>
                        ],
                        "confidence": <optional-confidence>,
                    },
                    ...
                ]

              where ``label`` is either a label string, or, if a ``labels_map``
              is provided, a class ID that can be mapped to a label string via
              ``labels_map[label]``, and the bounding box coordinates are
              relative values in ``[0, 1] x [0, 1]``

        For example, ``samples`` may be a ``torch.utils.data.Dataset`` or an
        iterable generated by ``tf.data.Dataset.as_numpy_iterator()``.

        If your samples do not fit this schema, see
        :func:`Dataset.from_labeled_image_samples` for details on how to
        provide your own :class:`fiftyone.utils.data.LabeledImageSampleParser`
        to parse your samples.

        This operation will iterate over all provided samples, but the images
        will not be read.

        Args:
            samples: an iterable of samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name of the field to use for the
                labels
            labels_map (None): an optional dict mapping class IDs to label
                strings. If provided, it is assumed that the ``label`` values
                in ``target`` are class IDs that should be mapped to label
                strings via ``labels_map[label]``

        Returns:
            a :class:`Dataset`
        """
        sample_parser = foud.ImageDetectionSampleParser(labels_map=labels_map)
        return cls.from_labeled_image_samples(
            samples,
            name=name,
            label_field=label_field,
            sample_parser=sample_parser,
        )

    @classmethod
    def from_image_labels_samples(
        cls, samples, name=None, label_field="ground_truth"
    ):
        """Creates a :class:`Dataset` for the given image labels samples.

        The input ``samples`` can be any iterable that emits
        ``(image_path, image_labels)`` tuples, where:

            - ``image_path`` is the path to the image on disk

            - ``image_labels`` is an ``eta.core.image.ImageLabels`` instance
              or a serialized dict representation of one

        For example, ``samples`` may be a ``torch.utils.data.Dataset`` or an
        iterable generated by ``tf.data.Dataset.as_numpy_iterator()``.

        If your samples do not fit this schema, see
        :func:`Dataset.from_labeled_image_samples` for details on how to
        provide your own :class:`fiftyone.utils.data.LabeledImageSampleParser`
        to parse your samples.

        This operation will iterate over all provided samples, but the images
        will not be read.

        Args:
            samples: an iterable of samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name of the field to use for the
                labels

        Returns:
            a :class:`Dataset`
        """
        sample_parser = foud.ImageLabelsSampleParser()
        return cls.from_labeled_image_samples(
            samples,
            name=name,
            label_field=label_field,
            sample_parser=sample_parser,
        )

    @classmethod
    def from_labeled_image_samples(
        cls, samples, name=None, label_field="ground_truth", sample_parser=None
    ):
        """Creates a :class:`Dataset` for the given labeled image samples.

        The input ``samples`` can be any iterable that emits
        ``(image_path, label)`` tuples, where:

            - ``image_path`` is the path to the image on disk

            - ``label`` is a :class:`fiftyone.core.labels.Label` instance
              containing the image label(s)

        If your samples require preprocessing to convert to the above format,
        you can provide a custom
        :class:`fiftyone.utils.data.LabeledImageSampleParser` instance via
        the ``sample_parser`` argument whose
        :func:`fiftyone.utils.data.LabeledImageSampleParser.parse_label` method
        will be used to parse the sample labels in the input iterable.

        This operation will iterate over all provided samples, but the images
        will not be read.

        Args:
            samples: an iterable of samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name of the field to use for the
                labels
            sample_parser (None): a
                :class:`fiftyone.utils.data.LabeledImageSampleParser` instance
                whose :func:`fiftyone.utils.data.LabeledImageSampleParser.parse_label`
                method will be used to parse the sample labels

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = get_default_dataset_name()

        # @todo add a progress bar here? Note that `len(samples)` may not work
        # for some iterables
        logger.info("Parsing samples...")
        _samples = []
        for sample in samples:
            if sample_parser is not None:
                label = sample_parser.parse_label(sample)
            else:
                label = sample[1]

            filepath = os.path.abspath(os.path.expanduser(sample[0]))

            _samples.append(
                fo.Sample(filepath=filepath, **{label_field: label})
            )

        logger.info(
            "Creating dataset '%s' containing %d samples", name, len(_samples),
        )
        dataset = cls(name)

        if samples:
            dataset.add_samples(_samples)

        return dataset

    @classmethod
    def ingest_labeled_image_samples(
        cls,
        samples,
        name=None,
        label_field="ground_truth",
        dataset_dir=None,
        sample_parser=None,
        image_format=fo.config.default_image_ext,
    ):
        """Creates a :class:`Dataset` for the given iterable of samples, which
        contains images and their associated labels.

        The images are read in-memory and written to the given dataset
        directory. The labels are ingested by FiftyOne.

        The input ``samples`` can be any iterable that emits
        ``(image_or_path, label)`` tuples, where:

            - ``image_or_path`` is either an image that can be converted to
              numpy format via ``np.asarray()`` or the path to an image on disk

            - ``label`` is a :class:`fiftyone.core.labels.Label` instance

        If your samples require preprocessing to convert to the above format,
        you can provide a custom
        :class:`fiftyone.utils.data.LabeledImageSampleParser` instance via the
        ``sample_parser`` argument whose
        :func:`fiftyone.utils.data.LabeledImageSampleParser.parse` method will
        be used to parse the input samples.

        Args:
            samples: an iterable of images
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name of the field to use for the
                labels
            dataset_dir (None): the directory in which the images will be
                written. By default, :func:`get_default_dataset_dir` is used
            sample_parser (None): a
                :class:`fiftyone.utils.data.LabeledImageSampleParser` instance
                whose :func:`fiftyone.utils.data.LabeledImageSampleParser.parse`
                method will be used to parse the images
            image_format (``fiftyone.config.default_image_ext``): the image
                format to use to write the images to disk

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = get_default_dataset_name()

        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(name)

        _samples = foud.parse_labeled_images(
            samples,
            dataset_dir,
            sample_parser=sample_parser,
            image_format=image_format,
        )

        return cls.from_labeled_image_samples(
            _samples, name=name, label_field=label_field
        )

    @classmethod
    def from_image_classification_dataset(
        cls, dataset_dir, name=None, label_field="ground_truth"
    ):
        """Creates a :class:`Dataset` for the given image classification
        dataset stored on disk.

        See :class:`fiftyone.types.ImageClassificationDataset` for format
        details.

        Args:
            dataset_dir: the directory containing the dataset
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name of the field to use for the
                labels

        Returns:
            a :class:`Dataset`
        """
        samples = foud.parse_image_classification_dataset(dataset_dir)
        return cls.from_labeled_image_samples(
            samples, name=name, label_field=label_field
        )

    @classmethod
    def from_image_detection_dataset(
        cls, dataset_dir, name=None, label_field="ground_truth"
    ):
        """Creates a :class:`Dataset` for the given image detection dataset
        stored on disk.

        See :class:`fiftyone.types.ImageDetectionDataset` for format details.

        Args:
            dataset_dir: the directory containing the dataset
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name of the field to use for the
                labels

        Returns:
            a :class:`Dataset`
        """
        samples = foud.parse_image_detection_dataset(dataset_dir)
        return cls.from_labeled_image_samples(
            samples, name=name, label_field=label_field
        )

    @classmethod
    def from_image_labels_dataset(
        cls, dataset_dir, name=None, label_field="ground_truth"
    ):
        """Creates a :class:`Dataset` for the given image labels dataset stored
        on disk.

        See :class:`fiftyone.types.ImageLabelsDataset` for format details.

        Args:
            dataset_dir: the directory containing the dataset
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field ("ground_truth"): the name of the field to use for the
                labels

        Returns:
            a :class:`Dataset`
        """
        samples = foud.parse_image_labels_dataset(dataset_dir)
        return cls.from_labeled_image_samples(
            samples, name=name, label_field=label_field
        )

    @classmethod
    def from_images_dir(cls, images_dir, recursive=False, name=None):
        """Creates a :class:`Dataset` for the given directory of images.

        This operation does not read the images.

        Args:
            images_dir: a directory of images
            recursive (False): whether to recursively traverse subdirectories
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used

        Returns:
            a :class:`Dataset`
        """
        image_paths = etau.list_files(
            images_dir, abs_paths=True, recursive=recursive
        )
        return cls.from_images(image_paths, name=name)

    @classmethod
    def from_images_patt(cls, image_patt, name=None):
        """Creates a :class:`Dataset` for the given glob pattern of images.

        This operation does not read the images.

        Args:
            image_patt: a glob pattern of images like ``/path/to/images/*.jpg``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used

        Returns:
            a :class:`Dataset`
        """
        image_paths = etau.parse_glob_pattern(image_patt)
        return cls.from_images(image_paths, name=name)

    @classmethod
    def from_images(cls, image_paths, name=None):
        """Creates a :class:`Dataset` for the given list of images.

        This operation does not read the images.

        Args:
            image_paths: a list of image paths
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = get_default_dataset_name()

        logger.info("Parsing image paths...")
        _samples = []
        for image_path in image_paths:
            filepath = os.path.abspath(os.path.expanduser(image_path))
            _samples.append(filepath=filepath)

        logger.info(
            "Creating dataset '%s' containing %d samples", name, len(_samples),
        )
        dataset = cls(name)
        dataset.add_samples(_samples)
        return dataset

    @classmethod
    def ingest_images(
        cls,
        samples,
        name=None,
        dataset_dir=None,
        sample_parser=None,
        image_format=fo.config.default_image_ext,
    ):
        """Creates a :class:`Dataset` for the given iterable of samples, which
        contains images that are read in-memory and written to the given
        dataset directory.

        The input ``samples`` can be any iterable that emits images (or paths
        to images on disk) that can be converted to numpy format via
        ``np.asarray()``.

        If your samples require preprocessing to convert to the above format,
        you can provide a custom
        :class:`fiftyone.utils.data.UnlabeledImageSampleParser` instance via
        the ``sample_parser`` argument whose
        :func:`fiftyone.utils.data.UnlabeledImageSampleParser.parse` method
        will be used to parse the images in the input iterable.

        Args:
            samples: an iterable of images
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            dataset_dir (None): the directory in which the images will be
                written. By default, :func:`get_default_dataset_dir` is used
            sample_parser (None): a
                :class:`fiftyone.utils.data.UnlabeledImageSampleParser`
                instance whose
                :func:`fiftyone.utils.data.UnlabeledImageSampleParser.parse`
                method will be used to parse the images
            image_format (``fiftyone.config.default_image_ext``): the image
                format to use to write the images to disk

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = get_default_dataset_name()

        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(name)

        image_paths = foud.to_images_dir(
            samples,
            dataset_dir,
            sample_parser=sample_parser,
            image_format=image_format,
        )

        return cls.from_images(image_paths, name=name)

    def _initialize_dataset(self, name):
        # Create ODMDatasetSample subclass
        self._sample_doc_cls = type(self._name, (foo.ODMDatasetSample,), {})

        # Create dataset meta document
        self._meta = foo.ODMDataset(
            name=name,
            sample_fields=foo.SampleField.list_from_field_schema(
                self.get_sample_fields()
            ),
        )

        # Save dataset meta document
        self._meta.save()

    def _load_dataset(self, name):
        # pylint: disable=no-member
        self._meta = foo.ODMDataset.objects.get(name=name)

        self._sample_doc_cls = type(self._name, (foo.ODMDatasetSample,), {})

        fields = self.get_sample_fields()
        fields.pop("id")

        for idx, field in enumerate(itervalues(fields)):
            sample_field = self._meta.sample_fields[idx]
            if not sample_field.matches_field(field):
                # @todo(Tyler) handle deleted default fields
                raise ValueError("Deleting default fields is not supported")

        for sample_field in self._meta.sample_fields[len(fields) :]:
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

            self._sample_doc_cls.add_field(
                sample_field.name,
                etau.get_class(sample_field.ftype),
                subfield=subfield,
                embedded_doc_type=embedded_doc_type,
                save=False,
            )

    def _expand_schema(self, samples):
        fields = self.get_sample_fields()
        for sample in samples:
            for field_name, field in iteritems(sample.get_field_schema()):
                if field_name not in fields:
                    self._sample_doc_cls.add_implied_field(
                        field_name, sample[field_name]
                    )
                    fields = self.get_sample_fields()

    def _load_sample_from_dict(self, d):
        doc = self._sample_doc_cls.from_dict(d, created=False, extended=False)
        return self._load_sample_from_doc(doc)

    def _load_sample_from_doc(self, doc):
        return fos.Sample.from_doc(doc)

    def _get_query_set(self, **kwargs):
        # pylint: disable=no-member
        return self._sample_doc_cls.objects(**kwargs)

    def _get_fields_str(self):
        fields = self.get_sample_fields()
        max_len = max([len(field_name) for field_name in fields]) + 1
        return "\n".join(
            "    %s %s"
            % ((field_name + ":").ljust(max_len), self._field_to_str(field))
            for field_name, field in iteritems(fields)
        )

    @staticmethod
    def _field_to_str(field):
        field_str = etau.get_class_name(field)

        if any(isinstance(field, cls) for cls in [ListField, DictField]):
            field_str += "(field=%s)" % etau.get_class_name(field.field)
        elif isinstance(field, EmbeddedDocumentField):
            field_str += "(document_type=%s)" % etau.get_class_name(
                field.document_type
            )

        return field_str
