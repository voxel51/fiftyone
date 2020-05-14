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

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import datetime
import logging
import numbers
import os

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
import fiftyone.core.view as fov
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


def list_dataset_names():
    """Returns the list of available FiftyOne datasets.

    Returns:
        a list of :class:`Dataset` names
    """
    # pylint: disable=no-member
    return foo.ODMSample.objects.distinct("dataset")


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


#
# @todo datasets should be registered in the DB even if they are empty
# Currently they only "appear" in the DB when they have their first sample
# added
#
class Dataset(foc.SampleCollection):
    """A FiftyOne dataset.

    Datasets represent a homogeneous collection of
    :class:`fiftyone.core.sample.Sample` instances that describe a particular
    type of raw media (e.g., images) together with one or more sets of
    :class:`fiftyone.core.labels.Label` instances (e.g., ground truth
    annotations or model predictions) and metadata associated with those
    labels.

    FiftyOne datasets ingest and store the labels for all samples internally;
    raw media is stored on disk and the dataset provides paths to the data.

    Args:
        name: the name of the dataset
        create_empty (True): whether to create a dataset with the given name
            if it does not already exist
    """

    def __init__(self, name, create_empty=True):
        self._name = name

        # @todo populate this when reading an existing collection from the DB
        self._label_types = {}

        if not create_empty and not self:
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
                "Slicing datasets is not supported. Use `default_view()` to "
                "obtain a DatasetView if you want to slice your samples"
            )

        if isinstance(sample_id, slice):
            return self.default_view()[sample_id]

        samples = self._get_query_set(id=sample_id)
        if not samples:
            raise ValueError("No sample found with ID '%s'" % sample_id)

        return self._load_sample(samples[0])

    def __delitem__(self, sample_id):
        self[sample_id]._delete()

    @property
    def name(self):
        """The name of the dataset."""
        return self._name

    @property
    def _sample_cls(self):
        """The :class:`fiftyone.core.sample.Sample` class that this dataset
        can contain.
        """
        return fos.Sample

    def summary(self):
        """Returns a string summary of the dataset.

        Returns:
            a string summary
        """
        return "\n".join(
            [
                "Name:           %s" % self.name,
                "Num samples:    %d" % len(self),
                "Tags:           %s" % self.get_tags(),
                "Label groups:   %s" % self.get_label_groups(),
                "Insight groups: %s" % self.get_insight_groups(),
            ]
        )

    def sample(self, num_samples=3):
        """Returns a string summary of a few random samples from the dataset.

        Args:
            num_samples (3): the number of samples

        Returns:
            a string representation of the samples
        """
        return (
            self.default_view()
            .sample(num_samples)
            .head(num_samples=num_samples)
        )

    def get_tags(self):
        """Returns the list of tags in the dataset.

        Returns:
            a list of tags
        """
        return self._get_query_set().distinct("tags")

    def iter_samples(self):
        """Returns an iterator over the samples in the dataset.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for doc in self._get_query_set():
            yield self._load_sample(doc)

    def add_sample(self, sample):
        """Adds the given sample to the dataset.

        If the sample belongs to another dataset, a copy is created and added
        to this dataset.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`

        Returns:
            the ID of the sample in the dataset
        """
        sample = self._ingest_sample(sample)
        sample._save()
        return sample.id

    def add_samples(self, samples):
        """Adds the given samples to the dataset.

        If a sample belongs to another dataset, a copy is created and added to
        this dataset.

        Args:
            samples: an iterable of :class:`fiftyone.core.sample.Sample`
                instances. For example, ``samples`` may be another
                :class:`Dataset` or a :class:`fiftyone.core.views.DatasetView`

        Returns:
            a list of IDs of the samples in the dataset
        """
        samples = [self._ingest_sample(s) for s in samples]
        sample_docs = self._get_query_set().insert(
            [s._backing_doc for s in samples]
        )
        return [str(s.id) for s in sample_docs]

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
        # @todo optimize with bulk deletion?
        for sample_or_id in samples_or_ids:
            self.delete_sample(sample_or_id)

    def clear(self):
        """Deletes all samples from the dataset."""
        # @todo optimize by deleteing the entire collection
        self.delete_samples(self)

    def default_view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        entire dataset.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return fov.DatasetView(self)

    @classmethod
    def from_image_classification_samples(
        cls, samples, name=None, group="ground_truth", labels_map=None,
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
            group ("ground_truth"): the group name to use for the labels
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
            samples, name=name, group=group, sample_parser=sample_parser
        )

    @classmethod
    def from_image_detection_samples(
        cls, samples, name=None, group="ground_truth", labels_map=None,
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
            group ("ground_truth"): the group name to use for the labels
            labels_map (None): an optional dict mapping class IDs to label
                strings. If provided, it is assumed that the ``label`` values
                in ``target`` are class IDs that should be mapped to label
                strings via ``labels_map[label]``

        Returns:
            a :class:`Dataset`
        """
        sample_parser = foud.ImageDetectionSampleParser(labels_map=labels_map)
        return cls.from_labeled_image_samples(
            samples, name=name, group=group, sample_parser=sample_parser
        )

    @classmethod
    def from_image_labels_samples(
        cls, samples, name=None, group="ground_truth"
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
            group ("ground_truth"): the group name to use for the labels

        Returns:
            a :class:`Dataset`
        """
        sample_parser = foud.ImageLabelsSampleParser()
        return cls.from_labeled_image_samples(
            samples, name=name, group=group, sample_parser=sample_parser
        )

    @classmethod
    def from_labeled_image_samples(
        cls, samples, name=None, group="ground_truth", sample_parser=None
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
            group ("ground_truth"): the group name to use for the labels
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
            _sample = fos.Sample.create(filepath)

            _sample.add_label(group, label)
            _samples.append(_sample)

        logger.info(
            "Creating dataset '%s' containing %d samples", name, len(_samples)
        )
        dataset = cls(name)
        dataset.add_samples(_samples)
        return dataset

    @classmethod
    def ingest_labeled_image_samples(
        cls,
        samples,
        name=None,
        group="ground_truth",
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
            group ("ground_truth"): the group name to use for the labels
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

        return cls.from_labeled_image_samples(_samples, name=name, group=group)

    @classmethod
    def from_image_classification_dataset(
        cls, dataset_dir, name=None, group="ground_truth"
    ):
        """Creates a :class:`Dataset` for the given image classification
        dataset stored on disk.

        See :class:`fiftyone.types.ImageClassificationDataset` for format
        details.

        Args:
            dataset_dir: the directory containing the dataset
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            group ("ground_truth"): the group name to use for the labels

        Returns:
            a :class:`Dataset`
        """
        samples = foud.parse_image_classification_dataset(dataset_dir)
        return cls.from_labeled_image_samples(samples, name=name, group=group)

    @classmethod
    def from_image_detection_dataset(
        cls, dataset_dir, name=None, group="ground_truth"
    ):
        """Creates a :class:`Dataset` for the given image detection dataset
        stored on disk.

        See :class:`fiftyone.types.ImageDetectionDataset` for format details.

        Args:
            dataset_dir: the directory containing the dataset
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            group ("ground_truth"): the group name to use for the labels

        Returns:
            a :class:`Dataset`
        """
        samples = foud.parse_image_detection_dataset(dataset_dir)
        return cls.from_labeled_image_samples(samples, name=name, group=group)

    @classmethod
    def from_image_labels_dataset(
        cls, dataset_dir, name=None, group="ground_truth"
    ):
        """Creates a :class:`Dataset` for the given image labels dataset stored
        on disk.

        See :class:`fiftyone.types.ImageLabelsDataset` for format details.

        Args:
            dataset_dir: the directory containing the dataset
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            group ("ground_truth"): the group name to use for the labels

        Returns:
            a :class:`Dataset`
        """
        samples = foud.parse_image_labels_dataset(dataset_dir)
        return cls.from_labeled_image_samples(samples, name=name, group=group)

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
        samples = []
        for image_path in image_paths:
            filepath = os.path.abspath(os.path.expanduser(image_path))
            samples.append(fos.Sample.create(filepath))

        logger.info(
            "Creating dataset '%s' containing %d samples", name, len(samples)
        )
        dataset = cls(name)
        dataset.add_samples(samples)
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

    def serialize(self):
        """Serializes the dataset.

        Returns:
            a JSON representation of the dataset
        """
        return {"name": self.name}

    def _aggregate(self, pipeline=None):
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

    def _ingest_sample(self, sample):
        self._validate_sample(sample)
        sample = sample.copy() if sample.in_dataset else sample
        sample._set_dataset(self)
        return sample

    def _load_sample(self, doc):
        sample = fos.Sample.from_doc(doc)
        sample._set_dataset(self)
        return sample

    def _get_query_set(self, **kwargs):
        # pylint: disable=no-member
        return foo.ODMSample.objects(dataset=self.name, **kwargs)

    def _validate_sample(self, sample):
        if not isinstance(sample, self._sample_cls):
            raise ValueError(
                "Expected sample to be an instance of '%s'; found '%s'"
                % (
                    etau.get_class_name(self._sample_cls),
                    etau.get_class_name(sample),
                )
            )

    def _validate_label(self, group, label):
        if group not in self._label_types:
            self._label_types[group] = label.__class__
        else:
            label_cls = self._label_types[group]
            if not isinstance(label, label_cls):
                raise ValueError(
                    "Expected label to be an instance of '%s'; found '%s'"
                    % (
                        etau.get_class_name(label_cls),
                        etau.get_class_name(label),
                    )
                )
