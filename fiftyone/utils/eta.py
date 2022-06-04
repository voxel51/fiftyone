"""
Utilities for interfacing with the
`ETA library <https://github.com/voxel51/eta>`_.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import warnings

import numpy as np

import eta.core.data as etad
import eta.core.events as etae
import eta.core.frames as etaf
import eta.core.frameutils as etafu
import eta.core.geometry as etag
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
            "type": "fiftyone.utils.eta.ETAModel",
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

        label = _from_eta_labels(eta_labels)

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

        labels = [_from_eta_labels(el) for el in eta_labels_batch]

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


def from_image_labels(
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
        multilabel (False): whether to store attributes in a single
            :class:`Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical
            attributes (True) or cast them to strings (False)

    Returns:
        a dict mapping names to :class:`fiftyone.core.labels.Label` instances
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


def to_image_labels(labels, warn_unsupported=True):
    """Converts the image label(s) to ``eta.core.image.ImageLabels`` format.

    Args:
        labels: a :class:`fiftyone.core.labels.Label` instance or a dict
            mapping names to :class:`fiftyone.core.labels.Label` instances
        warn_unsupported (True): whether to issue warnings if unsupported label
            values are encountered

    Returns:
        an ``eta.core.image.ImageLabels`` instance
    """
    image_labels = etai.ImageLabels()

    if labels is None:
        return image_labels

    if not isinstance(labels, dict):
        labels = {"labels": labels}

    _add_frame_labels(image_labels, labels, warn_unsupported=warn_unsupported)

    return image_labels


def from_video_labels(
    video_labels_or_path,
    prefix=None,
    labels_dict=None,
    frame_labels_dict=None,
    multilabel=False,
    skip_non_categorical=False,
):
    """Loads the ``eta.core.video.VideoLabels`` into a frame labels dictionary.

    Args:
        video_labels_or_path: can be a ``eta.core.video.VideoLabels`` instance,
            a serialized dict representation of one, or the path to one on disk
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

    Returns:
        a tuple of

        -   **label**: a dict mapping sample field names to
            :class:`fiftyone.core.labels.Label` instances
        -   **frames**: a dict mapping frame numbers to dicts that map label
            fields to :class:`fiftyone.core.labels.Label` instances
    """
    if etau.is_str(video_labels_or_path):
        video_labels = etav.VideoLabels.from_json(video_labels_or_path)
    elif isinstance(video_labels_or_path, dict):
        video_labels = etav.VideoLabels.from_dict(video_labels_or_path)
    else:
        video_labels = video_labels_or_path

    if video_labels is None:
        return None, None

    # Video labels
    if (
        video_labels.has_video_attributes or video_labels.has_video_events
    ) and (labels_dict is None or labels_dict):
        if labels_dict is not None:
            label = _expand_with_labels_dict(
                video_labels, labels_dict, multilabel, skip_non_categorical
            )
        else:
            label = _expand_with_prefix(
                video_labels, prefix, multilabel, skip_non_categorical
            )
    else:
        label = None

    # Frame labels
    if video_labels.frames and (
        frame_labels_dict is None or frame_labels_dict
    ):
        frames = {}
        for frame_number in video_labels:
            frames[frame_number] = from_image_labels(
                video_labels[frame_number],
                prefix=prefix,
                labels_dict=frame_labels_dict,
                multilabel=multilabel,
                skip_non_categorical=skip_non_categorical,
            )
    else:
        frames = None

    return label, frames


def to_video_labels(
    label=None, frames=None, support=None, warn_unsupported=True
):
    """Converts the given labels to ``eta.core.video.VideoLabels`` format.

    Args:
        label (None): video-level labels provided as a
            :class:`fiftyone.core.labels.Label` instance or dict mapping field
            names to :class:`fiftyone.core.labels.Label` instances
        frames (None): frame-level labels provided as a dict mapping frame
            numbers to dicts mapping field names to
            :class:`fiftyone.core.labels.Label` instances
        support (None): an optional ``[first, last]`` support to store on the
            returned labels
        warn_unsupported (True): whether to issue warnings if unsupported label
            values are encountered

    Returns:
        a ``eta.core.video.VideoLabels``
    """
    if support is not None:
        support = etafu.FrameRanges.build_simple(*support)

    video_labels = etav.VideoLabels(support=support)

    # Video labels
    if label is not None:
        if not isinstance(label, dict):
            label = {"labels": label}

        _add_video_labels(
            video_labels, label, warn_unsupported=warn_unsupported
        )

    # Frame labels
    if frames is not None:
        for frame_number, frame in frames.items():
            frame_labels = etav.VideoFrameLabels(frame_number)

            _add_frame_labels(
                frame_labels, frame, warn_unsupported=warn_unsupported
            )

            video_labels[frame_number] = frame_labels

    return video_labels


def to_attribute(classification, name=None):
    """Returns an ``eta.core.data.Attribute`` representation of the
    :class:`fiftyone.core.labels.Classification`.

    Args:
        classification: a :class:`fiftyone.core.labels.Classification`
        name (None): the name of the label field

    Returns:
        a ``eta.core.data.CategoricalAttribute``
    """
    return etad.CategoricalAttribute(
        name,
        classification.label,
        confidence=classification.confidence,
        tags=classification.tags,
    )


def from_attribute(attr):
    """Creates a :class:`fiftyone.core.labels.Classification` from an
    ``eta.core.data.Attribute``.

    The attribute value is cast to a string, if necessary.

    Args:
        attr: an ``eta.core.data.Attribute``

    Returns:
        a :class:`fiftyone.core.labels.Classification`
    """
    classification = fol.Classification(label=str(attr.value))

    try:
        classification.confidence = attr.confidence
    except:
        pass

    return classification


def from_attributes(attrs, skip_non_categorical=False):
    """Creates a :class:`fiftyone.core.labels.Classifications` from a list of
    attributes.

    Args:
        attrs: an iterable of ``eta.core.data.Attribute`` instances
        skip_non_categorical (False): whether to skip non-categorical
            attributes (True) or cast all attribute values to strings
            (False)

    Returns:
        a :class:`fiftyone.core.labels.Classifications`
    """
    classifications = []
    for attr in attrs:
        if skip_non_categorical and not etau.is_str(attr.value):
            continue

        classifications.append(from_attribute(attr))

    return fol.Classifications(classifications=classifications)


def to_detected_object(detection, name=None, extra_attrs=True):
    """Returns an ``eta.core.objects.DetectedObject`` representation of the
    given :class:`fiftyone.core.labels.Detection`.

    Args:
        detection: a :class:`fiftyone.core.labels.Detection`
        name (None): the name of the label field
        extra_attrs (True): whether to include custom attributes in the
            conversion

    Returns:
        an ``eta.core.objects.DetectedObject``
    """
    label = detection.label
    index = detection.index

    # pylint: disable=unpacking-non-sequence
    tlx, tly, w, h = detection.bounding_box
    brx = tlx + w
    bry = tly + h
    bounding_box = etag.BoundingBox.from_coords(tlx, tly, brx, bry)

    mask = detection.mask
    confidence = detection.confidence

    attrs = _to_eta_attributes(detection, extra_attrs=extra_attrs)

    return etao.DetectedObject(
        label=label,
        index=index,
        bounding_box=bounding_box,
        mask=mask,
        confidence=confidence,
        name=name,
        attrs=attrs,
        tags=detection.tags,
    )


def from_detected_object(dobj):
    """Creates a :class:`fiftyone.core.labels.Detection` from an
    ``eta.core.objects.DetectedObject``.

    Args:
        dobj: a ``eta.core.objects.DetectedObject``

    Returns:
        a :class:`fiftyone.core.labels.Detection`
    """
    xtl, ytl, xbr, ybr = dobj.bounding_box.to_coords()
    bounding_box = [xtl, ytl, (xbr - xtl), (ybr - ytl)]

    attributes = _from_eta_attributes(dobj.attrs)

    return fol.Detection(
        label=dobj.label,
        bounding_box=bounding_box,
        confidence=dobj.confidence,
        index=dobj.index,
        mask=dobj.mask,
        tags=dobj.tags,
        **attributes,
    )


def from_detected_objects(objects):
    """Creates a :class:`fiftyone.core.labels.Detections` from an
    ``eta.core.objects.DetectedObjectContainer``.

    Args:
        objects: a ``eta.core.objects.DetectedObjectContainer``

    Returns:
        a :class:`fiftyone.core.labels.Detections`
    """
    return fol.Detections(
        detections=[from_detected_object(dobj) for dobj in objects]
    )


def to_polyline(polyline, name=None, extra_attrs=True):
    """Returns an ``eta.core.polylines.Polyline`` representation of the given
    :class:`fiftyone.core.labels.Polyline`.

    Args:
        polyline: a :class:`fiftyone.core.labels.Polyline`
        name (None): the name of the label field
        extra_attrs (True): whether to include custom attributes in the
            conversion

    Returns:
        an ``eta.core.polylines.Polyline``
    """
    attrs = _to_eta_attributes(polyline, extra_attrs=extra_attrs)

    return etap.Polyline(
        label=polyline.label,
        confidence=polyline.confidence,
        index=polyline.index,
        name=name,
        points=polyline.points,
        closed=polyline.closed,
        filled=polyline.filled,
        attrs=attrs,
        tags=polyline.tags,
    )


def from_polyline(polyline):
    """Creates a :class:`fiftyone.core.labels.Polyline` from an
    ``eta.core.polylines.Polyline``.

    Args:
        polyline: an ``eta.core.polylines.Polyline``

    Returns:
        a :class:`fiftyone.core.labels.Polyline`
    """
    attributes = _from_eta_attributes(polyline.attrs)

    return fol.Polyline(
        label=polyline.label,
        points=polyline.points,
        confidence=polyline.confidence,
        index=polyline.index,
        closed=polyline.closed,
        filled=polyline.filled,
        tags=polyline.tags,
        **attributes,
    )


def from_polylines(polylines):
    """Creates a :class:`fiftyone.core.labels.Polylines` from an
    ``eta.core.polylines.PolylineContainer``.

    Args:
        polylines: an ``eta.core.polylines.PolylineContainer``

    Returns:
        a :class:`fiftyone.core.labels.Polylines`
    """
    return fol.Polylines(polylines=[from_polyline(p) for p in polylines])


def to_keypoints(keypoint, name=None, extra_attrs=True):
    """Returns an ``eta.core.keypoints.Keypoints`` representation of the given
    :class:`fiftyone.core.labels.Keypoint`.

    Args:
        keypoint: a :class:`fiftyone.core.labels.Keypoint`
        name (None): the name of the label field
        extra_attrs (True): whether to include custom attributes in the
            conversion

    Returns:
        an ``eta.core.keypoints.Keypoints``
    """
    attrs = _to_eta_attributes(keypoint, extra_attrs=extra_attrs)

    return etak.Keypoints(
        name=name,
        label=keypoint.label,
        index=keypoint.index,
        points=keypoint.points,
        confidence=keypoint.confidence,
        attrs=attrs,
        tags=keypoint.tags,
    )


def from_keypoint(keypoints):
    """Creates a :class:`fiftyone.core.labels.Keypoint` from an
    ``eta.core.keypoints.Keypoints``.

    Args:
        keypoints: an ``eta.core.keypoints.Keypoints``

    Returns:
        a :class:`fiftyone.core.labels.Keypoint`
    """
    attributes = _from_eta_attributes(keypoints.attrs)

    return fol.Keypoint(
        label=keypoints.label,
        points=keypoints.points,
        confidence=keypoints.confidence,
        index=keypoints.index,
        tags=keypoints.tags,
        **attributes,
    )


def from_keypoints(keypoints):
    """Creates a :class:`fiftyone.core.labels.Keypoints` from an
    ``eta.core.keypoints.KeypointsContainer``.

    Args:
        keypoints: an ``eta.core.keypoints.KeypointsContainer``

    Returns:
        a :class:`fiftyone.core.labels.Keypoints`
    """
    return fol.Keypoints(keypoints=[from_keypoint(k) for k in keypoints])


def to_video_event(temporal_detection, name=None, extra_attrs=True):
    """Returns an ``eta.core.events.VideoEvent`` representation of the given
    :class:`fiftyone.core.labels.TemporalDetection`.

    Args:
        temporal_detection: a :class:`fiftyone.core.labels.TemporalDetection`
        name (None): the name of the label field
        extra_attrs (True): whether to include custom attributes in the
            conversion

    Returns:
        an ``eta.core.events.VideoEvent``
    """
    support = etafu.FrameRanges.build_simple(*temporal_detection.support)
    attrs = _to_eta_attributes(temporal_detection, extra_attrs=extra_attrs)

    return etae.VideoEvent(
        label=temporal_detection.label,
        confidence=temporal_detection.confidence,
        name=name,
        support=support,
        attrs=attrs,
        tags=temporal_detection.tags,
    )


def from_video_event(video_event):
    """Creates a :class:`fiftyone.core.labels.TemporalDetection` from an
    ``eta.core.events.VideoEvent``.

    Args:
        video_event: an ``eta.core.events.VideoEvent``

    Returns:
        a :class:`fiftyone.core.labels.TemporalDetection`
    """
    if video_event.support:
        support = list(video_event.support.limits)
    else:
        support = None

    attributes = _from_eta_attributes(video_event.attrs)

    return fol.TemporalDetection(
        label=video_event.label,
        support=support,
        confidence=video_event.confidence,
        tags=video_event.tags,
        **attributes,
    )


def from_video_events(video_events):
    """Creates a :class:`fiftyone.core.labels.TemporalDetections` from an
    ``eta.core.events.VideoEventContainer``.

    Args:
        video_events: an ``eta.core.events.VideoEventContainer``

    Returns:
        a :class:`fiftyone.core.labels.TemporalDetections`
    """
    return fol.TemporalDetections(
        detections=[from_video_event(e) for e in video_events]
    )


def _add_frame_labels(frame_labels, labels, warn_unsupported=True):
    for name, label in labels.items():
        if isinstance(label, fol.Classification):
            frame_labels.add_attribute(to_attribute(label, name=name))
        elif isinstance(label, fol.Classifications):
            for classification in label.classifications:
                attr = to_attribute(classification, name=name)
                frame_labels.add_attribute(attr)
        elif isinstance(label, fol.Detection):
            frame_labels.add_object(to_detected_object(label, name=name))
        elif isinstance(label, fol.Detections):
            for detection in label.detections:
                dobj = to_detected_object(detection, name=name)
                frame_labels.add_object(dobj)
        elif isinstance(label, fol.Polyline):
            frame_labels.add_polyline(to_polyline(label, name=name))
        elif isinstance(label, fol.Polylines):
            for polyline in label.polylines:
                poly = to_polyline(polyline, name=name)
                frame_labels.add_polyline(poly)
        elif isinstance(label, fol.Keypoint):
            frame_labels.add_keypoints(to_keypoints(label, name=name))
        elif isinstance(label, fol.Keypoints):
            for keypoint in label.keypoints:
                kp = to_keypoints(keypoint, name=name)
                frame_labels.add_keypoints(kp)
        elif isinstance(label, fol.Segmentation):
            frame_labels.mask = label.mask
            frame_labels.tags.extend(label.tags)
        elif warn_unsupported and label is not None:
            msg = "Ignoring unsupported label type '%s'" % label.__class__
            warnings.warn(msg)

    return frame_labels


def _add_video_labels(video_labels, labels, warn_unsupported=True):
    for name, label in labels.items():
        if isinstance(label, fol.Classification):
            video_labels.add_video_attribute(to_attribute(label, name=name))
        elif isinstance(label, fol.Classifications):
            for classification in label.classifications:
                attr = to_attribute(classification, name=name)
                video_labels.add_video_attribute(attr)
        elif isinstance(label, fol.TemporalDetection):
            video_labels.add_event(to_video_event(label, name=name))
        elif isinstance(label, fol.TemporalDetections):
            for detection in label.detections:
                event = to_video_event(detection, name=name)
                video_labels.add_event(event)
        elif warn_unsupported and label is not None:
            msg = "Ignoring unsupported label type '%s'" % label.__class__
            warnings.warn(msg)


def _from_eta_labels(eta_labels):
    if isinstance(eta_labels, etad.AttributeContainer):
        label = from_attributes(eta_labels)
    elif isinstance(eta_labels, etad.Attribute):
        label = from_attribute(eta_labels)
    elif isinstance(eta_labels, etao.DetectedObjectContainer):
        label = from_detected_objects(eta_labels)
    elif isinstance(eta_labels, etao.DetectedObject):
        label = from_detected_object(eta_labels)
    elif isinstance(eta_labels, etap.PolylineContainer):
        label = from_polylines(eta_labels)
    elif isinstance(eta_labels, etap.Polyline):
        label = from_polyline(eta_labels)
    elif isinstance(eta_labels, etak.KeypointsContainer):
        label = from_keypoints(eta_labels)
    elif isinstance(eta_labels, etak.Keypoints):
        label = from_keypoint(eta_labels)
    elif isinstance(eta_labels, etae.VideoEventContainer):
        label = from_video_events(eta_labels)
    elif isinstance(eta_labels, etae.VideoEvent):
        label = from_video_event(eta_labels)
    elif isinstance(eta_labels, etav.VideoLabels):
        _, label = from_video_labels(eta_labels)  # only frame labels
    elif isinstance(eta_labels, etaf.FrameLabels):
        label = from_image_labels(eta_labels)
    elif isinstance(eta_labels, np.ndarray):
        label = fol.Segmentation(mask=eta_labels)
    elif eta_labels is None:
        label = None
    else:
        raise ValueError(
            "Unsupported ETA label type '%s'" % eta_labels.__class__
        )

    return label


def _from_eta_attributes(attrs):
    return {a.name: a.value for a in attrs}


def _to_eta_attributes(label, extra_attrs=True, warn_unsupported=True):
    attrs = etad.AttributeContainer()

    if not extra_attrs:
        return attrs

    for name, value in label.iter_attributes():
        if etau.is_str(value):
            attrs.add(etad.CategoricalAttribute(name, value))
        elif etau.is_numeric(value):
            attrs.add(etad.NumericAttribute(name, value))
        elif isinstance(value, bool):
            attrs.add(etad.BooleanAttribute(name, value))
        elif warn_unsupported and value is not None:
            msg = "Ignoring unsupported attribute type '%s'" % type(value)
            warnings.warn(msg)

    return attrs


def _expand_with_prefix(
    video_or_frame_labels, prefix, multilabel, skip_non_categorical
):
    if prefix is None:
        prefix = ""

    labels = {}

    #
    # Classifications (both)
    #

    if multilabel:
        # Store frame attributes as multilabels
        labels[prefix + "attributes"] = from_attributes(
            video_or_frame_labels.attrs,
            skip_non_categorical=skip_non_categorical,
        )
    else:
        # Store each frame attribute separately
        for attr in video_or_frame_labels.attrs:
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            labels[prefix + attr.name] = from_attribute(attr)

    #
    # Temporal detections (video labels only)
    #

    if isinstance(video_or_frame_labels, etav.VideoLabels):
        events_map = defaultdict(etae.VideoEventContainer)

        for event in video_or_frame_labels.events:
            events_map[prefix + (event.name or "events")].add(event)

        for name, events in events_map.items():
            labels[name] = from_video_events(events)

        return labels

    #
    # Detections (frame labels only)
    #

    objects_map = defaultdict(etao.DetectedObjectContainer)

    for dobj in video_or_frame_labels.objects:
        objects_map[prefix + (dobj.name or "detections")].add(dobj)

    for name, objects in objects_map.items():
        labels[name] = from_detected_objects(objects)

    #
    # Polylines (frame labels only)
    #

    polylines_map = defaultdict(etap.PolylineContainer)

    for polyline in video_or_frame_labels.polylines:
        polylines_map[prefix + (polyline.name or "polylines")].add(polyline)

    for name, polylines in polylines_map.items():
        labels[name] = from_polylines(polylines)

    #
    # Keypoints (frame labels only)
    #

    keypoints_map = defaultdict(etak.KeypointsContainer)

    for keypoints in video_or_frame_labels.keypoints:
        keypoints_map[prefix + (keypoints.name or "keypoints")].add(keypoints)

    for name, keypoints in keypoints_map.items():
        labels[name] = from_keypoints(keypoints)

    #
    # Segmentations (frame labels only)
    #

    if video_or_frame_labels.has_mask:
        labels[prefix + "mask"] = fol.Segmentation(
            mask=video_or_frame_labels.mask
        )

    return labels


def _expand_with_labels_dict(
    video_or_frame_labels, labels_dict, multilabel, skip_non_categorical
):
    labels = {}

    #
    # Classifications (both)
    #

    if multilabel:
        # Store frame attributes as multilabels
        attrs_map = defaultdict(etad.AttributeContainer)
        for attr in video_or_frame_labels.attrs:
            if attr.name not in labels_dict:
                continue

            attrs_map[labels_dict[attr.name]].add(attr)

        for name, attrs in attrs_map.items():
            labels[name] = from_attributes(
                attrs, skip_non_categorical=skip_non_categorical
            )
    else:
        # Store each frame attribute separately
        for attr in video_or_frame_labels.attrs:
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            if attr.name not in labels_dict:
                continue

            labels[labels_dict[attr.name]] = from_attribute(attr)

    #
    # Temporal detections (video labels only)
    #

    if isinstance(video_or_frame_labels, etav.VideoLabels):
        events_map = defaultdict(etae.VideoEventContainer)

        for event in video_or_frame_labels.events:
            if event.name not in labels_dict:
                continue

            events_map[labels_dict[event.name]].add(event)

        for name, events in events_map.items():
            labels[name] = from_video_events(events)

        return labels

    #
    # Detections (frame labels only)
    #

    objects_map = defaultdict(etao.DetectedObjectContainer)

    for dobj in video_or_frame_labels.objects:
        if dobj.name not in labels_dict:
            continue

        objects_map[labels_dict[dobj.name]].add(dobj)

    for name, objects in objects_map.items():
        labels[name] = from_detected_objects(objects)

    #
    # Polylines (frame labels only)
    #

    polylines_map = defaultdict(etap.PolylineContainer)

    for polyline in video_or_frame_labels.polylines:
        if polyline.name not in labels_dict:
            continue

        polylines_map[labels_dict[polyline.name]].add(polyline)

    for name, polylines in polylines_map.items():
        labels[name] = from_polylines(polylines)

    #
    # Keypoints (frame labels only)
    #

    keypoints_map = defaultdict(etak.KeypointsContainer)

    for keypoints in video_or_frame_labels.keypoints:
        if keypoints.name not in labels_dict:
            continue

        keypoints_map[labels_dict[keypoints.name]].add(keypoints)

    for name, keypoints in keypoints_map.items():
        labels[name] = from_keypoints(keypoints)

    #
    # Segmentations (frame labels only)
    #

    if video_or_frame_labels.has_mask and "mask" in labels_dict:
        labels["mask"] = fol.Segmentation(mask=video_or_frame_labels.mask)

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
