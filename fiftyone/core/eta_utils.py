"""
Utilities for interfacing with the
`ETA library <https://github.com/voxel51/eta>`_.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import warnings

import numpy as np

import eta.core.data as etad
import eta.core.frames as etaf
import eta.core.image as etai
import eta.core.keypoints as etak
import eta.core.learning as etal
import eta.core.objects as etao
import eta.core.polylines as etap
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.labels as fol
import fiftyone.core.models as fom


_IMAGE_MODELS = (
    etal.ImageModel,
    etal.ImageClassifier,
    etal.ObjectDetector,
    etal.ImageSemanticSegmenter,
)

_VIDEO_MODELS = (
    etal.VideoModel,
    etal.VideoClassifier,
    etal.VideoObjectDetector,
    etal.VideoEventDetector,
    etal.VideoSemanticSegmenter,
)


class ETAModelConfig(fom.ModelConfig):
    """Meta-config class that encapsulates the configuration of an
    `eta.core.learning.Model` that is to be run via the :class:`ETAModel`
    wrapper.

    Example::

        import fiftyone.core.models as fom

        model = fom.load_model({
            "type": "fiftyone.core.eta_utils.ETAModel",
            "config": {
                "type": "eta.detectors.YOLODetector",
                "config": {
                    "model_name": "yolo-v2-coco"
                }
            }
        })

    Args:
        type: the fully-qualified class name of the
            :class:`fiftyone.core.models.Model` subclass, which must be
            :class:`ETAModel` or a subclass of it
        config: a dict containing the ``eta.core.learning.ModelConfig`` for the
            ETA model
    """

    @property
    def confidence_thresh(self):
        """The confidence threshold of the underlying ``eta.core.model.Model``.

        Note that this may not be defined for some models.
        """
        return self.config.confidence_thresh

    @confidence_thresh.setter
    def confidence_thresh(self, confidence_thresh):
        self.config.confidence_thresh = confidence_thresh


class ETAModel(fom.Model, fom.EmbeddingsMixin, fom.LogitsMixin):
    """Wrapper for running an ``eta.core.learning.Model`` model.

    Args:
        config: an :class:`ETAModelConfig`
    """

    def __init__(self, config, _model=None):
        if _model is None:
            _model = config.build()  # build the ETA model

        self.config = config
        self._model = _model
        fom.LogitsMixin.__init__(self)

    def __enter__(self):
        self._model.__enter__()
        return self

    def __exit__(self, *args):
        self._model.__exit__(*args)

    @property
    def media_type(self):
        if isinstance(self._model, _IMAGE_MODELS):
            return "image"

        if isinstance(self._model, _VIDEO_MODELS):
            return "video"

        return None

    @property
    def ragged_batches(self):
        try:
            return self._model.ragged_batches
        except AttributeError:
            return True

    @property
    def transforms(self):
        try:
            return self._model.transforms
        except AttributeError:
            return None

    @property
    def preprocess(self):
        try:
            return self._model.preprocess
        except AttributeError:
            return False

    @preprocess.setter
    def preprocess(self, value):
        try:
            self._model.preprocess = value
        except AttributeError:
            pass

    @property
    def has_logits(self):
        return (
            isinstance(self._model, etal.ExposesProbabilities)
            and isinstance(self._model, etal.Classifier)
            and self._model.exposes_probabilities
        )

    @property
    def has_embeddings(self):
        return (
            isinstance(self._model, etal.ExposesFeatures)
            and isinstance(self._model, etal.Classifier)
            and self._model.exposes_features
        )

    def _ensure_embeddings(self):
        if not self.has_embeddings:
            raise ValueError("This model instance does not expose embeddings")

    def get_embeddings(self):
        self._ensure_embeddings()
        embeddings = self._model.get_features()
        embeddings = _squeeze_extra_unit_dims(embeddings)
        return embeddings.astype(float, copy=False)

    def embed(self, arg):
        self._ensure_embeddings()
        self.predict(arg)
        return self.get_embeddings()

    def embed_all(self, args):
        self._ensure_embeddings()

        if isinstance(self._model, etal.ImageClassifier):
            self._model.predict_all(args)
            return self.get_embeddings()

        if isinstance(self._model, etal.ObjectDetector):
            self._model.detect_all(args)
            return self.get_embeddings()

        if isinstance(self._model, etal.ImageSemanticSegmenter):
            self._model.segment_all(args)
            return self.get_embeddings()

        return np.concatenate(tuple(self.embed(arg) for arg in args))

    def predict(self, arg):
        if isinstance(self._model, etal.ImageClassifier):
            eta_labels = self._model.predict(arg)
        elif isinstance(self._model, etal.VideoFramesClassifier):
            eta_labels = self._model.predict(arg)
        elif isinstance(self._model, etal.VideoClassifier):
            eta_labels = self._model.predict(arg)
        elif isinstance(self._model, etal.Classifier):
            eta_labels = self._model.predict(arg)
        elif isinstance(self._model, etal.ObjectDetector):
            eta_labels = self._model.detect(arg)
        elif isinstance(self._model, etal.VideoFramesObjectDetector):
            eta_labels = self._model.detect(arg)
        elif isinstance(self._model, etal.VideoObjectDetector):
            eta_labels = self._model.detect(arg)
        elif isinstance(self._model, etal.Detector):
            eta_labels = self._model.detect(arg)
        elif isinstance(self._model, etal.ImageSemanticSegmenter):
            eta_labels = self._model.segment(arg)
        elif isinstance(self._model, etal.VideoSemanticSegmenter):
            eta_labels = self._model.segment(arg)
        elif isinstance(self._model, etal.SemanticSegmenter):
            eta_labels = self._model.segment(arg)
        elif isinstance(self._model, etal.ImageModel):
            eta_labels = self._model.process(arg)
        elif isinstance(self._model, etal.VideoModel):
            eta_labels = self._model.process(arg)
        else:
            raise ValueError(
                "Unsupported model type '%s'" % self._model.__class__
            )

        eta_labels = self._parse_predictions(eta_labels)

        label = parse_eta_labels(eta_labels)

        if self.has_logits and self.store_logits:
            # num_preds x num_classes
            logits = np.log(self._model.get_probabilities()[0])
            _add_logits(label, logits)

        return label

    def predict_all(self, args):
        if isinstance(self._model, etal.ImageClassifier):
            eta_labels_batch = self._model.predict_all(args)
        elif isinstance(self._model, etal.ObjectDetector):
            eta_labels_batch = self._model.detect_all(args)
        elif isinstance(self._model, etal.ImageSemanticSegmenter):
            eta_labels_batch = self._model.segment_all(args)
        else:
            return [self.predict(arg) for arg in args]

        eta_labels_batch = self._parse_predictions(eta_labels_batch)

        labels = [parse_eta_labels(el) for el in eta_labels_batch]

        if self.has_logits and self.store_logits:
            # num_images x num_preds x num_classes
            logits = np.log(self._model.get_probabilities())

            for label, _logits in zip(labels, logits):
                _add_logits(label, _logits)

        return labels

    def _parse_predictions(self, eta_labels_or_batch):
        if (
            not isinstance(self._model, etal.Classifier)
            or self._model.is_multilabel
        ):
            return eta_labels_or_batch

        if isinstance(eta_labels_or_batch, list):
            return [
                attrs[0] if attrs else None for attrs in eta_labels_or_batch
            ]

        if not eta_labels_or_batch:
            return None

        return eta_labels_or_batch[0]

    @classmethod
    def from_eta_model(cls, model):
        """Builds an :class:`ETAModel` for running the provided
        ``eta.core.learning.Model`` instance.

        Args:
            model: an ``eta.core.learning.Model`` instance

        Returns:
            an :class:`ETAModel`
        """
        return cls(model.config, _model=model)


def parse_eta_labels(eta_labels):
    """Parses the ``eta.core.labels.Labels`` instance and returns the
    corresponding :class:`fiftyone.core.labels.Label` instance(s).

    The table below summarizes the conversions that are performed:

    .. table::

        +-----------------------------------------------+-----------------------------------------------+
        | Input type                                    | Output type                                   |
        +===============================================+===============================================+
        | ``eta.core.data.Attribute``                   | :class:`fiftyone.core.labels.Classification`  |
        +-----------------------------------------------+-----------------------------------------------+
        | ``eta.core.data.AttributeContainer``          | :class:`fiftyone.core.labels.Classifications` |
        +-----------------------------------------------+-----------------------------------------------+
        | ``eta.core.objects.DetectedObject``           | :class:`fiftyone.core.labels.Detection`       |
        +-----------------------------------------------+-----------------------------------------------+
        | ``eta.core.objects.DetectedObjectContainer``  | :class:`fiftyone.core.labels.Detections`      |
        +-----------------------------------------------+-----------------------------------------------+
        | ``eta.core.polylines.Polyline``               | :class:`fiftyone.core.labels.Polyline`        |
        +-----------------------------------------------+-----------------------------------------------+
        | ``eta.core.polylines.PolylineContainer``      | :class:`fiftyone.core.labels.Polylines`       |
        +-----------------------------------------------+-----------------------------------------------+
        | ``eta.core.keypoints.Keypoints``              | :class:`fiftyone.core.labels.Keypoint`        |
        +-----------------------------------------------+-----------------------------------------------+
        | ``eta.core.keypoints.KeypointsContainer``     | :class:`fiftyone.core.labels.Keypoints`       |
        +-----------------------------------------------+-----------------------------------------------+
        | ``np.ndarray``                                | :class:`fiftyone.core.labels.Segmentation`    |
        +-----------------------------------------------+-----------------------------------------------+
        | ``eta.core.image.ImageLabels``                | a dictionary mapping field names to           |
        |                                               | :class:`fiftyone.core.labels.Label` instances |
        +-----------------------------------------------+-----------------------------------------------+
        | ``eta.core.video.VideoLabels``                | a ``frames`` dict mapping frame numbers       |
        |                                               | to dictionaries of frame labels               |
        +-----------------------------------------------+-----------------------------------------------+

    Args:
        eta_labels: an ````eta.core.labels.Labels`` instance

    Returns:
        the FiftyOne labels according to the table above
    """
    if isinstance(eta_labels, etad.AttributeContainer):
        label = fol.Classifications.from_attributes(eta_labels)
    elif isinstance(eta_labels, etad.Attribute):
        label = fol.Classification.from_attribute(eta_labels)
    elif isinstance(eta_labels, etao.DetectedObjectContainer):
        label = fol.Detections.from_detected_objects(eta_labels)
    elif isinstance(eta_labels, etao.DetectedObject):
        label = fol.Detection.from_detected_object(eta_labels)
    elif isinstance(eta_labels, etap.PolylineContainer):
        label = fol.Polylines.from_eta_polylines(eta_labels)
    elif isinstance(eta_labels, etap.Polyline):
        label = fol.Polyline.from_eta_polyline(eta_labels)
    elif isinstance(eta_labels, etak.KeypointsContainer):
        label = fol.Keypoints.from_eta_keypoints(eta_labels)
    elif isinstance(eta_labels, etak.Keypoints):
        label = fol.Keypoint.from_eta_keypoints(eta_labels)
    elif isinstance(eta_labels, etav.VideoLabels):
        label = load_video_labels(eta_labels)
    elif isinstance(eta_labels, etaf.FrameLabels):
        label = load_image_labels(eta_labels)
    elif isinstance(eta_labels, np.ndarray):
        label = fol.Segmentation.from_mask(eta_labels)
    elif eta_labels is None:
        label = None
    else:
        raise ValueError(
            "Unsupported ETA label type '%s'" % eta_labels.__class__
        )

    return label


def load_image_labels(
    image_labels_or_path,
    prefix=None,
    labels_dict=None,
    multilabel=False,
    skip_non_categorical=False,
):
    """Loads the ``eta.core.image.ImageLabels`` or
    ``eta.core.frames.FrameLabels`` into a dictionary of labels.

    Provide ``labels_dict`` if you want to customize which components of
    the labels are expanded. Otherwise, all labels are expanded as
    explained below.

    If ``multilabel`` is False, frame attributes will be stored in separate
    :class:`Classification` fields with names ``prefix + attr.name``.

    If ``multilabel`` if True, all frame attributes will be stored in a
    :class:`Classifications` field called ``prefix + "attributes"``.

    Objects are expanded into fields with names ``prefix + obj.name``, or
    ``prefix + "detections"`` for objects that do not have their ``name``
    field populated.

    Polylines are expanded into fields with names
    ``prefix + polyline.name``, or ``prefix + "polylines"`` for polylines
    that do not have their ``name`` field populated.

    Keypoints are expanded into fields with names
    ``prefix + keypoints.name``, or ``prefix + "keypoints"`` for keypoints
    that do not have their ``name`` field populated.

    Segmentation masks are expanded into a field with name ``prefix + "mask"``.

    Args:
        image_labels_or_path: can be a ``eta.core.image.ImageLabels`` instance,
            a ``eta.core.frames.FrameLabels`` instance, a serialized dict
            representation of either, or the path to either on disk
        prefix (None): a string prefix to prepend to each field name in the
            output dict
        labels_dict (None): a dictionary mapping names of labels to keys to
            assign them in the output dictionary
        multilabel (False): whether to store frame attributes in a single
            :class:`Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical
            frame attributes (True) or cast them to strings (False)

    Returns:
        a dict mapping label names to :class:`fiftyone.core.labels.ImageLabel`
        instances
    """
    if etau.is_str(image_labels_or_path):
        frame_labels = etaf.FrameLabels.from_json(image_labels_or_path)
    elif isinstance(image_labels_or_path, dict):
        frame_labels = etaf.FrameLabels.from_dict(image_labels_or_path)
    else:
        frame_labels = image_labels_or_path

    if frame_labels is None:
        return None

    if labels_dict is not None:
        return _expand_with_labels_dict(
            frame_labels, labels_dict, multilabel, skip_non_categorical
        )

    return _expand_with_prefix(
        frame_labels, prefix, multilabel, skip_non_categorical
    )


def to_image_labels(labels):
    """Converts the image label(s) to ``eta.core.image.ImageLabels`` format.

    Args:
        labels: can be a :class:`fiftyone.core.labels.ImageLabel` instance or
            a dictionary mapping names to
            :class:`fiftyone.core.labels.ImageLabel` instances

    Returns:
        an ``eta.core.image.ImageLabels`` instance
    """
    image_labels = etai.ImageLabels()

    if labels is None:
        return image_labels

    if not isinstance(labels, dict):
        labels = {"labels": labels}

    for name, label in labels.items():
        if isinstance(label, fol.ImageLabel):
            image_labels.merge_labels(label.to_image_labels(name=name))
        elif label is not None:
            msg = "Ignoring unsupported label type '%s'" % label.__class__
            warnings.warn(msg)

    return image_labels


def load_video_labels(
    video_labels_or_path,
    prefix=None,
    labels_dict=None,
    multilabel=False,
    skip_non_categorical=False,
):
    """Loads the ``eta.core.video.VideoLabels`` into a frame labels dictionary.

    Args:
        video_labels_or_path: can be a ``eta.core.video.VideoLabels`` instance,
            a serialized dict representation of one, or the path to one on disk
        prefix (None): a string prefix to prepend to each label name in the
            expanded frame label dictionaries
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the frame labels to field names into which to expand them
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False)

    Returns:
        a dictionary mapping frame numbers to dictionaries that map label
        fields to :class:`fiftyone.core.labels.Label` instances for each video
        frame
    """
    if etau.is_str(video_labels_or_path):
        video_labels = etav.VideoLabels.from_json(video_labels_or_path)
    elif isinstance(video_labels_or_path, dict):
        video_labels = etav.VideoLabels.from_dict(video_labels_or_path)
    else:
        video_labels = video_labels_or_path

    if video_labels is None:
        return None

    frames = {}
    for frame_number in video_labels:
        frames[frame_number] = load_image_labels(
            video_labels[frame_number],
            prefix=prefix,
            labels_dict=labels_dict,
            multilabel=multilabel,
            skip_non_categorical=skip_non_categorical,
        )

    return frames


def to_video_labels(frames):
    """Converts the frame labels dictionary to ``eta.core.video.VideoLabels``
    format.

    Args:
        frames: a dictionary mapping frame numbers to
            :class:`fiftyone.core.frame.Frame` instances or dictionaries
            mapping field names to :class:`fiftyone.core.labels.ImageLabel`
            instances

    Returns:
        a ``eta.core.video.VideoLabels`` instance
    """
    video_labels = etav.VideoLabels()

    if frames is None:
        return video_labels

    for frame_number, frame in frames.items():
        video_labels[frame_number] = _to_frame_labels(frame, frame_number)

    return video_labels


def _to_frame_labels(frame, frame_number):
    frame_labels = etav.VideoFrameLabels(frame_number)

    for name, label in frame.items():
        if isinstance(label, fol.ImageLabel):
            frame_labels.merge_labels(label.to_image_labels(name=name))
        elif label is not None:
            msg = "Ignoring unsupported label type '%s'" % label.__class__
            warnings.warn(msg)

    return frame_labels


def _expand_with_prefix(
    frame_labels, prefix, multilabel, skip_non_categorical
):
    if prefix is None:
        prefix = ""

    labels = {}

    #
    # Classifications
    #

    if multilabel:
        # Store frame attributes as multilabels
        # pylint: disable=no-member
        labels[prefix + "attributes"] = fol.Classifications.from_attributes(
            frame_labels.attrs, skip_non_categorical=skip_non_categorical,
        )
    else:
        # Store each frame attribute separately
        for attr in frame_labels.attrs:  # pylint: disable=no-member
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            labels[prefix + attr.name] = fol.Classification.from_attribute(
                attr
            )

    #
    # Detections
    #

    objects_map = defaultdict(etao.DetectedObjectContainer)

    for dobj in frame_labels.objects:
        objects_map[prefix + (dobj.name or "detections")].add(dobj)

    for name, objects in objects_map.items():
        # pylint: disable=no-member
        labels[name] = fol.Detections.from_detected_objects(objects)

    #
    # Polylines
    #

    polylines_map = defaultdict(etap.PolylineContainer)

    for polyline in frame_labels.polylines:
        polylines_map[prefix + (polyline.name or "polylines")].add(polyline)

    for name, polylines in polylines_map.items():
        # pylint: disable=no-member
        labels[name] = fol.Polylines.from_eta_polylines(polylines)

    #
    # Keypoints
    #

    keypoints_map = defaultdict(etak.KeypointsContainer)

    for keypoints in frame_labels.keypoints:
        keypoints_map[prefix + (keypoints.name or "keypoints")].add(keypoints)

    for name, keypoints in keypoints_map.items():
        # pylint: disable=no-member
        labels[name] = fol.Keypoints.from_eta_keypoints(keypoints)

    #
    # Segmentations
    #

    if frame_labels.has_mask:
        labels[prefix + "mask"] = fol.Segmentation.from_mask(frame_labels.mask)

    return labels


def _expand_with_labels_dict(
    frame_labels, labels_dict, multilabel, skip_non_categorical
):
    labels = {}

    #
    # Classifications
    #

    if multilabel:
        # Store frame attributes as multilabels
        attrs_map = defaultdict(etad.AttributeContainer)
        for attr in frame_labels.attrs:
            if attr.name not in labels_dict:
                continue

            attrs_map[labels_dict[attr.name]].add(attr)

        for name, attrs in attrs_map.items():
            labels[name] = fol.Classifications.from_attributes(
                attrs, skip_non_categorical=skip_non_categorical
            )
    else:
        # Store each frame attribute separately
        for attr in frame_labels.attrs:  # pylint: disable=no-member
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            if attr.name not in labels_dict:
                continue

            labels[labels_dict[attr.name]] = fol.Classification.from_attribute(
                attr
            )

    #
    # Detections
    #

    objects_map = defaultdict(etao.DetectedObjectContainer)

    for dobj in frame_labels.objects:
        if dobj.name not in labels_dict:
            continue

        objects_map[labels_dict[dobj.name]].add(dobj)

    for name, objects in objects_map.items():
        # pylint: disable=no-member
        labels[name] = fol.Detections.from_detected_objects(objects)

    #
    # Polylines
    #

    polylines_map = defaultdict(etap.PolylineContainer)

    for polyline in frame_labels.polylines:
        if polyline.name not in labels_dict:
            continue

        polylines_map[labels_dict[polyline.name]].add(polyline)

    for name, polylines in polylines_map.items():
        # pylint: disable=no-member
        labels[name] = fol.Polylines.from_eta_polylines(polylines)

    #
    # Keypoints
    #

    keypoints_map = defaultdict(etak.KeypointsContainer)

    for keypoints in frame_labels.keypoints:
        if keypoints.name not in labels_dict:
            continue

        keypoints_map[labels_dict[keypoints.name]].add(keypoints)

    for name, keypoints in keypoints_map.items():
        # pylint: disable=no-member
        labels[name] = fol.Keypoints.from_eta_keypoints(keypoints)

    #
    # Segmentations
    #

    if frame_labels.has_mask and "mask" in labels_dict:
        labels["mask"] = fol.Segmentation.from_mask(frame_labels.mask)

    return labels


def _squeeze_extra_unit_dims(embeddings):
    dims = embeddings.shape[1:]
    extra_axes = tuple(ax for ax, dim in enumerate(dims, 1) if dim == 1)

    if len(extra_axes) == len(dims):
        extra_axes = extra_axes[1:]

    if extra_axes:
        return np.squeeze(embeddings, axis=extra_axes)

    return embeddings


def _add_logits(label, logits):
    if isinstance(label, fol.Classification):
        label.logits = logits[0]
    elif isinstance(label, fol.Classifications):
        for c, l in zip(label.classifications, logits):
            c.logits = l
    elif label is not None:
        msg = "Cannot store logits on label type '%s'" % label.__class__
        warnings.warn(msg)
