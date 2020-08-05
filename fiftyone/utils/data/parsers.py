"""
Sample parsers.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom


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

        Guaranteed to call :func:`clear_sample` before setting the current
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


class ImageSampleParser(UnlabeledImageSampleParser):
    """Sample parser that parses raw image samples.

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
        """The :class:`fiftyone.core.labels.Label` class returned by this
        parser.
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
            a :class:`fiftyone.core.labels.Label` instance
        """
        raise NotImplementedError("subclass must implement get_label()")


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
        return fol.Label

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

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``target`` is either a class ID (if ``classes`` is provided) or a
          label string

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
        try:
            label = self.classes[target]
        except:
            label = str(target)

        return fol.Classification(label=label)


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

          or the path to such a file on disk.

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
            _attrs = obj.get(self.attributes_field, {})
            attributes = {
                k: self._parse_attribute(v) for k, v in _attrs.items()
            }
        else:
            attributes = None

        detection = fol.Detection(
            label=label,
            bounding_box=bounding_box,
            confidence=confidence,
            attributes=attributes,
        )

        return detection

    def _parse_bbox(self, obj):
        return obj[self.bounding_box_field]

    def _parse_attribute(self, value):
        if etau.is_str(value):
            return fol.CategoricalAttribute(value=value)

        if isinstance(value, bool):
            return fol.BooleanAttribute(value=value)

        if etau.is_numeric(value):
            return fol.NumericAttribute(value=value)

        return fol.Attribute(value=value)


class ImageLabelsSampleParser(LabeledImageTupleSampleParser):
    """Generic parser for multitask image prediction samples whose labels are
    represented in :class:`fiftyone.core.labels.ImageLabels` format.

    This implementation provided by this class supports samples that are
    ``(image_or_path, image_labels_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``image_labels_or_path`` is an ``eta.core.image.ImageLabels``
          instance, a serialized dict representation of one, or the path to one
          on disk
    """

    @property
    def label_cls(self):
        return fol.ImageLabels

    def get_label(self):
        """Returns the label for the current sample.

        Returns:
            a :class:`fiftyone.core.labels.ImageLabels` instance
        """
        labels = self.current_sample[1]
        return self._parse_label(labels)

    def _parse_label(self, labels):
        if etau.is_str(labels):
            labels = etai.ImageLabels.from_json(labels)
        elif isinstance(labels, dict):
            labels = etai.ImageLabels.from_dict(labels)

        return fol.ImageLabels(labels=labels)


class FiftyOneImageClassificationSampleParser(ImageClassificationSampleParser):
    """Parser for samples in FiftyOne image classification datasets.

    See :class:`fiftyone.types.dataset_types.FiftyOneImageClassificationDataset`
    for format details.

    Args:
        classes (None): an optional list of class label strings. If provided,
            it is assumed that ``target`` is a class ID that should be mapped
            to a label string via ``classes[target]``
    """

    def __init__(self, classes=None):
        super().__init__(classes=classes)


class FiftyOneImageDetectionSampleParser(ImageDetectionSampleParser):
    """Parser for samples in FiftyOne image detection datasets.

    See :class:`fiftyone.types.dataset_types.FiftyOneImageDetectionDataset` for
    format details.

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

    See :class:`fiftyone.types.dataset_types.FiftyOneImageLabelsDataset` for
    format details.
    """

    pass


class FiftyOneUnlabeledImageSampleParser(UnlabeledImageSampleParser):
    """Parser for :class:`fiftyone.core.sample.Sample` instances that contain
    images.

    Args:
        compute_metadata (False): whether to compute
            :class:`fiftyone.core.metadata.ImageMetadata` instances on-the-fly
            if :func:`get_image_metadata` is called and no metadata is
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
        return etai.read(self.current_sample.filepath)

    def get_image_path(self):
        return self.current_sample.filepath

    def get_image_metadata(self):
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
        label_field: the name of the :class:`fiftyone.core.labels.Label` field
            of the samples to parse
        compute_metadata (False): whether to compute
            :class:`fiftyone.core.metadata.ImageMetadata` instances on-the-fly
            if :func:`get_image_metadata` is called and no metadata is
            available
    """

    def __init__(self, label_field, compute_metadata=False):
        super().__init__()
        self.label_field = label_field
        self.compute_metadata = compute_metadata

    @property
    def has_image_path(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Label

    def get_image(self):
        return etai.read(self.current_sample.filepath)

    def get_image_path(self):
        return self.current_sample.filepath

    def get_image_metadata(self):
        metadata = self.current_sample.metadata
        if metadata is None and self.compute_metadata:
            metadata = fom.ImageMetadata.build_for(
                self.current_sample.filepath
            )

        return metadata

    def get_label(self):
        return self.current_sample[self.label_field]
