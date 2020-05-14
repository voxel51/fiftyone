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

from mongoengine import EmbeddedDocumentField

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
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
    # @todo(Tyler) list_dataset_names()
    #   this won't work until MetaDataset is implemented
    raise NotImplementedError("TODO")


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

    _instances = {}

    def __new__(cls, name, *args, **kwargs):
        if name not in cls._instances:
            cls._instances[name] = super(Dataset, cls).__new__(cls)
        return cls._instances[name]

    def __init__(self, name, create_empty=True):
        self._name = name

        # @todo(Tyler) use MetaDataset to load this class from the DB
        self._Doc = type(self._name, (fos.ODMSample,), {})

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

        # @todo(Tyler) this could be optimized with
        #    sample = self._get_query_set().get(id=sample_id)
        #   but it seems to raise an uncatachble error?
        samples = self._get_query_set(id=sample_id)
        if not samples:
            raise ValueError("No sample found with ID '%s'" % sample_id)

        return samples[0]

    def __delitem__(self, sample_id):
        self[sample_id].delete()

    @property
    def name(self):
        """The name of the dataset."""
        return self._name

    def summary(self):
        """Returns a string summary of the dataset.

        Returns:
            a string summary
        """
        fields_str = self._get_fields_str()

        return "\n".join(
            [
                "Name:           %s" % self.name,
                "Num samples:    %d" % len(self),
                "Tags:           %s" % self.get_tags(),
                "Sample Fields:",
                fields_str,
            ]
        )

    def get_sample_fields(self, field_type=None):
        return self._Doc.get_fields(field_type=field_type)

    def get_tags(self):
        """Returns the list of tags in the dataset.

        Returns:
            a list of tags
        """
        return self.distinct("tags")

    def iter_samples(self):
        """Returns an iterator over the samples in the dataset.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for doc in self._get_query_set():
            yield doc

    def add_sample(self, *args, **kwargs):
        """Adds the given sample to the dataset.

        Args:
            args and kwargs used to initialize a sample (this varies depending
                on what fields the dataset has)

        Returns:
            the ID of the sample
        """
        sample = self._Doc(*args, **kwargs)
        sample.save()
        return str(sample.id)

    def add_samples(self, kwargs_list):
        """Adds the given samples to the dataset.

        Args:
            kwargs_list: a list of kwargs dicts to be passed to
                the sample init call.

        Returns:
            a list of sample IDs
        """
        samples = self._get_query_set().insert(
            [self._Doc(**kwargs) for kwargs in kwargs_list]
        )
        return [str(s.id) for s in samples]

    def view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        entire dataset.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return fov.DatasetView(self)

    def take(self, num_samples=3):
        """Returns a string summary of a few random samples from the dataset.

        Args:
            num_samples (3): the number of samples

        Returns:
            a string representation of the samples
        """
        return self.view().take(num_samples).head(num_samples=num_samples)

    def distinct(self, field):
        return self._get_query_set().distinct(field)

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
        _kwargs_list = []
        for sample in samples:
            if sample_parser is not None:
                label = sample_parser.parse_label(sample)
            else:
                label = sample[1]

            filepath = os.path.abspath(os.path.expanduser(sample[0]))

            _sample_kwargs = {
                "filepath": filepath,
                group: label,
            }

            _kwargs_list.append(_sample_kwargs)

        logger.info(
            "Creating dataset '%s' containing %d samples",
            name,
            len(_kwargs_list),
        )
        dataset = cls(name)

        # @todo(Tyler) make this more user friendly
        # add the ground_truth label field to the dataset
        dataset._Doc.add_field(
            field_name="ground_truth",
            field_type=EmbeddedDocumentField,
            embedded_doc_type=type(_kwargs_list[0][group]),
        )

        dataset.add_samples(_kwargs_list)
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
        kwargs_list = []
        for image_path in image_paths:
            filepath = os.path.abspath(os.path.expanduser(image_path))
            kwargs_list.append({"filepath": filepath})

        logger.info(
            "Creating dataset '%s' containing %d samples",
            name,
            len(kwargs_list),
        )
        dataset = cls(name)
        dataset.add_samples(kwargs_list)
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

    def _get_query_set(self, **kwargs):
        # pylint: disable=no-member
        return self._Doc.objects(**kwargs)

    def _get_fields_str(self):
        """Pretty for printing"""
        fields = self.get_sample_fields()
        max_len = max([len(field_name) for field_name in fields])
        return "\n".join(
            "\t%s: %s" % (field_name.ljust(max_len), field.__class__)
            for field_name, field in iteritems(fields)
        )
