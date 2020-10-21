"""
Utilities for interfacing with the
`ETA library <https://github.com/voxel51/eta>`_.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import warnings

import eta.core.data as etad
import eta.core.frames as etaf
import eta.core.keypoints as etak
import eta.core.image as etai
import eta.core.objects as etao
import eta.core.polylines as etap
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.labels as fol


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
        labels = {labels: labels}

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
            expanded frame label dictionaries. Only applicable when ``expand``
            is True
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the frame labels to field names into which to expand them. Only
            applicable when ``expand`` is True
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance. Only
            applicable when ``expand`` is True
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False). Only applicable
            when ``expand`` is True

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
    image_labels, prefix, multilabel, skip_non_categorical
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
            image_labels.attrs, skip_non_categorical=skip_non_categorical,
        )
    else:
        # Store each frame attribute separately
        for attr in image_labels.attrs:  # pylint: disable=no-member
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            labels[prefix + attr.name] = fol.Classification.from_attribute(
                attr
            )

    #
    # Detections
    #

    objects_map = defaultdict(etao.DetectedObjectContainer)

    for dobj in image_labels.objects:
        objects_map[prefix + (dobj.name or "detections")].add(dobj)

    for name, objects in objects_map.items():
        # pylint: disable=no-member
        labels[name] = fol.Detections.from_detected_objects(objects)

    #
    # Polylines
    #

    polylines_map = defaultdict(etap.PolylineContainer)

    for polyline in image_labels.polylines:
        polylines_map[prefix + (polyline.name or "polylines")].add(polyline)

    for name, polylines in polylines_map.items():
        # pylint: disable=no-member
        labels[name] = fol.Polylines.from_eta_polylines(polylines)

    #
    # Keypoints
    #

    keypoints_map = defaultdict(etak.KeypointsContainer)

    for keypoints in image_labels.keypoints:
        keypoints_map[prefix + (keypoints.name or "keypoints")].add(keypoints)

    for name, keypoints in keypoints_map.items():
        # pylint: disable=no-member
        labels[name] = fol.Keypoints.from_eta_keypoints(keypoints)

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

    return labels
