"""
Sample parsers.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import numpy as np

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.clips as foc
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov
import fiftyone.utils.eta as foue

fouv = fou.lazy_import("fiftyone.utils.video")


def add_images(dataset, samples, sample_parser, tags=None):
    """Adds the given images to the dataset.

    This operation does not read the images.

    See :ref:`this guide <custom-sample-parser>` for more details about
    adding images to a dataset by defining your own
    :class:`UnlabeledImageSampleParser`.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        samples: an iterable of samples that can be parsed by ``sample_parser``
        sample_parser: a :class:`UnlabeledImageSampleParser` instance to use to
            parse the samples
        tags (None): an optional tag or iterable of tags to attach to each
            sample

    Returns:
        a list of IDs of the samples that were added to the dataset
    """
    if not sample_parser.has_image_path:
        raise ValueError(
            "Sample parser must have `has_image_path == True` to add its "
            "samples to the dataset"
        )

    if not isinstance(sample_parser, UnlabeledImageSampleParser):
        raise ValueError(
            "`sample_parser` must be a subclass of %s; found %s"
            % (
                etau.get_class_name(UnlabeledImageSampleParser),
                etau.get_class_name(sample_parser),
            )
        )

    if etau.is_str(tags):
        tags = [tags]
    elif tags is not None:
        tags = list(tags)

    def parse_sample(sample):
        sample_parser.with_sample(sample)

        image_path = sample_parser.get_image_path()

        if sample_parser.has_image_metadata:
            metadata = sample_parser.get_image_metadata()
        else:
            metadata = None

        return fos.Sample(filepath=image_path, metadata=metadata, tags=tags)

    try:
        num_samples = len(samples)
    except:
        num_samples = None

    _samples = map(parse_sample, samples)
    return dataset.add_samples(
        _samples, num_samples=num_samples, expand_schema=False
    )


def add_labeled_images(
    dataset,
    samples,
    sample_parser,
    label_field=None,
    tags=None,
    expand_schema=True,
):
    """Adds the given labeled images to the dataset.

    This operation will iterate over all provided samples, but the images will
    not be read (unless the sample parser requires it in order to compute image
    metadata).

    See :ref:`this guide <custom-sample-parser>` for more details about
    adding labeled images to a dataset by defining your own
    :class:`LabeledImageSampleParser`.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        samples: an iterable of samples that can be parsed by ``sample_parser``
        sample_parser: a :class:`LabeledImageSampleParser` instance to use to
            parse the samples
        label_field (None): controls the field(s) in which imported labels are
            stored. If the parser produces a single
            :class:`fiftyone.core.labels.Label` instance per sample, this
            argument specifies the name of the field to use; the default is
            ``"ground_truth"``. If the parser produces a dictionary of labels
            per sample, this argument specifies a string prefix to prepend to
            each label key; the default in this case is to directly use the
            keys of the imported label dictionaries as field names
        tags (None): an optional tag or iterable of tags to attach to each
            sample
        expand_schema (True): whether to dynamically add new sample fields
            encountered to the dataset schema. If False, an error is raised
            if a sample's schema is not a subset of the dataset schema

    Returns:
        a list of IDs of the samples that were added to the dataset
    """
    if not sample_parser.has_image_path:
        raise ValueError(
            "Sample parser must have `has_image_path == True` to add its "
            "samples to the dataset"
        )

    if not isinstance(sample_parser, LabeledImageSampleParser):
        raise ValueError(
            "`sample_parser` must be a subclass of %s; found %s"
            % (
                etau.get_class_name(LabeledImageSampleParser),
                etau.get_class_name(sample_parser),
            )
        )

    if label_field:
        label_key = lambda k: label_field + "_" + k
    else:
        label_field = "ground_truth"
        label_key = lambda k: k

    if etau.is_str(tags):
        tags = [tags]
    elif tags is not None:
        tags = list(tags)

    def parse_sample(sample):
        sample_parser.with_sample(sample)

        image_path = sample_parser.get_image_path()

        if sample_parser.has_image_metadata:
            metadata = sample_parser.get_image_metadata()
        else:
            metadata = None

        label = sample_parser.get_label()

        sample = fos.Sample(filepath=image_path, metadata=metadata, tags=tags)

        if isinstance(label, dict):
            sample.update_fields({label_key(k): v for k, v in label.items()})
        elif label is not None:
            sample[label_field] = label

        return sample

    # Optimization: if we can deduce exactly what fields will be added during
    # import, we declare them now and set `expand_schema` to False
    try:
        can_expand_now = issubclass(sample_parser.label_cls, fol.Label)
    except:
        can_expand_now = False

    if expand_schema and can_expand_now:
        dataset._ensure_label_field(label_field, sample_parser.label_cls)
        expand_schema = False

    try:
        num_samples = len(samples)
    except:
        num_samples = None

    _samples = map(parse_sample, samples)
    return dataset.add_samples(
        _samples, expand_schema=expand_schema, num_samples=num_samples
    )


def add_videos(dataset, samples, sample_parser, tags=None):
    """Adds the given videos to the dataset.

    This operation does not read the videos.

    See :ref:`this guide <custom-sample-parser>` for more details about
    adding videos to a dataset by defining your own
    :class:`UnlabeledVideoSampleParser`.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        samples: an iterable of samples that can be parsed by ``sample_parser``
        sample_parser: a :class:`UnlabeledVideoSampleParser` instance to use to
            parse the samples
        tags (None): an optional tag or iterable of tags to attach to each
            sample

    Returns:
        a list of IDs of the samples that were added to the dataset
    """
    if not isinstance(sample_parser, UnlabeledVideoSampleParser):
        raise ValueError(
            "`sample_parser` must be a subclass of %s; found %s"
            % (
                etau.get_class_name(UnlabeledVideoSampleParser),
                etau.get_class_name(sample_parser),
            )
        )

    if etau.is_str(tags):
        tags = [tags]
    elif tags is not None:
        tags = list(tags)

    def parse_sample(sample):
        sample_parser.with_sample(sample)

        video_path = sample_parser.get_video_path()

        if sample_parser.has_video_metadata:
            metadata = sample_parser.get_video_metadata()
        else:
            metadata = None

        return fos.Sample(filepath=video_path, metadata=metadata, tags=tags)

    try:
        num_samples = len(samples)
    except:
        num_samples = None

    _samples = map(parse_sample, samples)

    # @todo: skip schema expansion and set media type before adding samples
    return dataset.add_samples(
        _samples, num_samples=num_samples, expand_schema=True
    )


def add_labeled_videos(
    dataset,
    samples,
    sample_parser,
    label_field=None,
    tags=None,
    expand_schema=True,
):
    """Adds the given labeled videos to the dataset.

    This operation will iterate over all provided samples, but the videos will
    not be read/decoded/etc.

    See :ref:`this guide <custom-sample-parser>` for more details about
    adding labeled videos to a dataset by defining your own
    :class:`LabeledVideoSampleParser`.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        samples: an iterable of samples that can be parsed by ``sample_parser``
        sample_parser: a :class:`LabeledVideoSampleParser` instance to use to
            parse the samples
        label_field (None): controls the field(s) in which imported labels are
            stored. If the parser produces a single
            :class:`fiftyone.core.labels.Label` instance per sample/frame, this
            argument specifies the name of the field to use; the default is
            ``"ground_truth"``. If the parser produces a dictionary of labels
            per sample/frame, this argument specifies a string prefix to
            prepend to each label key; the default in this case is to directly
            use the keys of the imported label dictionaries as field names
        tags (None): an optional tag or iterable of tags to attach to each
            sample
        expand_schema (True): whether to dynamically add new sample fields
            encountered to the dataset schema. If False, an error is raised
            if a sample's schema is not a subset of the dataset schema

    Returns:
        a list of IDs of the samples that were added to the dataset
    """
    if not isinstance(sample_parser, LabeledVideoSampleParser):
        raise ValueError(
            "`sample_parser` must be a subclass of %s; found %s"
            % (
                etau.get_class_name(LabeledVideoSampleParser),
                etau.get_class_name(sample_parser),
            )
        )

    if label_field:
        label_key = lambda k: label_field + "_" + k
    else:
        label_field = "ground_truth"
        label_key = lambda k: k

    if etau.is_str(tags):
        tags = [tags]
    elif tags is not None:
        tags = list(tags)

    def parse_sample(sample):
        sample_parser.with_sample(sample)

        video_path = sample_parser.get_video_path()

        if sample_parser.has_video_metadata:
            metadata = sample_parser.get_video_metadata()
        else:
            metadata = None

        label = sample_parser.get_label()
        frames = sample_parser.get_frame_labels()

        sample = fos.Sample(filepath=video_path, metadata=metadata, tags=tags)

        if isinstance(label, dict):
            sample.update_fields({label_key(k): v for k, v in label.items()})
        elif label is not None:
            sample[label_field] = label

        if frames is not None:
            frame_labels = {}

            for frame_number, _label in frames.items():
                if isinstance(_label, dict):
                    frame_labels[frame_number] = {
                        label_key(field_name): label
                        for field_name, label in _label.items()
                    }
                elif _label is not None:
                    frame_labels[frame_number] = {label_field: _label}

            sample.frames.merge(frame_labels)

        return sample

    try:
        num_samples = len(samples)
    except:
        num_samples = None

    _samples = map(parse_sample, samples)
    return dataset.add_samples(
        _samples, expand_schema=expand_schema, num_samples=num_samples
    )


class SampleParser(object):
    """Base interface for sample parsers.

    :class:`SampleParser` instances are used to parse samples emitted by
    dataset iterators when ingesting them into
    :class:`fiftyone.core.dataset.Dataset` instances.

    The general recipe for using :class:`SampleParser` instances is as
    follows::

        sample_parser = SampleParser(...)

        for sample in samples:
            sample_parser.with_sample(sample)
            field = sample_parser.get_<field>()

    where ``field`` is a subclass specific field to parse from the sample.
    """

    def __init__(self):
        self._current_sample = None

    @property
    def current_sample(self):
        """The current sample.

        Raises:
            ValueError: if there is no current sample
        """
        if self._current_sample is None:
            raise ValueError(
                "No current sample. You must call `with_sample()` before "
                "trying to get information about a sample"
            )

        return self._current_sample

    def with_sample(self, sample):
        """Sets the current sample so that subsequent calls to methods of this
        parser will return information from the given sample.

        Guaranteed to call :meth:`clear_sample` before setting the current
        sample.

        Args:
            sample: a sample
        """
        self.clear_sample()
        self._current_sample = sample

    def clear_sample(self):
        """Clears the current sample.

        Also clears any cached sample information stored by the parser.
        """
        self._current_sample = None


class UnlabeledImageSampleParser(SampleParser):
    """Interface for :class:`SampleParser` instances that parse unlabeled image
    samples.

    Instances of this class must return images in ``numpy`` format.

    The general recipe for using :class:`UnlabeledImageSampleParser` instances
    is as follows::

        sample_parser = UnlabeledImageSampleParser(...)

        for sample in samples:
            sample_parser.with_sample(sample)
            img = sample_parser.get_image()
            if sample_parser.has_image_path:
                image_path = sample_parser.get_image_path()

            if sample_parser.has_image_metadata:
                image_metadata = sample_parser.get_image_metadata()
    """

    @property
    def has_image_path(self):
        """Whether this parser produces paths to images on disk for samples
        that it parses.
        """
        raise NotImplementedError("subclass must implement has_image_path")

    @property
    def has_image_metadata(self):
        """Whether this parser produces
        :class:`fiftyone.core.metadata.ImageMetadata` instances for samples
        that it parses.
        """
        raise NotImplementedError("subclass must implement has_image_metadata")

    def get_image(self):
        """Returns the image from the current sample.

        Returns:
            a numpy image
        """
        raise NotImplementedError("subclass must implement get_image()")

    def get_image_path(self):
        """Returns the image path for the current sample.

        Returns:
            the path to the image on disk
        """
        if not self.has_image_path:
            raise ValueError(
                "This '%s' does not provide image paths"
                % etau.get_class_name(self)
            )

        raise NotImplementedError("subclass must implement get_image_path()")

    def get_image_metadata(self):
        """Returns the image metadata for the current sample.

        Returns:
            a :class:`fiftyone.core.metadata.ImageMetadata` instance
        """
        if not self.has_image_metadata:
            raise ValueError(
                "This '%s' does not provide image metadata"
                % etau.get_class_name(self)
            )

        raise NotImplementedError(
            "subclass must implement get_image_metadata()"
        )


class UnlabeledVideoSampleParser(SampleParser):
    """Interface for :class:`SampleParser` instances that parse unlabeled video
    samples.

    The general recipe for using :class:`UnlabeledVideoSampleParser` instances
    is as follows::

        sample_parser = UnlabeledVideoSampleParser(...)

        for sample in samples:
            sample_parser.with_sample(sample)
            video_path = sample_parser.get_video_path()
            video_metadata = sample_parser.get_video_metadata()
    """

    @property
    def has_video_metadata(self):
        """Whether this parser produces
        :class:`fiftyone.core.metadata.VideoMetadata` instances for samples
        that it parses.
        """
        raise NotImplementedError("subclass must implement has_video_metadata")

    def get_video_path(self):
        """Returns the video path for the current sample.

        Returns:
            the path to the video on disk
        """
        raise NotImplementedError("subclass must implement get_video_path()")

    def get_video_metadata(self):
        """Returns the video metadata for the current sample.

        Returns:
            a :class:`fiftyone.core.metadata.VideoMetadata` instance
        """
        if not self.has_video_metadata:
            raise ValueError(
                "This '%s' does not provide video metadata"
                % etau.get_class_name(self)
            )

        raise NotImplementedError(
            "subclass must implement get_video_metadata()"
        )


class ImageSampleParser(UnlabeledImageSampleParser):
    """Sample parser that parses unlabeled image samples.

    This implementation assumes that the provided sample is either an image
    that can be converted to numpy format via ``np.asarray()`` or the path
    to an image on disk.
    """

    @property
    def has_image_path(self):
        return True

    @property
    def has_image_metadata(self):
        return False

    def get_image(self):
        image_or_path = self.current_sample
        if etau.is_str(image_or_path):
            return etai.read(image_or_path)

        return np.asarray(image_or_path)

    def get_image_path(self):
        image_or_path = self.current_sample
        if etau.is_str(image_or_path):
            return image_or_path

        raise ValueError(
            "Cannot extract image path from samples that contain images"
        )


class VideoSampleParser(UnlabeledVideoSampleParser):
    """Sample parser that parses unlabeled video samples.

    This implementation assumes that the provided sample is a path to a video
    on disk.
    """

    @property
    def has_video_metadata(self):
        return False

    def get_video_path(self):
        return self.current_sample


class LabeledImageSampleParser(SampleParser):
    """Interface for :class:`SampleParser` instances that parse labeled image
    samples.

    Instances of this class must return images in ``numpy`` format and labels
    as :class:`fiftyone.core.labels.Label` instances.

    The general recipe for using :class:`LabeledImageSampleParser` instances
    is as follows::

        sample_parser = LabeledImageSampleParser(...)

        for sample in samples:
            sample_parser.with_sample(sample)
            img = sample_parser.get_image()
            label = sample_parser.get_label()

            if sample_parser.has_image_path:
                image_path = sample_parser.get_image_path()

            if sample_parser.has_image_metadata:
                image_metadata = sample_parser.get_image_metadata()
    """

    @property
    def has_image_path(self):
        """Whether this parser produces paths to images on disk for samples
        that it parses.
        """
        raise NotImplementedError("subclass must implement has_image_path")

    @property
    def has_image_metadata(self):
        """Whether this parser produces
        :class:`fiftyone.core.metadata.ImageMetadata` instances for samples
        that it parses.
        """
        raise NotImplementedError("subclass must implement has_image_metadata")

    @property
    def label_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) returned by this
        parser.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            parser is guaranteed to return labels of this type
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the parser will return label dictionaries with keys
            and value-types specified by this dictionary. Not all keys need be
            present in the imported labels
        -   ``None``. In this case, the parser makes no guarantees about the
            labels that it may return
        """
        raise NotImplementedError("subclass must implement label_cls")

    def get_image(self):
        """Returns the image from the current sample.

        Returns:
            a numpy image
        """
        raise NotImplementedError("subclass must implement get_image()")

    def get_image_path(self):
        """Returns the image path for the current sample.

        Returns:
            the path to the image on disk
        """
        if not self.has_image_path:
            raise ValueError(
                "This '%s' does not provide image paths"
                % etau.get_class_name(self)
            )

        raise NotImplementedError("subclass must implement get_image_path()")

    def get_image_metadata(self):
        """Returns the image metadata for the current sample.

        Returns:
            a :class:`fiftyone.core.metadata.ImageMetadata` instance
        """
        if not self.has_image_metadata:
            raise ValueError(
                "This '%s' does not provide image metadata"
                % etau.get_class_name(self)
            )

        raise NotImplementedError(
            "subclass must implement get_image_metadata()"
        )

    def get_label(self):
        """Returns the label for the current sample.

        Returns:
            a :class:`fiftyone.core.labels.Label` instance, or a dictionary
            mapping field names to :class:`fiftyone.core.labels.Label`
            instances, or ``None`` if the sample is unlabeled
        """
        raise NotImplementedError("subclass must implement get_label()")


class LabeledVideoSampleParser(SampleParser):
    """Interface for :class:`SampleParser` instances that parse labeled video
    samples.

    The general recipe for using :class:`LabeledVideoSampleParser` instances
    is as follows::

        sample_parser = LabeledVideoSampleParser(...)

        for sample in samples:
            sample_parser.with_sample(sample)
            video_path = sample_parser.get_video_path()
            label = sample_parser.get_label()
            frames = sample_parser.get_frame_labels()

            if sample_parser.has_video_metadata:
                video_metadata = sample_parser.get_video_metadata()
    """

    @property
    def has_video_metadata(self):
        """Whether this parser produces
        :class:`fiftyone.core.metadata.VideoMetadata` instances for samples
        that it parses.
        """
        raise NotImplementedError("subclass must implement has_video_metadata")

    @property
    def label_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) returned by this
        parser within the sample-level labels that it produces.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            parser is guaranteed to return sample-level labels of this type
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the parser will return sample-level label
            dictionaries with keys and value-types specified by this
            dictionary. Not all keys need be present in the imported labels
        -   ``None``. In this case, the parser makes no guarantees about the
            sample-level labels that it may return
        """
        raise NotImplementedError("subclass must implement label_cls")

    @property
    def frame_labels_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) returned by this
        parser within the frame labels that it produces.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            parser is guaranteed to return frame labels of this type
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the parser will return frame label dictionaries with
            keys and value-types specified by this dictionary. Not all keys
            need be present in each frame
        -   ``None``. In this case, the parser makes no guarantees about the
            frame labels that it may return
        """
        raise NotImplementedError("subclass must implement frame_labels_cls")

    def get_video_path(self):
        """Returns the video path for the current sample.

        Returns:
            the path to the video on disk
        """
        raise NotImplementedError("subclass must implement get_video_path()")

    def get_video_metadata(self):
        """Returns the video metadata for the current sample.

        Returns:
            a :class:`fiftyone.core.metadata.ImageMetadata` instance
        """
        if not self.has_video_metadata:
            raise ValueError(
                "This '%s' does not provide video metadata"
                % etau.get_class_name(self)
            )

        raise NotImplementedError(
            "subclass must implement get_video_metadata()"
        )

    def get_label(self):
        """Returns the sample-level labels for the current sample.

        Returns:
            a :class:`fiftyone.core.labels.Label` instance, or a dictionary
            mapping field names to :class:`fiftyone.core.labels.Label`
            instances, or ``None`` if the sample has no sample-level labels
        """
        raise NotImplementedError("subclass must implement get_label()")

    def get_frame_labels(self):
        """Returns the frame labels for the current sample.

        Returns:
            a dictionary mapping frame numbers to dictionaries that map label
            fields to :class:`fiftyone.core.labels.Label` instances for each
            video frame, or ``None`` if the sample has no frame labels
        """
        raise NotImplementedError("subclass must implement get_frame_labels()")


class LabeledImageTupleSampleParser(LabeledImageSampleParser):
    """Generic sample parser that parses samples that are
    ``(image_or_path, label)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``label`` is a :class:`fiftyone.core.labels.Label` instance

    This implementation provides a :meth:`_current_image` property that
    caches the image for the current sample, for efficiency in case multiple
    getters require access to the image (e.g., to normalize coordinates,
    compute metadata, etc).

    See the following subclasses of this parser for implementations that parse
    labels for common tasks:

        - Image classification: :class:`ImageClassificationSampleParser`
        - Object detection: :class:`ImageDetectionSampleParser`
        - Multitask image prediction: :class:`ImageLabelsSampleParser`
    """

    def __init__(self):
        super().__init__()
        self._current_image_cache = None

    @property
    def has_image_path(self):
        return True

    @property
    def has_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return None

    def get_image(self):
        return self._current_image

    def get_image_path(self):
        image_or_path = self.current_sample[0]
        if etau.is_str(image_or_path):
            return image_or_path

        raise ValueError(
            "Cannot extract image path from samples that contain images"
        )

    def get_label(self):
        return self.current_sample[1]

    def clear_sample(self):
        super().clear_sample()
        self._current_image_cache = None

    @property
    def _current_image(self):
        if self._current_image_cache is None:
            self._current_image_cache = self._get_image()

        return self._current_image_cache

    def _get_image(self):
        image_or_path = self.current_sample[0]
        return self._parse_image(image_or_path)

    def _parse_image(self, image_or_path):
        if etau.is_str(image_or_path):
            return etai.read(image_or_path)

        return np.asarray(image_or_path)


class ImageClassificationSampleParser(LabeledImageTupleSampleParser):
    """Generic parser for image classification samples whose labels are
    represented as :class:`fiftyone.core.labels.Classification` instances.

    This implementation supports samples that are ``(image_or_path, target)``
    tuples, where:

        -   ``image_or_path`` is either an image that can be converted to numpy
            format via ``np.asarray()`` or the path to an image on disk

        -   ``target`` can be any of the following:

            -   a label string
            -   a class ID, if ``classes`` is provided
            -   None, for unlabeled images
            -   a dict of the following form::

                    {
                        "label": <label-or-target>,
                        "confidence": <confidence>,
                    }

    Args:
        classes (None): an optional list of class label strings. If provided,
            it is assumed that ``target`` is a class ID that should be mapped
            to a label string via ``classes[target]``
    """

    def __init__(self, classes=None):
        super().__init__()
        self.classes = classes

    @property
    def label_cls(self):
        return fol.Classification

    def get_label(self):
        """Returns the label for the current sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.Classification` instance
        """
        target = self.current_sample[1]
        return self._parse_label(target)

    def _parse_label(self, target):
        if target is None:
            return None

        if isinstance(target, dict):
            label = target.get("label", None)
            confidence = target.get("confidence", None)
        else:
            label = target
            confidence = None

        try:
            label = self.classes[label]
        except:
            label = str(label)

        return fol.Classification(label=label, confidence=confidence)


class ImageDetectionSampleParser(LabeledImageTupleSampleParser):
    """Generic parser for image detection samples whose labels are represented
    as :class:`fiftyone.core.labels.Detections` instances.

    This implementation supports samples that are
    ``(image_or_path, detections_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``detections_or_path`` is either a list of detections in the
          following format::

            [
                {
                    "<label_field>": <label-or-target>,
                    "<bounding_box_field>": [
                        <top-left-x>, <top-left-y>, <width>, <height>
                    ],
                    "<confidence_field>": <optional-confidence>,
                    "<attributes_field>": {
                        <optional-name>: <optional-value>,
                        ...
                    }
                },
                ...
            ]

          or the path to such a file on disk. For unlabeled images,
          ``detections_or_path`` can be ``None``.

          In the above, ``label-or-target`` is either a class ID
          (if ``classes`` is provided) or a label string, and the bounding box
          coordinates can either be relative coordinates in ``[0, 1]``
          (if ``normalized == True``) or absolute pixels coordinates
          (if ``normalized == False``). The confidence and attributes fields
          are optional for each sample.

          The input field names can be configured as necessary when
          instantiating the parser.

    Args:
        label_field ("label"): the name of the object label field in the
            target dicts
        bounding_box_field ("bounding_box"): the name of the bounding box field
            in the target dicts
        confidence_field (None): the name of the optional confidence field in
            the target dicts
        attributes_field (None): the name of the optional attributes field in
            the target dicts
        classes (None): an optional list of class label strings. If provided,
            it is assumed that the ``target`` values are class IDs that should
            be mapped to label strings via ``classes[target]``
        normalized (True): whether the bounding box coordinates are absolute
            pixel coordinates (``False``) or relative coordinates in [0, 1]
            (``True``)
    """

    def __init__(
        self,
        label_field="label",
        bounding_box_field="bounding_box",
        confidence_field=None,
        attributes_field=None,
        classes=None,
        normalized=True,
    ):
        super().__init__()
        self.label_field = label_field
        self.bounding_box_field = bounding_box_field
        self.confidence_field = confidence_field
        self.attributes_field = attributes_field
        self.classes = classes
        self.normalized = normalized

    @property
    def label_cls(self):
        return fol.Detections

    def get_label(self):
        """Returns the label for the current sample.

        Returns:
            a :class:`fiftyone.core.labels.Detections` instance
        """
        target = self.current_sample[1]

        if not self.normalized:
            # Absolute bounding box coordinates were provided, so we must have
            # the image to convert to relative coordinates
            img = self._current_image
        else:
            img = None

        return self._parse_label(target, img=img)

    def _parse_label(self, target, img=None):
        if target is None:
            return None

        if etau.is_str(target):
            target = etas.load_json(target)

        return fol.Detections(
            detections=[self._parse_detection(obj, img=img) for obj in target]
        )

    def _parse_detection(self, obj, img=None):
        label = obj[self.label_field]

        try:
            label = self.classes[label]
        except:
            label = str(label)

        tlx, tly, w, h = self._parse_bbox(obj)

        if not self.normalized:
            height, width = img.shape[:2]
            tlx /= width
            tly /= height
            w /= width
            h /= height

        bounding_box = [tlx, tly, w, h]

        if self.confidence_field:
            confidence = obj.get(self.confidence_field, None)
        else:
            confidence = None

        if self.attributes_field:
            attributes = obj.get(self.attributes_field, {})
        else:
            attributes = {}

        return fol.Detection(
            label=label,
            bounding_box=bounding_box,
            confidence=confidence,
            **attributes,
        )

    def _parse_bbox(self, obj):
        return obj[self.bounding_box_field]


class ImageLabelsSampleParser(LabeledImageTupleSampleParser):
    """Generic parser for multitask image prediction samples whose labels are
    stored in ``eta.core.image.ImageLabels`` format.

    This implementation provided by this class supports samples that are
    ``(image_or_path, image_labels_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``image_labels_or_path`` is an ``eta.core.image.ImageLabels``
          instance, an ``eta.core.frames.FrameLabels`` instance, a serialized
          dict representation of either, or the path to either on disk

    Args:
        prefix (None): a string prefix to prepend to each label name in the
            expanded label dictionary
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the image labels to field names into which to expand them
        multilabel (False): whether to store attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical
            attributes (True) or cast them to strings (False)
    """

    def __init__(
        self,
        prefix=None,
        labels_dict=None,
        multilabel=False,
        skip_non_categorical=False,
    ):
        super().__init__()
        self.prefix = prefix
        self.labels_dict = labels_dict
        self.multilabel = multilabel
        self.skip_non_categorical = skip_non_categorical

    @property
    def label_cls(self):
        return None

    def get_label(self):
        """Returns the label for the current sample.

        Returns:
            a labels dictionary
        """
        labels = self.current_sample[1]
        return self._parse_label(labels)

    def _parse_label(self, labels):
        return foue.from_image_labels(
            labels,
            prefix=self.prefix,
            labels_dict=self.labels_dict,
            multilabel=self.multilabel,
            skip_non_categorical=self.skip_non_categorical,
        )


class FiftyOneImageClassificationSampleParser(ImageClassificationSampleParser):
    """Parser for samples in FiftyOne image classification datasets.

    See :ref:`this page <FiftyOneImageClassificationDataset-import>` for format
    details.

    Args:
        classes (None): an optional list of class label strings. If provided,
            it is assumed that ``target`` is a class ID that should be mapped
            to a label string via ``classes[target]``
    """

    def __init__(self, classes=None):
        super().__init__(classes=classes)


class FiftyOneTemporalDetectionSampleParser(LabeledVideoSampleParser):
    """Parser for samples in FiftyOne temporal detection datasets.

    See :ref:`this page <FiftyOneTemporalDetectionDataset-import>` for format
    details.

    Args:
        classes (None): an optional list of class label strings. If provided,
            it is assumed that ``target`` is a class ID that should be mapped
            to a label string via ``classes[target]``
        compute_metadata (False): whether to compute
            :class:`fiftyone.core.metadata.VideoMetadata` instances on-the-fly
            if :meth:`get_video_metadata` is called and no metadata is
            available
    """

    def __init__(self, classes=None, compute_metadata=False):
        super().__init__()
        self.classes = classes
        self.compute_metadata = compute_metadata
        self._current_metadata = None

    @property
    def has_video_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return fol.TemporalDetections

    @property
    def frame_labels_cls(self):
        return None

    def get_video_path(self):
        return self.current_sample[0]

    def get_video_metadata(self):
        if self._current_metadata is None and self.compute_metadata:
            video_path = self.current_sample[0]
            self._current_metadata = fom.VideoMetadata.build_for(video_path)

        return self._current_metadata

    def get_label(self):
        video_path, labels = self.current_sample

        if labels is None:
            return None

        detections = []
        for label_dict in labels:
            label = label_dict["label"]

            try:
                label = self.classes[label]
            except:
                label = str(label)

            confidence = label_dict.get("confidence", None)

            if "support" in label_dict:
                detection = fol.TemporalDetection(
                    label=label,
                    support=label_dict["support"],
                    confidence=confidence,
                )
            elif "timestamps" in label_dict:
                if self._current_metadata is not None:
                    metadata = self._current_metadata
                else:
                    metadata = fom.VideoMetadata.build_for(video_path)
                    self._current_metadata = metadata

                detection = fol.TemporalDetection.from_timestamps(
                    label_dict["timestamps"],
                    metadata=metadata,
                    label=label,
                    confidence=confidence,
                )
            else:
                raise ValueError(
                    "All temporal detection label dicts must have either "
                    "`support` or `timestamps` populated"
                )

            detections.append(detection)

        return fol.TemporalDetections(detections=detections)

    def get_frame_labels(self):
        return None

    def clear_sample(self):
        super().clear_sample()
        self._current_metadata = None


class FiftyOneImageDetectionSampleParser(ImageDetectionSampleParser):
    """Parser for samples in FiftyOne image detection datasets.

    See :ref:`this page <FiftyOneImageDetectionDataset-import>` for format
    details.

    Args:
        classes (None): an optional list of class label strings. If provided,
            it is assumed that the ``target`` values are class IDs that should
            be mapped to label strings via ``classes[target]``
    """

    def __init__(self, classes=None):
        super().__init__(
            label_field="label",
            bounding_box_field="bounding_box",
            confidence_field="confidence",
            attributes_field="attributes",
            classes=classes,
            normalized=True,
        )


class FiftyOneImageLabelsSampleParser(ImageLabelsSampleParser):
    """Parser for samples in FiftyOne image labels datasets.

    See :ref:`this page <FiftyOneImageLabelsDataset-import>` for format
    details.

    Args:
        prefix (None): a string prefix to prepend to each label name in the
            expanded label dictionary
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the image labels to field names into which to expand them
        multilabel (False): whether to store attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical
            attributes (True) or cast them to strings (False)
    """

    pass


class VideoLabelsSampleParser(LabeledVideoSampleParser):
    """Generic parser for labeled video samples whose labels are represented in
    ``eta.core.video.VideoLabels`` format.

    This implementation provided by this class supports samples that are
    ``(video_path, video_labels_or_path)`` tuples, where:

        - ``video_path`` is the path to a video on disk

        - ``video_labels_or_path`` is an ``eta.core.video.VideoLabels``
          instance, a serialized dict representation of one, or the path to one
          on disk

    Args:
        prefix (None): a string prefix to prepend to each label name in the
            expanded sample/frame label dictionaries
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the sample labels to field names into which to expand them. By
            default, all sample labels are loaded
        frame_labels_dict (None): a dictionary mapping names of
            attributes/objects in the frame labels to field names into which to
            expand them. By default, all frame labels are loaded
        multilabel (False): whether to store attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical
            attributes (True) or cast them to strings (False)
    """

    def __init__(
        self,
        prefix=None,
        labels_dict=None,
        frame_labels_dict=None,
        multilabel=False,
        skip_non_categorical=False,
    ):
        super().__init__()
        self.prefix = prefix
        self.labels_dict = labels_dict
        self.frame_labels_dict = frame_labels_dict
        self.multilabel = multilabel
        self.skip_non_categorical = skip_non_categorical

        self._curr_label = None
        self._curr_frames = None

    @property
    def has_video_metadata(self):
        return False

    @property
    def label_cls(self):
        return None

    @property
    def frame_labels_cls(self):
        return None

    def get_video_path(self):
        return self.current_sample[0]

    def get_label(self):
        self._parse_labels()
        return self._curr_label

    def get_frame_labels(self):
        self._parse_labels()
        return self._curr_frames

    def clear_sample(self):
        super().clear_sample()
        self._curr_label = None
        self._curr_frames = None

    def _parse_labels(self):
        if self._curr_label is not None or self._curr_frames is not None:
            return

        label, frames = foue.from_video_labels(
            self.current_sample[1],
            prefix=self.prefix,
            labels_dict=self.labels_dict,
            frame_labels_dict=self.frame_labels_dict,
            multilabel=self.multilabel,
            skip_non_categorical=self.skip_non_categorical,
        )

        self._curr_label = label
        self._curr_frames = frames


class FiftyOneVideoLabelsSampleParser(VideoLabelsSampleParser):
    """Parser for samples in FiftyOne video labels datasets.

    See :ref:`this page <FiftyOneVideoLabelsDataset-import>` for format
    details.

    Args:
        expand (True): whether to expand the labels for each frame into
            separate :class:`fiftyone.core.labels.Label` instances
        prefix (None): a string prefix to prepend to each label name in the
            expanded frame label dictionaries
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the frame labels to field names into which to expand them
        multilabel (False): whether to store attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical
            attributes (True) or cast them to strings (False)
    """

    pass


class FiftyOneUnlabeledImageSampleParser(UnlabeledImageSampleParser):
    """Parser for :class:`fiftyone.core.sample.Sample` instances that contain
    images.

    Args:
        compute_metadata (False): whether to compute
            :class:`fiftyone.core.metadata.ImageMetadata` instances on-the-fly
            if :meth:`get_image_metadata` is called and no metadata is
            available
    """

    def __init__(self, compute_metadata=False):
        super().__init__()
        self.compute_metadata = compute_metadata

    @property
    def has_image_path(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    def get_image(self):
        fov.validate_image_sample(self.current_sample)
        return etai.read(self.current_sample.filepath)

    def get_image_path(self):
        fov.validate_image_sample(self.current_sample)
        return self.current_sample.filepath

    def get_image_metadata(self):
        fov.validate_image_sample(self.current_sample)
        metadata = self.current_sample.metadata
        if metadata is None and self.compute_metadata:
            metadata = fom.ImageMetadata.build_for(
                self.current_sample.filepath
            )

        return metadata


class FiftyOneLabeledImageSampleParser(LabeledImageSampleParser):
    """Parser for :class:`fiftyone.core.sample.Sample` instances that contain
    labeled images.

    Args:
        label_field: the name of the label field to parse, or a dictionary
            mapping label field names to keys for the return label dictionaries
        label_fcn (None): an optional function or dictionary mapping label
            field names to functions (must match ``label_field``) to apply to
            each label before returning it
        compute_metadata (False): whether to compute
            :class:`fiftyone.core.metadata.ImageMetadata` instances on-the-fly
            if :meth:`get_image_metadata` is called and no metadata is
            available
    """

    def __init__(self, label_field, label_fcn=None, compute_metadata=False):
        super().__init__()
        self.label_field = label_field
        self.label_fcn = label_fcn
        self.compute_metadata = compute_metadata

    @property
    def has_image_path(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return None

    def get_image(self):
        fov.validate_image_sample(self.current_sample)
        return etai.read(self.current_sample.filepath)

    def get_image_path(self):
        fov.validate_image_sample(self.current_sample)
        return self.current_sample.filepath

    def get_image_metadata(self):
        fov.validate_image_sample(self.current_sample)
        metadata = self.current_sample.metadata
        if metadata is None and self.compute_metadata:
            metadata = fom.ImageMetadata.build_for(
                self.current_sample.filepath
            )

        return metadata

    def get_label(self):
        sample = self.current_sample
        label_field = self.label_field
        label_fcn = self.label_fcn

        if isinstance(label_field, dict):
            if label_fcn is not None:
                label = {}
                for k, v in label_field.items():
                    f = label_fcn.get(k, None)
                    if f is not None:
                        label[v] = f(sample[k])
                    else:
                        label[v] = sample[k]
            else:
                label = {v: sample[k] for k, v in label_field.items()}
        else:
            label = sample[label_field]
            if label_fcn is not None:
                label = label_fcn(label)

        return label


class ExtractClipsMixin(object):
    """Mixin for sample parsers that extract clips from
    :class:`fiftyone.core.clips.ClipView` instances.

    Args:
        compute_metadata (False): whether to compute
            :class:`fiftyone.core.metadata.VideoMetadata` instances on-the-fly
            when no pre-computed metadata is available
        export_media (True): whether to actually write clips when their paths
            are requested
        clip_dir (None): a directory to write clips. Only applicable when
            parsing :class:`fiftyone.core.clips.ClipView` instances
        video_format (None): the video format to use when writing video clips
            to disk. By default, ``fiftyone.config.default_video_ext`` is used
    """

    def __init__(
        self,
        compute_metadata=False,
        export_media=True,
        clip_dir=None,
        video_format=None,
    ):
        if video_format is None:
            video_format = fo.config.default_video_ext

        self.compute_metadata = compute_metadata
        self.export_media = export_media
        self.clip_dir = clip_dir
        self.video_format = video_format

        self._curr_clip_path = None

    def _get_clip_path(self, sample):
        video_path = sample.filepath
        basename, ext = os.path.splitext(os.path.basename(video_path))

        if self.export_media:
            if self.clip_dir is None:
                self.clip_dir = etau.make_temp_dir()

            dirname = self.clip_dir
            ext = self.video_format
        else:
            dirname = os.path.dirname(video_path)

        clip_name = "%s-clip-%d-%d%s" % (
            basename,
            sample.support[0],
            sample.support[1],
            ext,
        )
        clip_path = os.path.join(dirname, clip_name)

        if self.export_media:
            self._curr_clip_path = clip_path
            fouv.extract_clip(
                video_path,
                clip_path,
                support=sample.support,
                metadata=sample.metadata,
            )
        else:
            self._curr_clip_path = None

        return clip_path

    def _get_clip_metadata(self, sample):
        if not self.compute_metadata or self._curr_clip_path is None:
            return None

        return fom.VideoMetadata.build_for(self._curr_clip_path)


class FiftyOneUnlabeledVideoSampleParser(
    ExtractClipsMixin, UnlabeledVideoSampleParser
):
    """Parser for :class:`fiftyone.core.sample.Sample` instances that contain
    videos.

    This class also supports :class:`fiftyone.core.clips.ClipView` instances.

    Args:
        compute_metadata (False): whether to compute
            :class:`fiftyone.core.metadata.VideoMetadata` instances on-the-fly
            if :meth:`get_video_metadata` is called and no metadata is
            available
        export_media (True): whether to write clips when :meth:`get_video_path`
            is called
        clip_dir (None): a directory to write clips. Only applicable when
            parsing :class:`fiftyone.core.clips.ClipView` instances
        video_format (None): the video format to use when writing video clips
            to disk. By default, ``fiftyone.config.default_video_ext`` is used
    """

    def __init__(
        self,
        compute_metadata=False,
        export_media=True,
        clip_dir=None,
        video_format=None,
    ):
        ExtractClipsMixin.__init__(
            self,
            compute_metadata=compute_metadata,
            export_media=export_media,
            clip_dir=clip_dir,
            video_format=video_format,
        )
        UnlabeledVideoSampleParser.__init__(self)

    @property
    def has_video_metadata(self):
        return True

    def get_video_path(self):
        if isinstance(self.current_sample, foc.ClipView):
            return self._get_clip_path(self.current_sample)

        return self.current_sample.filepath

    def get_video_metadata(self):
        if isinstance(self.current_sample, foc.ClipView):
            return self._get_clip_metadata(self.current_sample)

        metadata = self.current_sample.metadata
        if metadata is None and self.compute_metadata:
            metadata = fom.VideoMetadata.build_for(
                self.current_sample.filepath
            )

        return metadata


class FiftyOneLabeledVideoSampleParser(
    ExtractClipsMixin, LabeledVideoSampleParser
):
    """Parser for :class:`fiftyone.core.sample.Sample` instances that contain
    labeled videos.

    This class also supports :class:`fiftyone.core.clips.ClipView` instances.

    Args:
        label_field (None): the name of a label field to parse, or a dictionary
            mapping label field names to output keys to use in the returned
            sample-level labels dictionary
        frame_labels_field (None): the name of a frame label field to parse, or
            a dictionary mapping field names to output keys describing the
            frame label fields to export
        label_fcn (None): an optional function or dictionary mapping label
            field names to functions (must match ``label_field``) to apply to
            each sample label before returning it
        frame_labels_fcn (None): an optional function or dictionary mapping
            frame label field names to functions (must match
            ``frame_labels_field``) to apply to each frame label before
            returning it
        compute_metadata (False): whether to compute
            :class:`fiftyone.core.metadata.VideoMetadata` instances on-the-fly
            if :meth:`get_video_metadata` is called and no metadata is
            available
        export_media (True): whether to write clips when :meth:`get_video_path`
            is called
        clip_dir (None): a directory to write clips. Only applicable when
            parsing :class:`fiftyone.core.clips.ClipView` instances
        video_format (None): the video format to use when writing video clips
            to disk. By default, ``fiftyone.config.default_video_ext`` is used
    """

    def __init__(
        self,
        label_field=None,
        frame_labels_field=None,
        label_fcn=None,
        frame_labels_fcn=None,
        compute_metadata=False,
        export_media=True,
        clip_dir=None,
        video_format=None,
    ):
        frame_labels_dict, frame_fcn_dict = self._parse_frame_args(
            frame_labels_field, frame_labels_fcn
        )

        ExtractClipsMixin.__init__(
            self,
            compute_metadata=compute_metadata,
            export_media=export_media,
            clip_dir=clip_dir,
            video_format=video_format,
        )
        LabeledVideoSampleParser.__init__(self)

        self.label_field = label_field
        self.frame_labels_dict = frame_labels_dict
        self.label_fcn = label_fcn
        self.frame_fcn_dict = frame_fcn_dict

    @property
    def has_video_metadata(self):
        return True

    @property
    def label_cls(self):
        return None

    @property
    def frame_labels_cls(self):
        return None

    def get_video_path(self):
        if isinstance(self.current_sample, foc.ClipView):
            return self._get_clip_path(self.current_sample)

        return self.current_sample.filepath

    def get_video_metadata(self):
        if isinstance(self.current_sample, foc.ClipView):
            return self._get_clip_metadata(self.current_sample)

        metadata = self.current_sample.metadata
        if metadata is None and self.compute_metadata:
            metadata = fom.VideoMetadata.build_for(
                self.current_sample.filepath
            )

        return metadata

    def get_label(self):
        sample = self.current_sample
        label_field = self.label_field
        label_fcn = self.label_fcn

        if label_field is None:
            return None

        if isinstance(label_field, dict):
            if label_fcn is not None:
                label = {}
                for k, v in label_field.items():
                    f = label_fcn.get(k, None)
                    if f is not None:
                        label[v] = f(sample[k])
                    else:
                        label[v] = sample[k]
            else:
                label = {v: sample[k] for k, v in label_field.items()}
        else:
            label = sample[label_field]
            if label_fcn is not None:
                label = label_fcn(label)

        return label

    def get_frame_labels(self):
        if isinstance(self.current_sample, foc.ClipView):
            df = self.current_sample.support[0] - 1
        else:
            df = 0

        frames = self.current_sample.frames
        frame_labels_dict = self.frame_labels_dict
        frame_fcn_dict = self.frame_fcn_dict

        if frame_labels_dict is None:
            return None

        if frame_fcn_dict is not None:
            new_frames = {}
            for frame_number, frame in frames.items():
                new_frame = {}
                for k, v in frame_labels_dict.items():
                    f = frame_fcn_dict.get(k, None)
                    if f is not None:
                        new_frame[v] = f(frame[k])
                    else:
                        new_frame[v] = frame[k]

                new_frames[frame_number - df] = new_frame
        else:
            new_frames = {}
            for frame_number, frame in frames.items():
                new_frames[frame_number - df] = {
                    v: frame[k] for k, v in frame_labels_dict.items()
                }

        return new_frames

    @staticmethod
    def _parse_frame_args(frame_labels_field, frame_labels_fcn):
        if frame_labels_field is None:
            return None, None

        if not isinstance(frame_labels_field, dict):
            label_field = frame_labels_field
            frame_labels_dict = {label_field: label_field}
            if frame_labels_fcn is not None:
                frame_fcn_dict = {label_field: frame_labels_fcn}
            else:
                frame_fcn_dict = None
        else:
            frame_labels_dict = frame_labels_field
            frame_fcn_dict = frame_labels_fcn

        return frame_labels_dict, frame_fcn_dict
